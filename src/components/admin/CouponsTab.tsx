'use client'

import { useState, useEffect } from 'react'
import { Plus, Minus, Undo2 } from 'lucide-react'
import { UserProfile, MealCouponAccount, isChurchMember } from '../../lib/mockData'
import { dbFetchMealCoupons, dbUpdateMealCoupon } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { todayLocalDateStr } from '../../lib/dateUtils'
import { FAMILY_ROLE_ORDER } from '../../lib/adminHelpers'

interface CouponsTabProps {
  allUsers: UserProfile[]
  showToast: (msg: string) => void
}

export default function CouponsTab({ allUsers, showToast }: CouponsTabProps) {
  // ── 쿠폰 (DB에서만 로드, 초기값 빈 객체) ──
  const [couponAccounts, setCouponAccounts] = useState<Record<string, MealCouponAccount>>({})

  // 마이페이지 탭과 캐시를 공유해 반복 조회하지 않음
  const { data: mealCoupons } = useCachedQuery('mealCoupons', () => dbFetchMealCoupons())
  useEffect(() => {
    if (mealCoupons && Object.keys(mealCoupons).length > 0) setCouponAccounts(mealCoupons)
  }, [mealCoupons])

  // 진행 중인 가정 id (같은 가정 버튼 중복 클릭 방지)
  const [pendingFamilyId, setPendingFamilyId] = useState<string | null>(null)

  // ── 되돌리기 ──
  // 🐛 과거 불편: 식사 줄에서 빠르게 누르다 보면 옆 가정 버튼을 잘못 눌러도
  //    되돌릴 방법이 없어서, 관리자에게 따로 부탁하거나 그냥 넘어갔습니다.
  // → 마지막 발급/차감 1건을 기억해 두고, 한 번에 되돌릴 수 있게 합니다.
  const [lastAction, setLastAction] = useState<
    { famId: string; famName: string; applied: number; at: number } | null
  >(null)
  const [isUndoing, setIsUndoing] = useState(false)

  // 오래된 되돌리기 안내는 스스로 사라집니다 (한참 뒤에 눌러 엉뚱한 결과가 나는 것 방지)
  useEffect(() => {
    if (!lastAction) return
    const timer = setTimeout(() => setLastAction(null), 60_000)
    return () => clearTimeout(timer)
  }, [lastAction])

  const handleUpdateCoupon = async (famId: string, familyName: string, delta: number, isUndo = false) => {
    if (pendingFamilyId) return // 다른 요청 진행 중이면 무시 (연타로 인한 이중 차감 방지)
    const famName = familyName || couponAccounts[famId]?.familyName || famId
    const shortName = famName.replace(' 가정', '')

    // 차감은 되돌리기 어려우므로 대상과 수량을 확인합니다.
    // (되돌리기 버튼으로 들어온 경우는 이미 의도가 확인되었으므로 건너뜁니다)
    if (delta < 0 && !isUndo) {
      const cur = couponAccounts[famId]?.balance ?? 0
      if (cur <= 0) {
        showToast(`⚠️ ${shortName}: 남은 쿠폰이 없습니다.`)
        return
      }
      if (!confirm(`${shortName} 가정에서 쿠폰 ${Math.abs(delta)}장을 차감합니다.\n(${cur}장 → ${cur + delta}장)`)) return
    }

    setPendingFamilyId(famId)
    const res = await dbUpdateMealCoupon(famId, famName, delta, isUndo ? '되돌리기' : undefined)
    setPendingFamilyId(null)

    // 🐛 과거 버그: 저장 실패를 전혀 확인하지 않고 화면 숫자를 바꾸고
    // "🎟️ +10장 발급 (잔여: 10장)" 토스트를 띄웠습니다. 실제로는 저장되지 않아
    // 그 가정은 식사 줄에서 식권을 받지 못합니다.
    if (res.error || res.balance === null) {
      showToast(`⚠️ ${shortName}: 저장하지 못했습니다. 다시 시도해 주세요.`)
      return
    }

    const applied = res.applied
    const newBal = res.balance

    setCouponAccounts(prev => {
      const prevAcc = prev[famId]
      const prevHist = prevAcc?.history || []
      // 실제로 반영된 수량(applied)만 내역에 기록합니다.
      // (잔액이 부족해 일부만 차감된 경우 요청값과 다를 수 있습니다)
      const nextHist = applied !== 0
        ? [...prevHist, {
            id: `h_${Date.now()}`,
            dateStr: todayLocalDateStr(),
            // 방금 처리한 가정이 곧바로 맨 위로 올라오도록 시각도 함께 기록합니다.
            at: new Date().toISOString(),
            type: (applied > 0 ? 'GRANT' : 'USE') as 'GRANT' | 'USE',
            amount: Math.abs(applied),
            note: isUndo
              ? '되돌리기'
              : (applied > 0 ? (applied === 10 ? '관리자 10장 발급' : '관리자 발급') : '식사 사용/차감')
          }]
        : prevHist
      return {
        ...prev,
        [famId]: {
          familyGroupId: famId,
          familyName: famName,
          balance: newBal,
          history: nextHist
        }
      }
    })

    if (applied === 0) {
      showToast(`${shortName}: 변경된 내용이 없습니다 (잔여: ${newBal}장)`)
      if (isUndo) setLastAction(null)
      return
    }

    if (isUndo) {
      // 되돌리기를 또 되돌리면 헷갈리므로 여기서 끝냅니다.
      setLastAction(null)
      showToast(`↩️ ${shortName}: 되돌렸습니다 (잔여: ${newBal}장)`)
    } else {
      setLastAction({ famId, famName, applied, at: Date.now() })
      showToast(`🎟️ ${shortName}: ${applied > 0 ? `+${applied}장 발급` : `${applied}장 차감`} (잔여: ${newBal}장)`)
    }
  }

  const handleUndo = async () => {
    if (!lastAction || isUndoing || pendingFamilyId) return
    setIsUndoing(true)
    await handleUpdateCoupon(lastAction.famId, lastAction.famName, -lastAction.applied, true)
    setIsUndoing(false)
  }

  // ── 쿠폰구매 QR 모달 ──
  const [showQrModal, setShowQrModal] = useState(false)
  const MEAL_QR_IMAGE_URL = 'https://isbwfpokewammwiicxqr.supabase.co/storage/v1/object/public/church-assets/photos/meal_account.jpg'

  return (
    <>
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs text-gray-900">🎟️ 식사쿠폰 발급 / 차감</h3>
          <button
            onClick={() => setShowQrModal(true)}
            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold rounded-lg shadow-2xs flex items-center gap-1 transition-all"
          >
            💳 쿠폰구매 (QR/계좌)
          </button>
        </div>
        <p className="text-[10px] text-gray-400">승인된 가정별 쿠폰 잔액을 관리합니다. +/- 버튼으로 발급/차감하세요.</p>

        {/* 방금 한 작업을 한 번에 되돌리는 막대 (1분 뒤 자동으로 사라집니다) */}
        {lastAction && (
          <div className="flex items-center gap-2 bg-slate-800 text-white rounded-xl px-3 py-2 animate-fade-in">
            <span className="text-[11px] flex-1 leading-snug">
              방금 <strong>{lastAction.famName.replace(' 가정', '')}</strong>
              {lastAction.applied > 0 ? ` +${lastAction.applied}장 발급` : ` ${lastAction.applied}장 차감`}
            </span>
            <button
              onClick={handleUndo}
              disabled={isUndoing || pendingFamilyId !== null}
              className="px-2.5 py-1.5 bg-white text-slate-800 text-[11px] font-bold rounded-lg flex items-center gap-1 shrink-0 disabled:opacity-50 active:scale-95 transition-all"
            >
              <Undo2 size={12} /> {isUndoing ? '되돌리는 중...' : '되돌리기'}
            </button>
            <button
              onClick={() => setLastAction(null)}
              className="p-1.5 -m-0.5 text-slate-400 hover:text-white shrink-0"
              title="닫기"
            >✕</button>
          </div>
        )}
        <div className="space-y-2">
          {(() => {
            // DB 쿠폰 계정 + allUsers 가정 그룹을 병합하여 전체 표시 (조부/조모/부/모/자녀 순 정렬)
            // 업무용 계정(쿠폰관리자)은 성도 명단이 아니므로 식권 대상에서 뺍니다.
            const approvedUsers = allUsers.filter(u => isChurchMember(u.role))
            const familyMap: Record<string, string> = {}
            const groupMembers: Record<string, UserProfile[]> = {}

            approvedUsers.forEach(u => {
              const fid = u.familyGroupId || `fam_single_${u.id}`
              if (!groupMembers[fid]) groupMembers[fid] = []
              groupMembers[fid].push(u)
            })

            Object.entries(groupMembers).forEach(([fid, memberList]) => {
              if (fid.startsWith('fam_single_')) {
                familyMap[fid] = `${memberList[0].name}님 가정`
              } else {
                // 호칭 순서(조부 -> 조모 -> 부 -> 모 -> 자녀)로 정렬
                const sorted = [...memberList].sort((a, b) => {
                  const orderA = FAMILY_ROLE_ORDER[a.familyRole || ''] || 10
                  const orderB = FAMILY_ROLE_ORDER[b.familyRole || ''] || 10
                  return orderA - orderB
                })
                // 괄호 없이 순수 이름만 조합하여 표시: "홍길동 · 김영희 · 홍은혜 가정"
                const nameStr = sorted.map(m => m.name).join(' · ')
                familyMap[fid] = sorted.length > 1 ? `${nameStr} 가정` : `${nameStr} 가정`
              }
            })

            const mergedAccounts: Record<string, MealCouponAccount> = {}
            // DB에 있는 쿠폰 계정 먼저
            Object.entries(couponAccounts).forEach(([fid, acc]) => {
              // 이름이 familyMap에 정의되어 있으면 최신 가족 구성원 명칭 우선 적용
              mergedAccounts[fid] = {
                ...acc,
                familyName: familyMap[fid] || acc.familyName || fid
              }
            })
            // DB에 아직 발급 이력이 없는 가정 추가 (잔액 0)
            Object.entries(familyMap).forEach(([fid, fname]) => {
              if (!mergedAccounts[fid]) {
                mergedAccounts[fid] = { familyGroupId: fid, familyName: fname, balance: 0, history: [] }
              }
            })

            const entries = Object.values(mergedAccounts)
            if (entries.length === 0) {
              return <p className="text-xs text-gray-400 text-center py-4">승인된 성도가 없습니다.</p>
            }

            // 최근에 발급/차감한 가정이 위로 오도록 정렬합니다.
            // 🐛 과거 문제: 날짜(연-월-일)만 비교해서, 주일 아침에 여러 가정을 연달아
            // 처리하면 전부 같은 날짜라 순서가 뒤죽박죽이 됐습니다. 방금 처리한 가정이
            // 맨 위로 안 올라와서 봉사자가 헷갈렸습니다.
            // → 저장 시각(at)까지 비교합니다. (DB에는 원래 시각이 있었는데 안 쓰고 있었습니다)
            const lastTouchedAt = (acc: MealCouponAccount): string => {
              const last = acc.history && acc.history.length > 0 ? acc.history[acc.history.length - 1] : null
              if (!last) return ''
              return last.at || last.dateStr || ''
            }
            const sortedEntries = [...entries].sort((a, b) => {
              const aAt = lastTouchedAt(a)
              const bAt = lastTouchedAt(b)
              if (aAt && bAt) return bAt.localeCompare(aAt)
              // 내역이 아예 없는 가정은 맨 아래, 그 안에서는 이름 가나다순
              if (aAt) return -1
              if (bAt) return 1
              return a.familyName.localeCompare(b.familyName)
            })

            return sortedEntries.map((acc) => {
              return (
                <div key={acc.familyGroupId} className="p-3 bg-gray-50 rounded-xl flex items-center justify-between text-xs hover:bg-gray-100/70 transition-all">
                  <div>
                    {/* 발급/차감 날짜 뱃지는 뺐습니다 — 최근 사용순으로 정렬되므로 순서만 보면 됩니다. */}
                    <h4 className="font-bold text-gray-800">{acc.familyName}</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">잔여 쿠폰: <strong className="text-[#335f87]">{acc.balance}장</strong></p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleUpdateCoupon(acc.familyGroupId, acc.familyName, -1)}
                      disabled={pendingFamilyId !== null}
                      className="w-9 h-9 bg-white border border-gray-200 text-gray-600 rounded-lg font-bold flex items-center justify-center hover:bg-gray-100 shadow-2xs active:scale-95 disabled:opacity-40"
                      title="1장 차감"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-bold text-[#335f87] w-6 text-center text-sm">{acc.balance}</span>
                    <button
                      onClick={() => handleUpdateCoupon(acc.familyGroupId, acc.familyName, 1)}
                      disabled={pendingFamilyId !== null}
                      className="w-9 h-9 bg-white border border-gray-200 text-gray-600 rounded-lg font-bold flex items-center justify-center hover:bg-gray-100 shadow-2xs active:scale-95 disabled:opacity-40"
                      title="1장 발급"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => handleUpdateCoupon(acc.familyGroupId, acc.familyName, 10)}
                      disabled={pendingFamilyId !== null}
                      className="px-2.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-lg shadow-2xs active:scale-95 transition-all disabled:opacity-40"
                      title="10장 일괄 발급"
                    >
                      +10장
                    </button>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* ── 쿠폰구매 QR 모달 ── */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">💳 식사쿠폰 구매 (QR/계좌)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">QR코드를 스캔하거나 계좌로 입금해 주세요.</p>
              </div>
              <button onClick={() => setShowQrModal(false)} className="p-1 hover:bg-white/10 rounded-lg transition-all text-white font-bold">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden">
                <img
                  src={MEAL_QR_IMAGE_URL}
                  alt="식사쿠폰 구매 QR코드"
                  className="w-full h-auto max-h-[380px] object-contain rounded-lg shadow-2xs"
                />
              </div>
              <p className="text-[11px] text-gray-500 text-center leading-relaxed">
                입금 후 관리자에게 말씀해 주시면 쿠폰이 즉시 발급됩니다.
              </p>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-full py-2.5 bg-[#335f87] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#2b5072] transition-all"
              >
                확인 / 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
