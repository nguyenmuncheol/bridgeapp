'use client'

import { useState, useMemo, useEffect } from 'react'
import { getUpcomingSundays } from '../../lib/dateUtils'
import { dbFetchMealRegistrations } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { UserProfile } from '../../lib/mockData'
import { resolveFamilyKey } from '../../lib/familyKey'

interface MealsTabProps {
  showToast: (msg: string) => void
  allUsers: UserProfile[]
}

export default function MealsTab({ showToast, allUsers }: MealsTabProps) {
  // ── 식사 집계 (DB 실시간 연동) ──
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const [forecastWeek, setForecastWeek] = useState(0)
  const [dbMealRegistrations, setDbMealRegistrations] = useState<any[]>([])

  // 신청 탭과 캐시를 공유해 반복 조회하지 않음
  const { data: mealRegistrations } = useCachedQuery('mealRegistrations', () => dbFetchMealRegistrations())
  useEffect(() => {
    if (mealRegistrations) setDbMealRegistrations(mealRegistrations)
  }, [mealRegistrations])

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

      const matched = Array.from(byFamily.values()).filter(r => r.attending)
      const adult = matched.reduce((sum, r) => sum + (r.adult_count || 0), 0)
      const child = matched.reduce((sum, r) => sum + (r.child_count || 0), 0)
      const total = adult + child
      const rows = matched.map(r => ({
        name: r.registered_by_user_name || '성도',
        adult: r.adult_count || 0,
        child: r.child_count || 0,
        updater: r.registered_by_user_name || '성도'
      }))
      return { total, adult, child, rows }
    })
  }, [upcomingSundays, dbMealRegistrations, allUsers])

  const currentWeekStat = weekMealStats[forecastWeek] || { total: 0, adult: 0, child: 0, rows: [] }

  const handleCopyMeal = () => {
    const dateStr = upcomingSundays[forecastWeek]?.displayStr || ''
    const { total, adult, child } = currentWeekStat
    const txt = `[더브릿지교회] ${dateStr} 주일 식수 집계 안내\n\n• 총 식사 인원: ${total}명\n• 성인: ${adult}명 | 어린이: ${child}명\n\n(맛있는 주일 식사 준비 감사드립니다! 🙏)`
    navigator.clipboard.writeText(txt)
    showToast(`📋 ${dateStr} 식수내용이 복사되었습니다!`)
  }

  return (
    <div className="space-y-4">


        {/* 향후 4주 식수 예상 — 항상 노출 (토글 없음) */}
      <div className="p-4 bg-amber-500/10 border border-amber-200 rounded-2xl space-y-2 text-xs">
        <h3 className="font-bold text-amber-900">📅 향후 4주 주일 식수 예상</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          {upcomingSundays.map((s, idx) => {
            const stat = weekMealStats[idx] || { total: 0 }
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
      </div>

      {/* 신청자 목록 테이블 */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-xs text-gray-900">
            {upcomingSundays[forecastWeek]?.shortLabelStr} 식사 신청자 목록
          </h3>
          <span className="text-[10px] bg-blue-50 text-[#335f87] font-bold px-2 py-0.5 rounded-full">총 {currentWeekStat.total}명</span>
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
