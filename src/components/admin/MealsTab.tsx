'use client'

import { useState, useMemo, useEffect } from 'react'
import { getUpcomingSundays } from '../../lib/dateUtils'
import { dbFetchMealRegistrations } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { UserProfile } from '../../lib/mockData'
import { resolveFamilyKey, buildFamilyUnits } from '../../lib/familyKey'

interface MealsTabProps {
  showToast: (msg: string) => void
  allUsers: UserProfile[]
}

export default function MealsTab({ showToast, allUsers }: MealsTabProps) {
  // ── 식사 집계 (DB 실시간 연동) ──
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const [forecastWeek, setForecastWeek] = useState(0)
  const [dbMealRegistrations, setDbMealRegistrations] = useState<any[]>([])
  // 미응답 가정 목록은 길어질 수 있어 기본은 접어 둡니다(숫자는 접힌 상태에서도 보입니다).
  const [showPending, setShowPending] = useState(false)

  // 신청 탭과 캐시를 공유해 반복 조회하지 않음 (같은 키를 써야 공유됩니다)
  const mealDateStrs = useMemo(() => upcomingSundays.map(s => s.dateStr), [upcomingSundays])
  const { data: mealRegistrations } = useCachedQuery(
    `mealRegistrations:${mealDateStrs[0] || ''}`,
    () => dbFetchMealRegistrations(mealDateStrs)
  )
  useEffect(() => {
    if (mealRegistrations) setDbMealRegistrations(mealRegistrations)
  }, [mealRegistrations])

  // 교회 전체 가정 목록 (승인된 성도 기준)
  const familyUnits = useMemo(() => buildFamilyUnits(allUsers), [allUsers])

  // 주차별 식수 계산
  const weekMealStats = useMemo(() => {
    return upcomingSundays.map(sun => {
      const targetDate = sun.dateStr
      const sameDay = dbMealRegistrations.filter(r => r.date_str === targetDate)

      // 🐛 과거 버그: 여기서 신청 줄을 그냥 전부 더했습니다.
      // 그런데 같은 가정이 "가족 연결 전 혼자 신청"과 "연결 후 신청"을 각각 남기면
      // 서로 다른 키로 두 줄이 되어 **같은 가정이 두 번 집계**됐습니다.
      // → 가정 키를 현재 기준으로 통일하고, 가정당 가장 최근 신청 1건만 셉니다.
      const byFamily = new Map<string, any>()
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
          name: labelOf(key, r.registered_by_user_name || '성도'),
          adult: r.adult_count || 0,
          child: r.child_count || 0,
          updater: r.registered_by_user_name || '성도',
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      const adult = attendingRows.reduce((sum, r) => sum + r.adult, 0)
      const child = attendingRows.reduce((sum, r) => sum + r.child, 0)

      // "식사 안 함"으로 응답한 가정 — 응답은 했으므로 미응답과 반드시 구분합니다.
      const absentUnits = familyUnits.filter(u => byFamily.get(u.key) && !byFamily.get(u.key).attending)

      // 아직 아무 응답도 없는 가정
      const pendingUnits = familyUnits.filter(u => !byFamily.has(u.key))

      return {
        total: adult + child,
        adult,
        child,
        rows: attendingRows,
        absentUnits,
        pendingUnits,
        respondedCount: familyUnits.length - pendingUnits.length,
      }
    })
  }, [upcomingSundays, dbMealRegistrations, allUsers, familyUnits])

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

  const totalFamilies = familyUnits.length
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
                <span className="text-[10px] block font-semibold">{s.displayStr}</span>
                <p className={`font-bold text-sm ${forecastWeek === idx ? 'text-white' : 'text-[#335f87]'}`}>
                  {stat.total}명
                </p>
                {/* 어느 주에 미응답이 많은지 한눈에 보이도록 표시합니다. */}
                {stat.pendingUnits.length > 0 && (
                  <span className={`text-[9px] block ${forecastWeek === idx ? 'text-amber-100' : 'text-rose-500'}`}>
                    미응답 {stat.pendingUnits.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 식수 집계 카드 + 복사 버튼 (alert→토스트) */}
      <div className="bg-[#335f87] text-white p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[11px] text-blue-200 font-medium">
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
            <div className="flex justify-between text-[11px] text-blue-100">
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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
        <button
          onClick={() => setShowPending(v => !v)}
          className="w-full flex items-center justify-between p-4"
        >
          <span className="flex items-center gap-2">
            <span className="text-sm">{pendingCount > 0 ? '🔔' : '✅'}</span>
            <span className="font-bold text-xs text-gray-900">
              아직 응답 안 한 가정
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
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
                <div className="flex flex-wrap gap-1.5">
                  {currentWeekStat.pendingUnits.map(u => (
                    <span
                      key={u.key}
                      className="text-[11px] bg-rose-50 text-rose-700 border border-rose-100 px-2 py-1 rounded-lg font-medium"
                    >
                      {u.label}
                    </span>
                  ))}
                </div>
                <button
                  onClick={handleCopyPending}
                  className="w-full py-2 bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold rounded-xl transition-all"
                >
                  📋 미응답 가정 안내문 복사 (단톡방 붙여넣기용)
                </button>
              </>
            )}

            {/* "식사 안 함"으로 답한 가정은 미응답이 아닙니다. 헷갈리지 않도록 따로 보여줍니다. */}
            {currentWeekStat.absentUnits.length > 0 && (
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <p className="text-[11px] font-bold text-gray-500">
                  식사 안 함으로 응답 ({currentWeekStat.absentUnits.length}가정)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentWeekStat.absentUnits.map(u => (
                    <span
                      key={u.key}
                      className="text-[11px] bg-gray-50 text-gray-500 border border-gray-100 px-2 py-1 rounded-lg"
                    >
                      {u.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 신청자 목록 테이블 */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-xs text-gray-900">
            {upcomingSundays[forecastWeek]?.shortLabelStr} 식사 신청자 목록
          </h3>
          <span className="text-[10px] bg-blue-50 text-[#335f87] font-bold px-2 py-0.5 rounded-full">
            성인 {currentWeekStat.adult}명 + 어린이 {currentWeekStat.child}명
          </span>
        </div>
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
              {currentWeekStat.rows.map((row: any, idx: number) => (
                <tr key={idx}>
                  <td className="p-2 font-bold text-gray-800">{row.name}</td>
                  <td className="p-2 text-center font-bold text-[#335f87]">{row.adult}명</td>
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
      </div>
    </div>
  )
}
