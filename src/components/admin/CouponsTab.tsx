'use client'

import { useState, useEffect, useMemo, useId } from 'react'
import { Plus, Minus, Undo2 } from 'lucide-react'
import { UserProfile, MealCouponAccount, isChurchMember } from '../../lib/mockData'
import { dbFetchMealCoupons, dbUpdateMealCoupon } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { todayLocalDateStr } from '../../lib/dateUtils'
import { FAMILY_ROLE_ORDER } from '../../lib/adminHelpers'
import { useModalDismiss } from '../../lib/useModalDismiss'
import Card from '../ui/Card'
import SectionTitle from '../ui/SectionTitle'
import Modal from '../ui/Modal'

interface CouponsTabProps {
  allUsers: UserProfile[]
  showToast: (msg: string) => void
}

export default function CouponsTab({ allUsers, showToast }: CouponsTabProps) {
  // ── 쿠폰 (DB에서만 로드, 초기값 빈 객체) ──
  // 마이페이지 탭과 캐시를 공유해 반복 조회하지 않음
  const { data: mealCoupons } = useCachedQuery('mealCoupons', () => dbFetchMealCoupons())
  const [couponAccountsOverride, setCouponAccountsOverride] = useState<Record<string, MealCouponAccount> | null>(null)
  const couponAccounts = useMemo(() => couponAccountsOverride ?? (mealCoupons || {}), [couponAccountsOverride, mealCoupons])

  // DB 쿠폰 계정 + allUsers 가정 그룹을 병합하여 전체 명단을 만듭니다. (드롭박스와 하단 목록이 함께 씁니다)
  // 업무용 계정(쿠폰관리자)은 성도 명단이 아니므로 식권 대상에서 뺍니다.
  const accountsById = useMemo(() => {
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
        familyMap[fid] = `${sorted.map(m => m.name).join(' · ')} 가정`
      }
    })

    const merged: Record<string, MealCouponAccount> = {}
    // DB에 있는 쿠폰 계정 먼저
    Object.entries(couponAccounts).forEach(([fid, acc]) => {
      // 이름이 familyMap에 정의되어 있으면 최신 가족 구성원 명칭 우선 적용
      merged[fid] = { ...acc, familyName: familyMap[fid] || acc.familyName || fid }
    })
    // DB에 아직 발급 이력이 없는 가정 추가 (잔액 0)
    Object.entries(familyMap).forEach(([fid, fname]) => {
      if (!merged[fid]) {
        merged[fid] = { familyGroupId: fid, familyName: fname, balance: 0, history: [] }
      }
    })
    return merged
  }, [allUsers, couponAccounts])

  // 하단 목록: 최근에 발급/차감한 가정이 위로 오도록 정렬합니다.
  // 🐛 과거 문제: 날짜(연-월-일)만 비교해서, 주일 아침에 여러 가정을 연달아
  // 처리하면 전부 같은 날짜라 순서가 뒤죽박죽이 됐습니다. 방금 처리한 가정이
  // 맨 위로 안 올라와서 봉사자가 헷갈렸습니다.
  // → 저장 시각(at)까지 비교합니다. (DB에는 원래 시각이 있었는데 안 쓰고 있었습니다)
  const sortedEntries = useMemo(() => {
    const lastTouchedAt = (acc: MealCouponAccount): string => {
      const last = acc.history && acc.history.length > 0 ? acc.history[acc.history.length - 1] : null
      if (!last) return ''
      return last.at || last.dateStr || ''
    }
    return Object.values(accountsById).sort((a, b) => {
      const aAt = lastTouchedAt(a)
      const bAt = lastTouchedAt(b)
      if (aAt && bAt) return bAt.localeCompare(aAt)
      // 내역이 아예 없는 가정은 맨 아래, 그 안에서는 이름 가나다순
      if (aAt) return -1
      if (bAt) return 1
      return a.familyName.localeCompare(b.familyName)
    })
  }, [accountsById])

  // 상단 드롭박스는 이름 가나다순입니다. (하단 목록은 최근 처리순이라 별도로 정렬)
  // 끝의 "님 가정"/" 가정"은 빼고 이름만 비교해, "이민아님 가정"과 "이민아 · 김영희 가정"처럼
  // 꼬리 글자 때문에 순서가 어긋나지 않게 합니다.
  const pickerEntries = useMemo(() => {
    const nameKey = (acc: MealCouponAccount) => acc.familyName.replace(/(님)? 가정$/, '')
    const collator = new Intl.Collator('ko')
    return [...sortedEntries].sort((a, b) => collator.compare(nameKey(a), nameKey(b)))
  }, [sortedEntries])

  // ── 발급/차감 입력 (가정 선택 + 수량) ──
  const formId = useId()
  const [selectedFamId, setSelectedFamId] = useState('')
  const [amountText, setAmountText] = useState('')
  const amount = amountText === '' ? 0 : parseInt(amountText, 10)
  const selectedAccount = selectedFamId ? accountsById[selectedFamId] : undefined

  // 진행 중인 가정 id (같은 가정 버튼 중복 클릭 방지)
  const [pendingFamilyId, setPendingFamilyId] = useState<string | null>(null)

  const handleSubmitAmount = async (sign: 1 | -1) => {
    if (!selectedAccount || amount < 1) return
    const ok = await handleUpdateCoupon(selectedAccount.familyGroupId, selectedAccount.familyName, sign * amount)
    // 성공하면 수량만 비웁니다. 가정은 그대로 두어, 아래 "현재 수량"에서 처리 결과를 바로 확인할 수 있게 합니다.
    // (실패하거나 막혔을 때는 수량도 그대로 두어 다시 시도할 수 있습니다)
    if (ok) setAmountText('')
  }

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

  // 저장에 성공하면 true (입력칸을 비워도 되는지 호출한 쪽이 알 수 있게 합니다)
  const handleUpdateCoupon = async (famId: string, familyName: string, delta: number, isUndo = false): Promise<boolean> => {
    if (pendingFamilyId) return false // 다른 요청 진행 중이면 무시 (연타로 인한 이중 차감 방지)
    const famName = familyName || couponAccounts[famId]?.familyName || famId
    const shortName = famName.replace(' 가정', '')

    // 한 번에 여러 장을 처리하는 일이 많아 확인창은 없앴습니다.
    // 대신 잔액보다 많이 차감하려는 경우만 막고, 실수는 아래 "되돌리기"로 바로잡습니다.
    // (되돌리기 버튼으로 들어온 경우는 잔액 확인 없이 서버가 처리합니다)
    if (delta < 0 && !isUndo) {
      const cur = accountsById[famId]?.balance ?? 0
      if (cur <= 0) {
        showToast(`⚠️ ${shortName}: 남은 쿠폰이 없습니다.`)
        return false
      }
      if (-delta > cur) {
        showToast(`⚠️ ${shortName}: 잔여 ${cur}장보다 많이 차감할 수 없습니다.`)
        return false
      }
    }

    setPendingFamilyId(famId)
    const res = await dbUpdateMealCoupon(famId, famName, delta, isUndo ? '되돌리기' : undefined)
    setPendingFamilyId(null)

    // 🐛 과거 버그: 저장 실패를 전혀 확인하지 않고 화면 숫자를 바꾸고
    // "🎟️ +10장 발급 (잔여: 10장)" 토스트를 띄웠습니다. 실제로는 저장되지 않아
    // 그 가정은 식사 줄에서 식권을 받지 못합니다.
    if (res.error || res.balance === null) {
      showToast(`⚠️ ${shortName}: 저장하지 못했습니다. 다시 시도해 주세요.`)
      return false
    }

    const applied = res.applied
    const newBal = res.balance

    setCouponAccountsOverride(prev => {
      const current = prev ?? (mealCoupons || {})
      const prevAcc = current[famId]
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
        ...current,
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
      return true
    }

    if (isUndo) {
      // 되돌리기를 또 되돌리면 헷갈리므로 여기서 끝냅니다.
      setLastAction(null)
      showToast(`↩️ ${shortName}: 되돌렸습니다 (잔여: ${newBal}장)`)
    } else {
      setLastAction({ famId, famName, applied, at: Date.now() })
      showToast(`🎟️ ${shortName}: ${applied > 0 ? `+${applied}장 발급` : `${applied}장 차감`} (잔여: ${newBal}장)`)
    }
    return true
  }

  const handleUndo = async () => {
    if (!lastAction || isUndoing || pendingFamilyId) return
    setIsUndoing(true)
    await handleUpdateCoupon(lastAction.famId, lastAction.famName, -lastAction.applied, true)
    setIsUndoing(false)
  }

  // ── 쿠폰구매 QR 모달 ──
  const [showQrModal, setShowQrModal] = useState(false)
  useModalDismiss(showQrModal, () => setShowQrModal(false))
  const MEAL_QR_IMAGE_URL = 'https://isbwfpokewammwiicxqr.supabase.co/storage/v1/object/public/church-assets/photos/meal_account.jpg'

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle size="sm">🎟️ 식사쿠폰 발급 / 차감</SectionTitle>
          <button
            onClick={() => setShowQrModal(true)}
            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-2xs font-bold rounded-lg shadow-2xs flex items-center gap-1 transition-all"
          >
            💳 쿠폰구매 (QR/계좌)
          </button>
        </div>
        <p className="text-2xs text-gray-500">가정을 고르고 수량을 입력한 뒤 [발급] 또는 [차감] 버튼을 누르세요.</p>

        {/* 방금 한 작업을 한 번에 되돌리는 막대 (1분 뒤 자동으로 사라집니다) */}
        {lastAction && (
          <div className="flex items-center gap-2 bg-slate-800 text-white rounded-xl px-3 py-2 animate-fade-in">
            <span className="text-2xs flex-1 leading-snug">
              방금 <strong>{lastAction.famName.replace(' 가정', '')}</strong>
              {lastAction.applied > 0 ? ` +${lastAction.applied}장 발급` : ` ${lastAction.applied}장 차감`}
            </span>
            <button
              onClick={handleUndo}
              disabled={isUndoing || pendingFamilyId !== null}
              className="px-2.5 py-1.5 bg-white text-slate-800 text-2xs font-bold rounded-lg flex items-center gap-1 shrink-0 disabled:opacity-50 active:scale-95 transition-all"
            >
              <Undo2 size={12} /> {isUndoing ? '되돌리는 중...' : '되돌리기'}
            </button>
            <button aria-label="닫기"
              onClick={() => setLastAction(null)}
              className="tap-area-y relative p-1.5 -m-0.5 text-slate-400 hover:text-white shrink-0"
              title="닫기"
            >✕</button>
          </div>
        )}

        {/* ── 발급 / 차감 입력 ── */}
        <div className="p-3 bg-gray-50 rounded-xl space-y-2">
          <div>
            <label htmlFor={`${formId}-family`} className="text-2xs text-gray-500 font-semibold">가정 선택</label>
            <select
              id={`${formId}-family`}
              value={selectedFamId}
              onChange={e => setSelectedFamId(e.target.value)}
              disabled={pickerEntries.length === 0}
              className="w-full mt-1 p-2.5 bg-white rounded-lg border border-gray-200 text-xs text-gray-900 font-medium focus:outline-none focus:border-brand"
            >
              <option value="">{pickerEntries.length === 0 ? '승인된 성도가 없습니다' : '가정을 선택하세요'}</option>
              {pickerEntries.map(acc => (
                <option key={acc.familyGroupId} value={acc.familyGroupId}>{acc.familyName}</option>
              ))}
            </select>
          </div>

          {/* 고른 가정의 현재 수량. 발급/차감하면 곧바로 바뀝니다. */}
          <div
            aria-live="polite"
            className="px-3 py-2.5 bg-white rounded-lg border border-gray-200 flex items-center justify-between text-xs"
          >
            <span className="text-gray-500 font-semibold">현재 수량</span>
            {selectedAccount
              ? <strong className="text-brand text-sm">{selectedAccount.balance}장</strong>
              : <span className="text-gray-400">가정을 선택하면 표시됩니다</span>}
          </div>

          <div className="flex items-end gap-2">
            <div className="w-24 shrink-0">
              <label htmlFor={`${formId}-amount`} className="text-2xs text-gray-500 font-semibold">수량 (장)</label>
              <input
                id={`${formId}-amount`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                placeholder="예: 10"
                value={amountText}
                onChange={e => setAmountText(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                className="w-full mt-1 p-2.5 bg-white rounded-lg border border-gray-200 text-xs text-gray-900 font-bold text-center focus:outline-none focus:border-brand"
              />
            </div>
            <button
              onClick={() => handleSubmitAmount(1)}
              disabled={pendingFamilyId !== null || !selectedAccount || amount < 1}
              className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-2xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40"
            >
              <Plus size={14} /> 발급
            </button>
            <button
              onClick={() => handleSubmitAmount(-1)}
              disabled={pendingFamilyId !== null || !selectedAccount || amount < 1}
              className="flex-1 h-10 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-2xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40"
            >
              <Minus size={14} /> 차감
            </button>
          </div>
        </div>

        {/* ── 전체 명단 쿠폰 수량 (보기 전용) ── */}
        <div className="flex items-center justify-between pt-1">
          <h4 className="text-xs font-bold text-gray-800">전체 명단 쿠폰 수량</h4>
          <span className="text-2xs text-gray-500">총 {sortedEntries.length}가정</span>
        </div>
        <div className="space-y-1.5">
          {sortedEntries.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">승인된 성도가 없습니다.</p>
          ) : (
            sortedEntries.map(acc => (
              <div key={acc.familyGroupId} className="px-3 py-2.5 bg-gray-50 rounded-xl flex items-center justify-between gap-3 text-xs">
                {/* 최근에 발급/차감한 가정이 위에 옵니다. */}
                <span className="font-bold text-gray-800 min-w-0 break-keep">{acc.familyName}</span>
                <strong className="text-brand text-sm shrink-0">{acc.balance}장</strong>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* ── 쿠폰구매 QR 모달 ── */}
      {showQrModal && (
        <Modal
          onClose={() => setShowQrModal(false)}
          title="💳 식사쿠폰 구매 (QR/계좌)"
          subtitle="QR코드를 스캔하거나 계좌로 입금해 주세요."
          bodyClassName="p-4 space-y-3"
        >

              <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden">
                <img
                  src={MEAL_QR_IMAGE_URL}
                  alt="식사쿠폰 구매 QR코드"
                  className="w-full h-auto max-h-[380px] object-contain rounded-lg shadow-2xs"
                />
              </div>
              <p className="text-2xs text-gray-500 text-center leading-relaxed">
                입금 후 관리자에게 말씀해 주시면 쿠폰이 즉시 발급됩니다.
              </p>
        </Modal>
      )}
    </>
  )
}
