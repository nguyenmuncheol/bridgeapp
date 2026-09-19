'use client'

import { useState, useMemo } from 'react'
import { X, Lock } from 'lucide-react'
import { getUpcomingSundays, isMealRegistrationLocked } from '../../lib/dateUtils'
import { dbFetchMealRegistrations, dbSaveMealRegistration, dbCleanupStaleMealRegistrations } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { UserProfile, getSimpleUserName } from '../../lib/mockData'
import { resolveFamilyKey, buildFamilyUnits, staleFamilyKeys } from '../../lib/familyKey'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'
import Card from '../ui/Card'
import SectionTitle from '../ui/SectionTitle'

interface MealsTabProps {
  showToast: (msg: string) => void
  allUsers: UserProfile[]
  /** 대신 신청한 사람을 '최종 신청자'로 남기기 위해 필요합니다 (관리자·리더). */
  currentUser?: UserProfile
}

/**
 * 관리자·리더가 대신 입력할 가정. 앱을 쓰지 않으시는 가정의 답을 단톡방·전화로 받아
 * 옮겨 담을 때 씁니다. 기존 신청을 고칠 때도 같은 모달을 씁니다.
 */
interface ProxyTarget {
  familyKey: string
  label: string
  attending: boolean
  adult: number
  child: number
  /** 이미 신청이 있던 가정인지 (버튼 문구와 안내에 씁니다) */
  isEdit: boolean
}

interface MealRegistrationRow {
  id: string
  date_str: string
  family_group_id?: string
  attending: boolean
  adult_count?: number
  child_count?: number
  registered_by_user_name?: string
  updated_at?: string
  created_at?: string
}

export default function MealsTab({ showToast, allUsers, currentUser }: MealsTabProps) {
  // ── 식사 집계 (DB 실시간 연동) ──
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const [forecastWeek, setForecastWeek] = useState(0)
  // 미응답 가정 목록은 길어질 수 있어 기본은 접어 둡니다(숫자는 접힌 상태에서도 보입니다).
  const [showPending, setShowPending] = useState(false)

  // 신청 탭과 캐시를 공유해 반복 조회하지 않음 (같은 키를 써야 공유됩니다)
  const mealDateStrs = useMemo(() => upcomingSundays.map(s => s.dateStr), [upcomingSundays])
  const { data: mealRegistrations, refetch: refetchMeals } = useCachedQuery(
    `mealRegistrations:${mealDateStrs[0] || ''}`,
    () => dbFetchMealRegistrations(mealDateStrs)
  )
  const dbMealRegistrations: MealRegistrationRow[] = useMemo(() => mealRegistrations || [], [mealRegistrations])

  // 교회 전체 가정 목록 (승인된 성도 기준)
  const familyUnits = useMemo(() => buildFamilyUnits(allUsers), [allUsers])

  // 식수 응답을 기다릴 가정 — 전원이 '출석 미적용'인 가정(가끔 출석·장기 휴식)은 뺍니다.
  // 부부 중 한 분만 쉬시는 가정은 남아 계신 배우자가 신청해야 하므로 그대로 남습니다.
  // 신청을 하신 경우의 인원 집계는 신청 줄(byFamily) 기준이라 이 목록과 무관하게 잡힙니다.
  const countedUnits = useMemo(() => familyUnits.filter(u => !u.attendanceExempt), [familyUnits])

  // 주차별 식수 계산
  const weekMealStats = useMemo(() => {
    return upcomingSundays.map(sun => {
      const targetDate = sun.dateStr
      const sameDay = dbMealRegistrations.filter(r => r.date_str === targetDate)

      // 가정 키를 현재 기준으로 통일하고, 가정당 가장 최근 신청 1건만 셉니다.
      const byFamily = new Map<string, MealRegistrationRow>()
      sameDay.forEach(r => {
        const key = resolveFamilyKey(r.family_group_id, allUsers) || `row_${r.id}`
        const prev = byFamily.get(key)
        const cur = String(r.updated_at || r.created_at || '')
        if (!prev || String(prev.updated_at || prev.created_at || '') <= cur) byFamily.set(key, r)
      })


      const labelOf = (key: string, fallback: string) =>
        familyUnits.find(u => u.key === key)?.label || fallback

      const attendingRows = Array.from(byFamily.entries())
        .filter(([, r]) => r.attending)
        .map(([key, r]) => ({
          key,
          name: labelOf(key, r.registered_by_user_name || '성도'),
          adult: r.adult_count || 0,
          child: r.child_count || 0,
          updater: r.registered_by_user_name || '성도',
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      const adult = attendingRows.reduce((sum, r) => sum + r.adult, 0)
      const child = attendingRows.reduce((sum, r) => sum + r.child, 0)

      // "식사 안 함"으로 응답한 가정 — 응답은 했으므로 미응답과 반드시 구분합니다.
      const absentUnits = countedUnits.filter(u => byFamily.get(u.key)?.attending === false)

      // 아직 아무 응답도 없는 가정
      const pendingUnits = countedUnits.filter(u => !byFamily.has(u.key))

      return {
        total: adult + child,
        adult,
        child,
        rows: attendingRows,
        absentUnits,
        pendingUnits,
        respondedCount: countedUnits.length - pendingUnits.length,
      }
    })
  }, [upcomingSundays, dbMealRegistrations, allUsers, familyUnits, countedUnits])

  const currentWeekStat = weekMealStats[forecastWeek] || {
    total: 0, adult: 0, child: 0, rows: [], absentUnits: [], pendingUnits: [], respondedCount: 0,
  }

  const handleCopyMeal = () => {
    const dateStr = upcomingSundays[forecastWeek]?.displayStr || ''
    const { total, adult, child } = currentWeekStat
    const txt = `[더브릿지교회] ${dateStr} 주일 식수 집계 안내\n\n• 총 식사 인원: ${total}명\n• 성인: ${adult}명 | 어린이: ${child}명\n\n(맛있는 주일 식사 준비 감사드립니다! 🙏)`
    navigator.clipboard.writeText(txt)
    showToast(`📋 ${dateStr} 식수내용이 복사되었습니다!`)
  }

  // 미응답 가정에게 보낼 안내 문구를 만들어 복사합니다 (단톡방에 붙여넣기용).
  const handleCopyPending = () => {
    const dateStr = upcomingSundays[forecastWeek]?.displayStr || ''
    const names = currentWeekStat.pendingUnits.map(u => `• ${u.label}`).join('\n')
    const txt = names
      ? `[더브릿지교회] ${dateStr} 주일 식사 신청 안내\n\n아래 가정은 아직 식사 신청을 해주지 않으셨습니다.\n앱 [신청] 탭에서 참석 여부를 알려주세요 🙏\n\n${names}`
      : `[더브릿지교회] ${dateStr} 주일 식사 신청\n\n모든 가정이 응답해 주셨습니다. 감사합니다! 🙏`
    navigator.clipboard.writeText(txt)
    showToast('📋 미응답 가정 안내문이 복사되었습니다!')
  }

  // ── 관리자·리더의 대신 신청 ──
  // 앱을 쓰지 않으시는 가정(연세 드신 분 등)의 답을 단톡방·전화로 받아 옮겨 담습니다.
  // 서버 정책(meal_reg_all_policy)은 로그인한 사람이면 누구나 쓸 수 있게 이미 열려 있어
  // (가족끼리 대신 신청하는 구조) 여기서 화면만 제공합니다. 탭 자체가 관리자·리더에게만
  // 보이므로(AdminDashboard) 권한 경계는 탭에서 이미 정해집니다.
  const canProxyRegister = currentUser?.role === 'ADMIN' || currentUser?.role === 'LEADER'

  const [proxyTarget, setProxyTarget] = useState<ProxyTarget | null>(null)
  const [isSavingProxy, setIsSavingProxy] = useState(false)
  useModalDismiss(!!proxyTarget, () => setProxyTarget(null))

  // 선택한 주일이 이미 마감(토요일 14시, 하노이 기준)됐는지.
  // 성도님 화면과 달리 관리자·리더는 마감 뒤에도 입력할 수 있습니다 — 늦게 연락 주신
  // 가정을 주방 집계에 넣어야 하기 때문입니다. 대신 마감 후라는 사실은 분명히 알립니다.
  const selectedSundayLocked = useMemo(
    () => {
      const obj = upcomingSundays[forecastWeek]?.dateObj
      return obj ? isMealRegistrationLocked(obj).isLocked : false
    },
    [upcomingSundays, forecastWeek]
  )

  /** 가정 하나를 대신 신청/수정하는 모달을 엽니다. */
  const openProxy = (familyKey: string, label: string) => {
    if (!canProxyRegister) return
    const targetDate = upcomingSundays[forecastWeek]?.dateStr || ''
    const existing = dbMealRegistrations.find(
      r => r.date_str === targetDate && resolveFamilyKey(r.family_group_id, allUsers) === familyKey
    )
    // 처음 입력하는 가정은 그 가정의 어른 수를 기본값으로 깔아 둡니다(대개 그 숫자입니다).
    const adultsInFamily = familyUnits.find(u => u.key === familyKey)?.members.length || 1
    setProxyTarget({
      familyKey,
      label,
      attending: existing ? !!existing.attending : true,
      adult: existing ? (existing.adult_count || 0) : adultsInFamily,
      child: existing ? (existing.child_count || 0) : 0,
      isEdit: !!existing
    })
  }

  const handleSaveProxy = async () => {
    if (!proxyTarget || !currentUser || isSavingProxy) return
    const targetDate = upcomingSundays[forecastWeek]?.dateStr || ''
    if (!targetDate) {
      showToast('⚠️ 날짜를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.')
      return
    }

    setIsSavingProxy(true)
    const res = await dbSaveMealRegistration({
      familyGroupId: proxyTarget.familyKey,
      dateStr: targetDate,
      // 실제로 입력한 관리자·리더가 '최종 신청자'로 남습니다. 그 가정 화면에도 이 이름이
      // 보이므로, 누가 대신 넣어 주었는지 성도님도 확인할 수 있습니다.
      registeredByUserId: currentUser.id,
      registeredByUserName: getSimpleUserName(currentUser),
      attending: proxyTarget.attending,
      adultCount: proxyTarget.attending ? proxyTarget.adult : 0,
      childCount: proxyTarget.attending ? proxyTarget.child : 0
    })
    setIsSavingProxy(false)

    if (res.error) {
      showToast('⚠️ 저장하지 못했습니다. 인터넷 상태를 확인하고 다시 시도해 주세요.')
      return
    }

    // 같은 가정이 옛날 키로 남겨 둔 줄을 지웁니다 (신청 탭의 저장과 같은 처리).
    // 가정을 찾지 못한 줄(아주 예전 이름 키 등)은 그 줄 자체를 고친 것이므로 건너뜁니다.
    const savedUnit = familyUnits.find(u => u.key === proxyTarget.familyKey)
    if (savedUnit?.members[0]) {
      void dbCleanupStaleMealRegistrations(staleFamilyKeys(savedUnit.members[0], allUsers), targetDate)
    }

    await refetchMeals()
    const saved = proxyTarget
    setProxyTarget(null)
    showToast(
      saved.attending
        ? `✅ ${saved.label} — 성인 ${saved.adult}명, 어린이 ${saved.child}명으로 저장했습니다`
        : `✅ ${saved.label} — 식사 안 함으로 저장했습니다`
    )
  }

  const totalFamilies = countedUnits.length
  const pendingCount = currentWeekStat.pendingUnits.length
  const responseRate = totalFamilies > 0
    ? Math.round((currentWeekStat.respondedCount / totalFamilies) * 100)
    : 0

  return (
    <div className="space-y-4">

      {/* 향후 4주 식수 예상 — 항상 노출 (토글 없음) */}
      <div className="p-4 bg-amber-500/10 border border-amber-200 rounded-2xl space-y-2 text-xs">
        <h3 className="font-bold text-amber-900">📅 향후 4주 주일 식수 예상</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          {upcomingSundays.map((s, idx) => {
            const stat = weekMealStats[idx] || { total: 0, pendingUnits: [] }
            return (
              <button
                key={idx}
                onClick={() => setForecastWeek(idx)}
                className={`p-2 rounded-xl border transition-all ${
                  forecastWeek === idx
                    ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                    : 'bg-white border-amber-100 hover:bg-amber-50 text-gray-700'
                }`}
              >
                <span className="text-2xs block font-semibold">{s.displayStr}</span>
                <p className={`font-bold text-sm ${forecastWeek === idx ? 'text-white' : 'text-brand'}`}>
                  {stat.total}명
                </p>
                {/* 어느 주에 미응답이 많은지 한눈에 보이도록 표시합니다. */}
                {stat.pendingUnits.length > 0 && (
                  <span className={`text-2xs block ${forecastWeek === idx ? 'text-amber-100' : 'text-rose-500'}`}>
                    미응답 {stat.pendingUnits.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 식수 집계 카드 + 복사 버튼 (alert→토스트) */}
      <div className="bg-brand text-white p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-2xs text-blue-200 font-medium">
              {upcomingSundays[forecastWeek]?.shortLabelStr} 주일 식사 신청 총원
            </span>
            <div className="text-3xl font-black mt-0.5">{currentWeekStat.total}명</div>
            <p className="text-xs text-blue-100 mt-1">성인 {currentWeekStat.adult}명 + 어린이 {currentWeekStat.child}명</p>
          </div>
          <button
            onClick={handleCopyMeal}
            className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 shrink-0"
          >📋 식수내용 복사</button>
        </div>

        {/* 응답 현황 막대 — 집계 숫자를 믿어도 되는지 판단하는 근거가 됩니다. */}
        {totalFamilies > 0 && (
          <div className="pt-2 border-t border-white/15 space-y-1.5">
            <div className="flex justify-between text-2xs text-blue-100">
              <span>가정 응답 현황</span>
              <span className="font-bold text-white">
                {currentWeekStat.respondedCount} / {totalFamilies} 가정 ({responseRate}%)
              </span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${responseRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 아직 응답 안 한 가정 ── */}
      {/* 예전에는 "신청한 사람"만 보여서, 주방에서 몇 인분을 준비해야 할지 판단할 때
          "이 숫자가 전부인지, 아직 답을 안 한 가정이 남았는지" 알 수가 없었습니다. */}
      <Card padding="none" className="overflow-hidden">
        <button
          onClick={() => setShowPending(v => !v)}
          className="w-full flex items-center justify-between p-4"
        >
          <span className="flex items-center gap-2">
            <span className="text-sm">{pendingCount > 0 ? '🔔' : '✅'}</span>
            <span className="font-bold text-xs text-gray-900">
              아직 응답 안 한 가정
            </span>
            <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${
              pendingCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {pendingCount}가정
            </span>
          </span>
          <span className="text-gray-400 text-xs">{showPending ? '▲' : '▼'}</span>
        </button>

        {showPending && (
          <div className="px-4 pb-4 space-y-3">
            {totalFamilies === 0 ? (
              <p className="text-xs text-gray-400 py-2">등록된 성도 명단이 없습니다.</p>
            ) : pendingCount === 0 ? (
              <p className="text-xs text-emerald-600 py-2 font-medium">
                모든 가정이 응답해 주셨습니다. 집계 숫자를 그대로 믿으셔도 됩니다 🙏
              </p>
            ) : (
              <>
                {canProxyRegister && (
                  <p className="text-2xs text-gray-400">
                    가정 이름을 누르면 대신 신청할 수 있습니다 — 앱을 쓰지 않으시는 가정의 답을 옮겨 담을 때 쓰세요.
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {currentWeekStat.pendingUnits.map(u => (
                    canProxyRegister ? (
                      <button
                        key={u.key}
                        type="button"
                        onClick={() => openProxy(u.key, u.label)}
                        className="text-2xs bg-rose-50 text-rose-700 border border-rose-100 px-2 py-1 rounded-lg font-medium hover:bg-rose-100 active:scale-95 transition-all whitespace-nowrap"
                      >
                        {u.label} <span className="text-rose-400">✍️</span>
                      </button>
                    ) : (
                      <span
                        key={u.key}
                        className="text-2xs bg-rose-50 text-rose-700 border border-rose-100 px-2 py-1 rounded-lg font-medium"
                      >
                        {u.label}
                      </span>
                    )
                  ))}
                </div>
                <button
                  onClick={handleCopyPending}
                  className="w-full py-2 bg-rose-500 hover:bg-rose-600 text-white text-2xs font-bold rounded-xl transition-all"
                >
                  📋 미응답 가정 안내문 복사 (단톡방 붙여넣기용)
                </button>
              </>
            )}

            {/* "식사 안 함"으로 답한 가정은 미응답이 아닙니다. 헷갈리지 않도록 따로 보여줍니다. */}
            {currentWeekStat.absentUnits.length > 0 && (
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <p className="text-2xs font-bold text-gray-500">
                  식사 안 함으로 응답 ({currentWeekStat.absentUnits.length}가정)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentWeekStat.absentUnits.map(u => (
                    canProxyRegister ? (
                      <button
                        key={u.key}
                        type="button"
                        onClick={() => openProxy(u.key, u.label)}
                        className="text-2xs bg-gray-50 text-gray-500 border border-gray-100 px-2 py-1 rounded-lg hover:bg-gray-100 active:scale-95 transition-all whitespace-nowrap"
                      >
                        {u.label} <span className="text-gray-400">✍️</span>
                      </button>
                    ) : (
                      <span
                        key={u.key}
                        className="text-2xs bg-gray-50 text-gray-500 border border-gray-100 px-2 py-1 rounded-lg"
                      >
                        {u.label}
                      </span>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 신청자 목록 테이블 */}
      <Card className="space-y-3">
        <div className="flex justify-between items-center">
          <SectionTitle size="sm">
            {upcomingSundays[forecastWeek]?.shortLabelStr} 식사 신청자 목록
          </SectionTitle>
          <span className="text-2xs bg-blue-50 text-brand font-bold px-2 py-0.5 rounded-full">
            성인 {currentWeekStat.adult}명 + 어린이 {currentWeekStat.child}명
          </span>
        </div>
        {canProxyRegister && currentWeekStat.rows.length > 0 && (
          <p className="text-2xs text-gray-400 -mt-1">줄을 누르면 인원을 고칠 수 있습니다.</p>
        )}
        {currentWeekStat.rows.length > 0 ? (
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="p-2">신청 성도/가구</th>
                <th className="p-2 text-center">성인</th>
                <th className="p-2 text-center">어린이</th>
                <th className="p-2 text-right">최종 신청자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-700">
              {currentWeekStat.rows.map((row: { key: string; name: string; adult: number; child: number; updater: string }, idx: number) => (
                <tr
                  key={idx}
                  onClick={canProxyRegister ? () => openProxy(row.key, row.name) : undefined}
                  className={canProxyRegister ? 'cursor-pointer hover:bg-gray-50' : undefined}
                >
                  <td className="p-2 font-bold text-gray-800">
                    {row.name}
                    {canProxyRegister && <span className="ml-1 text-gray-300">✍️</span>}
                  </td>
                  <td className="p-2 text-center font-bold text-brand">{row.adult}명</td>
                  <td className="p-2 text-center">{row.child}명</td>
                  <td className="p-2 text-right text-gray-400">{row.updater}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-6 text-center text-xs text-gray-400">
            아직 식사를 신청한 성도가 없습니다.
          </div>
        )}
      </Card>

      {/* ── 대신 신청 모달 (관리자·리더) ── */}
      {proxyTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setProxyTarget(null))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-fade-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-[14px] text-gray-900">
                  ✍️ {proxyTarget.label} {proxyTarget.isEdit ? '신청 수정' : '대신 신청'}
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  주일 날짜: <strong className="text-brand">{upcomingSundays[forecastWeek]?.shortLabelStr}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProxyTarget(null)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 font-bold"
              >
                <X size={16} />
              </button>
            </div>

            {/* 마감 뒤에도 입력할 수 있지만, 주방 집계가 이미 넘어갔을 수 있어 알려 드립니다. */}
            {selectedSundayLocked && (
              <div className="flex items-start gap-1.5 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-amber-800">
                <Lock size={12} className="shrink-0 mt-0.5" />
                <span>
                  이미 마감(토요일 오후 2시)된 주일입니다. 관리자·리더는 계속 입력할 수 있지만,
                  주방에 집계가 넘어간 뒤라면 따로 알려 주셔야 합니다.
                </span>
              </div>
            )}

            {/* 식사함 / 안함 */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 font-bold">참석 여부</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { attending: true, label: '🍚 식사함', on: 'bg-brand text-white' },
                  { attending: false, label: '식사 안 함', on: 'bg-gray-400 text-white' },
                ].map(opt => (
                  <button
                    key={String(opt.attending)}
                    type="button"
                    onClick={() => setProxyTarget(prev => prev ? { ...prev, attending: opt.attending } : null)}
                    className={`py-2 rounded-xl text-[12px] font-bold transition-all border ${
                      proxyTarget.attending === opt.attending
                        ? `${opt.on} border-transparent shadow-xs`
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 인원 (신청 탭과 같은 방식) */}
            {proxyTarget.attending && (
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { label: '성인', val: proxyTarget.adult, key: 'adult' as const, min: 1 },
                  { label: '어린이', val: proxyTarget.child, key: 'child' as const, min: 0 },
                ].map(({ label, val, key, min }) => (
                  <div key={label} className="flex items-center justify-between gap-1 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                    <span className="text-gray-600 font-bold whitespace-nowrap shrink-0">{label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setProxyTarget(prev => prev ? { ...prev, [key]: Math.max(min, val - 1) } : null)}
                        aria-label={`${label} 인원 줄이기`}
                        className="w-7 h-7 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-700 flex items-center justify-center font-bold text-base leading-none active:scale-95 transition-transform"
                      >−</button>
                      <span className="font-bold text-brand w-6 text-center text-sm tabular-nums">{val}</span>
                      <button
                        type="button"
                        onClick={() => setProxyTarget(prev => prev ? { ...prev, [key]: val + 1 } : null)}
                        aria-label={`${label} 인원 늘리기`}
                        className="w-7 h-7 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-700 flex items-center justify-center font-bold text-base leading-none active:scale-95 transition-transform"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-gray-400">
              최종 신청자는 <strong className="text-gray-500">{currentUser ? getSimpleUserName(currentUser) : '성도님'}</strong>
              으로 남습니다. 그 가정 화면에도 이 이름이 보입니다.
            </p>

            <button
              type="button"
              onClick={handleSaveProxy}
              disabled={isSavingProxy}
              className="w-full py-3 rounded-xl text-xs font-bold bg-brand hover:bg-brand-hover text-white transition-all shadow-xs disabled:opacity-60"
            >
              {isSavingProxy
                ? '저장 중...'
                : !proxyTarget.attending
                  ? '식사 안 함으로 저장'
                  : proxyTarget.isEdit ? '수정 내용 저장하기' : '대신 신청하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
