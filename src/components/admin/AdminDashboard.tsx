'use client'

import { useState, useMemo } from 'react'
import { Utensils, BarChart3, CheckCircle, XCircle, ArrowLeft, Download, Ticket, Plus, Minus } from 'lucide-react'
import { UserProfile, Role, INITIAL_MEAL_COUPONS } from '../../lib/mockData'
import { getUpcomingSundays, getRecentMonths } from '../../lib/dateUtils'

interface AdminDashboardProps {
  allUsers: UserProfile[]
  onApproveUser: (userId: string, labriId: string, role: Role, familyInfo: string) => void
  onRejectUser: (userId: string) => void
  onBack: () => void
}

// 출석 더미 데이터 (월별/날짜별)
const ATTENDANCE_DATA: Record<string, Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]>> = {
  '2026-08': {
    '2026-08-02': [
      { userId: 'u1', status: 'ATTEND', note: '' },
      { userId: 'u1_wife', status: 'ATTEND', note: '' },
      { userId: 'u2', status: 'ATTEND', note: '' },
      { userId: 'u3', status: 'ABSENT', note: '하노이 출장' },
      { userId: 'u4', status: 'ATTEND', note: '' },
      { userId: 'u5', status: 'ABSENT', note: '개인 사정' },
    ],
    '2026-08-09': [
      { userId: 'u1', status: 'ATTEND', note: '' },
      { userId: 'u1_wife', status: 'ATTEND', note: '' },
      { userId: 'u2', status: 'ATTEND', note: '' },
      { userId: 'u3', status: 'ATTEND', note: '' },
      { userId: 'u4', status: 'ABSENT', note: '여행' },
      { userId: 'u5', status: 'ATTEND', note: '' },
    ],
  },
  '2026-07': {
    '2026-07-26': [
      { userId: 'u1', status: 'ATTEND', note: '' },
      { userId: 'u1_wife', status: 'ABSENT', note: '아파요' },
      { userId: 'u2', status: 'ATTEND', note: '' },
      { userId: 'u3', status: 'ATTEND', note: '' },
      { userId: 'u4', status: 'ATTEND', note: '' },
      { userId: 'u5', status: 'ABSENT', note: '가족방문' },
    ],
  },
}

// 식수 더미 (향후 4주 동적)
const MEAL_COUNTS = [45, 42, 40, 48]
const MEAL_ROWS = [
  [
    { name: '김목사 / 이사모', adult: 2, child: 1, updater: '이사모 사모님' },
    { name: '이리더', adult: 2, child: 0, updater: '이리더 집사님' },
    { name: '박성도', adult: 1, child: 0, updater: '박성도 성도님' },
    { name: '정성도', adult: 2, child: 2, updater: '정성도 성도님' },
    { name: '강성도', adult: 2, child: 0, updater: '강성도 성도님' },
  ],
  [
    { name: '김목사 / 이사모', adult: 2, child: 1, updater: '이사모 사모님' },
    { name: '박성도', adult: 1, child: 0, updater: '박성도 성도님' },
    { name: '정성도', adult: 2, child: 2, updater: '정성도 성도님' },
    { name: '최리더', adult: 1, child: 0, updater: '최리더 집사님' },
  ],
  [
    { name: '이리더', adult: 2, child: 0, updater: '이리더 집사님' },
    { name: '정성도', adult: 2, child: 2, updater: '정성도 성도님' },
    { name: '김목사 / 이사모', adult: 2, child: 0, updater: '김목사 목사님' },
  ],
  [
    { name: '김목사 / 이사모', adult: 2, child: 1, updater: '이사모 사모님' },
    { name: '이리더', adult: 2, child: 0, updater: '이리더 집사님' },
    { name: '박성도', adult: 1, child: 0, updater: '박성도 성도님' },
    { name: '정성도', adult: 2, child: 2, updater: '정성도 성도님' },
    { name: '차성도', adult: 2, child: 0, updater: '차성도 성도님' },
  ],
]

export default function AdminDashboard({ allUsers, onApproveUser, onRejectUser, onBack }: AdminDashboardProps) {
  const [adminTab, setAdminTab] = useState<'meals' | 'approval' | 'stats' | 'coupons'>('meals')

  // ── 식사 집계 ──
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const [mealViewMode, setMealViewMode] = useState<'summary' | 'individual'>('summary')
  const [forecastWeek, setForecastWeek] = useState(0)

  // 식수 복사 토스트 (alert 대체)
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1000)
  }

  const handleCopyMeal = () => {
    const dateStr = upcomingSundays[forecastWeek]?.displayStr || ''
    const count = MEAL_COUNTS[forecastWeek]
    const txt = `[더브릿지교회] ${dateStr} 주일 식수 집계 안내\n\n• 총 식사 인원: ${count}명\n• 성인: 34명 | 어린이: 8명 | 동반: 3명\n\n(맛있는 주일 식사 준비 감사드립니다! 🙏)`
    navigator.clipboard.writeText(txt)
    showToast(`📋 ${dateStr} 식수내용이 복사되었습니다!`)
  }

  // ── 승인 ──
  const [familyInputs, setFamilyInputs] = useState<Record<string, string>>({})
  const [selectedLabris, setSelectedLabris] = useState<Record<string, string>>({})
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role>>({})
  const [dutyInputs, setDutyInputs] = useState<Record<string, string>>({})
  const [familyLinks, setFamilyLinks] = useState<Record<string, string[]>>({})
  const pendingUsers = allUsers.filter(u => u.role === 'PENDING')

  const handleApprove = (userId: string) => {
    const assignedLabri = selectedLabris[userId] || '미정'
    const assignedRole = selectedRoles[userId] || 'MEMBER'
    const familyInfo = familyInputs[userId] || ''
    onApproveUser(userId, assignedLabri, assignedRole, familyInfo)
    showToast(`✅ 가입 승인 완료 (${assignedLabri} · ${selectedRoles[userId] || 'MEMBER'})`)
  }

  // ── 쿠폰 ──
  const [couponAccounts, setCouponAccounts] = useState(INITIAL_MEAL_COUPONS)
  const handleUpdateCoupon = (famId: string, delta: number) => {
    setCouponAccounts(prev => {
      const target = prev[famId]
      if (!target) return prev
      return { ...prev, [famId]: { ...target, balance: Math.max(0, target.balance + delta) } }
    })
  }

  // ── 출석 탭 — 월/날짜 드롭다운 ──
  const recentMonths = useMemo(() => getRecentMonths(3), [])
  const [statsMonth, setStatsMonth] = useState(recentMonths[recentMonths.length - 1].value) // 최신월 기본
  const monthSundays = useMemo(() => {
    const monthData = ATTENDANCE_DATA[statsMonth] || {}
    return Object.keys(monthData).sort()
  }, [statsMonth])
  const [statsDate, setStatsDate] = useState<string>('')
  const selectedStatsDate = statsDate && monthSundays.includes(statsDate) ? statsDate : (monthSundays[monthSundays.length - 1] || '')

  const attendanceRows = useMemo(() => {
    const data = ATTENDANCE_DATA[statsMonth]?.[selectedStatsDate] || []
    return allUsers.filter(u => u.role !== 'PENDING').map(u => {
      const rec = data.find(r => r.userId === u.id)
      return { user: u, status: rec?.status || null, note: rec?.note || '' }
    })
  }, [statsMonth, selectedStatsDate, allUsers])

  // 라브리별 통계 (합계 행 포함)
  const labriStats = useMemo(() => {
    const labriGroups = ['1라브리', '2라브리', '3라브리', '라브리 미정']
    const rows = labriGroups.map(labri => {
      const members = attendanceRows.filter(r => (r.user.labriId || '라브리 미정') === labri)
      const attend = members.filter(r => r.status === 'ATTEND').length
      const total = members.filter(r => r.status !== null).length || members.length
      return { label: labri, attend, total }
    }).filter(r => r.total > 0)

    const totalAttend = rows.reduce((s, r) => s + r.attend, 0)
    const totalTotal = rows.reduce((s, r) => s + r.total, 0)
    return { rows, totalAttend, totalTotal }
  }, [attendanceRows])

  const handleDownloadCSV = () => {
    const monthData = ATTENDANCE_DATA[statsMonth] || {}
    let csv = '날짜,성도명,소속라브리,출석여부,결석사유\n'
    Object.entries(monthData).sort().forEach(([date, records]) => {
      records.forEach(rec => {
        const u = allUsers.find(u => u.id === rec.userId)
        if (u) {
          csv += `${date},${u.name} ${u.duty},${u.labriId || '라브리 미정'},${rec.status === 'ATTEND' ? '출석' : '결석'},${rec.note || ''}\n`
        }
      })
    })
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `더브릿지교회_출석기록_${statsMonth}.csv`
    a.click()
    showToast(`📥 ${statsMonth} 전체 출석 데이터 다운로드 시작`)
  }

  return (
    <div className="space-y-4 pb-6 relative">
      {/* 토스트 */}
      {toastMsg && (
        <div className="fixed top-[88px] left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* 헤더 */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="font-bold text-base">🛠️ 관리자 대시보드</h1>
            <p className="text-[11px] text-slate-400">더브릿지교회 운영 관리 모드</p>
          </div>
        </div>
      </div>

      {/* 탭 메뉴 — "출석 & CSV" → "출석" 으로 변경 */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold overflow-x-auto">
        {[
          { id: 'meals', label: '🍱 식사 집계' },
          { id: 'approval', label: `👥 가입 승인${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}` },
          { id: 'coupons', label: '🎟️ 쿠폰 관리' },
          { id: 'stats', label: '📊 출석' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setAdminTab(id as typeof adminTab)}
            className={`flex-1 py-2 px-2 rounded-lg shrink-0 transition-all ${
              adminTab === id ? 'bg-slate-900 text-white font-bold' : 'text-gray-500'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* ── 식사 집계 탭 (4주 예상 항상 노출, 토글 제거) ── */}
      {adminTab === 'meals' && (
        <div className="space-y-4">
          {/* 뷰 모드 토글 */}
          <div className="flex bg-white p-2 rounded-xl border border-gray-100 text-xs gap-1">
            <button
              onClick={() => setMealViewMode('summary')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${mealViewMode === 'summary' ? 'bg-slate-900 text-white' : 'text-gray-500'}`}
            >요약 보기</button>
            <button
              onClick={() => setMealViewMode('individual')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${mealViewMode === 'individual' ? 'bg-slate-900 text-white' : 'text-gray-500'}`}
            >신청자별 보기</button>
          </div>

          {/* 향후 4주 식수 예상 — 항상 노출 (토글 없음) */}
          <div className="p-4 bg-amber-500/10 border border-amber-200 rounded-2xl space-y-2 text-xs">
            <h3 className="font-bold text-amber-900">📅 향후 4주 주일 식수 예상</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              {upcomingSundays.map((s, idx) => (
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
                    {MEAL_COUNTS[idx]}명
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* 식수 집계 카드 + 복사 버튼 (alert→토스트) */}
          <div className="bg-[#335f87] text-white p-4 rounded-2xl shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] text-blue-200 font-medium">
                  {upcomingSundays[forecastWeek]?.shortLabelStr} 주일 식사 신청 총원
                </span>
                <div className="text-3xl font-black mt-0.5">{MEAL_COUNTS[forecastWeek]}명</div>
                <p className="text-xs text-blue-100 mt-1">성인 34명 + 어린이 8명 + 동반 3명</p>
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
              <span className="text-[10px] bg-blue-50 text-[#335f87] font-bold px-2 py-0.5 rounded-full">총 {MEAL_COUNTS[forecastWeek]}명</span>
            </div>
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
                {MEAL_ROWS[forecastWeek].map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2 font-bold text-gray-800">{row.name}</td>
                    <td className="p-2 text-center font-bold text-[#335f87]">{row.adult}명</td>
                    <td className="p-2 text-center">{row.child}명</td>
                    <td className="p-2 text-right text-gray-400">{row.updater}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 가입 승인 탭 ── */}
      {adminTab === 'approval' && (
        <div className="space-y-3">
          {pendingUsers.length > 0 ? (
            pendingUsers.map((pending) => (
              <div key={pending.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">{pending.name} 성도</h3>
                    <p className="text-xs text-gray-400">{pending.phone} | 주소: {pending.address || '미입력'}</p>
                  </div>
                  <span className="text-[10px] bg-rose-50 text-rose-600 font-bold px-2 py-0.5 rounded-full">승인 대기</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 font-semibold">소속 라브리</label>
                      <select value={selectedLabris[pending.id] || '미정'} onChange={(e) => setSelectedLabris({ ...selectedLabris, [pending.id]: e.target.value })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <option value="미정">라브리 미정</option>
                        <option value="1라브리">1라브리</option>
                        <option value="2라브리">2라브리</option>
                        <option value="3라브리">3라브리</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-semibold">부여 권한</label>
                      <select value={selectedRoles[pending.id] || 'MEMBER'} onChange={(e) => setSelectedRoles({ ...selectedRoles, [pending.id]: e.target.value as Role })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <option value="MEMBER">일반 성도</option>
                        <option value="LEADER">라브리 리더</option>
                        <option value="ADMIN">관리자</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold">직분</label>
                    <select value={dutyInputs[pending.id] || '성도'} onChange={(e) => setDutyInputs({ ...dutyInputs, [pending.id]: e.target.value })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      {['성도', '청년', '서리집사', '집사', '권사', '장로', '선생님', '목사', '전도사', '사모'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold">배우자/가족 연결</label>
                    <div className="mt-1 max-h-28 overflow-y-auto space-y-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      {allUsers.filter(u => u.role !== 'PENDING' && u.id !== pending.id).map(member => {
                        const isChecked = (familyLinks[pending.id] || []).includes(member.id)
                        return (
                          <label key={member.id} className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-100 rounded px-1">
                            <input type="checkbox" checked={isChecked} onChange={() => {
                              const current = familyLinks[pending.id] || []
                              setFamilyLinks({ ...familyLinks, [pending.id]: isChecked ? current.filter(id => id !== member.id) : [...current, member.id] })
                            }} className="w-3.5 h-3.5 accent-[#335f87]" />
                            <span className="text-[11px] text-gray-700">{member.name} {member.duty} <span className="text-gray-400">({member.labriId || '미정'})</span></span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold">가족 현황 메모</label>
                    <input type="text" placeholder="예: 배우자: 홍길순, 자녀: 홍길동" value={familyInputs[pending.id] || ''} onChange={(e) => setFamilyInputs({ ...familyInputs, [pending.id]: e.target.value })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => onRejectUser(pending.id)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">거절</button>
                  <button onClick={() => handleApprove(pending.id)} className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl">가입 승인</button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-8 rounded-2xl border border-gray-100 text-center text-xs text-gray-400">현재 승인 대기 중인 신규 성도가 없습니다.</div>
          )}
        </div>
      )}

      {/* ── 쿠폰 관리 탭 ── */}
      {adminTab === 'coupons' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
          <h3 className="font-bold text-xs text-gray-900">🎟️ 식사쿠폰 발급 / 차감</h3>
          <div className="space-y-2">
            {Object.values(couponAccounts).map((acc) => (
              <div key={acc.familyGroupId} className="p-3 bg-gray-50 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <h4 className="font-bold text-gray-800">{acc.familyName.replace(' 가정', '')}</h4>
                  <p className="text-[10px] text-gray-400">잔여 쿠폰: {acc.balance}장</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleUpdateCoupon(acc.familyGroupId, -1)} className="w-7 h-7 bg-white border border-gray-200 text-gray-600 rounded-lg font-bold flex items-center justify-center hover:bg-gray-100"><Minus size={12} /></button>
                  <span className="font-bold text-[#335f87] w-6 text-center">{acc.balance}</span>
                  <button onClick={() => handleUpdateCoupon(acc.familyGroupId, 1)} className="w-7 h-7 bg-white border border-gray-200 text-gray-600 rounded-lg font-bold flex items-center justify-center hover:bg-gray-100"><Plus size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 출석 탭 (월/날짜 드롭다운, 동적 통계, 합계행, CSV) ── */}
      {adminTab === 'stats' && (
        <div className="space-y-4">
          {/* 월/날짜 선택 드롭다운 */}
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-2xs flex gap-2 text-xs">
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 font-bold block mb-1">월 선택</label>
              <select
                value={statsMonth}
                onChange={e => { setStatsMonth(e.target.value); setStatsDate('') }}
                className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 font-bold focus:outline-none"
              >
                {recentMonths.map(m => (
                  <option key={m.value} value={m.value}>{m.label} ({m.value})</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 font-bold block mb-1">날짜 선택</label>
              <select
                value={selectedStatsDate}
                onChange={e => setStatsDate(e.target.value)}
                className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 font-bold focus:outline-none"
              >
                {monthSundays.length > 0 ? monthSundays.map(d => (
                  <option key={d} value={d}>{d}</option>
                )) : <option value="">기록 없음</option>}
              </select>
            </div>
          </div>

          {/* 출석률 통계 (합계 행 포함) */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-4">
            <h3 className="font-bold text-xs text-gray-900">📊 출석률 통계 — {selectedStatsDate || statsMonth}</h3>
            {labriStats.rows.map(({ label, attend, total }) => {
              const rate = total > 0 ? Math.round((attend / total) * 100) : 0
              const colors: Record<string, string> = { '1라브리': '#335f87', '2라브리': '#914c24', '3라브리': '#2d7d46', '라브리 미정': '#6b7280' }
              const color = colors[label] || '#6b7280'
              return (
                <div key={label} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-gray-800">{label}</span>
                    <span className="font-bold" style={{ color }}>{attend}/{total}명 ({rate}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
            {/* 합계 행 */}
            {labriStats.rows.length > 0 && (
              <div className="pt-2 border-t border-gray-200 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-black text-gray-900">전체 합계</span>
                  <span className="font-black text-[#335f87]">
                    {labriStats.totalAttend}/{labriStats.totalTotal}명 ({labriStats.totalTotal > 0 ? Math.round((labriStats.totalAttend / labriStats.totalTotal) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                  <div className="h-full bg-[#335f87] rounded-full transition-all"
                    style={{ width: `${labriStats.totalTotal > 0 ? Math.round((labriStats.totalAttend / labriStats.totalTotal) * 100) : 0}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* 상세 명단 + CSV 다운로드 */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs text-gray-900">{selectedStatsDate} 출석/결석 명단</h3>
              <button
                onClick={handleDownloadCSV}
                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs"
              >
                <Download size={12} /> CSV ({statsMonth})
              </button>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="p-2">성도명</th>
                  <th className="p-2">소속</th>
                  <th className="p-2 text-center">출석여부</th>
                  <th className="p-2">결석사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-700">
                {attendanceRows.map(({ user, status, note }) => (
                  <tr key={user.id}>
                    <td className="p-2 font-bold text-gray-800">{user.name} {user.duty}</td>
                    <td className="p-2 text-gray-500">{user.labriId || '라브리 미정'}</td>
                    <td className="p-2 text-center">
                      {status ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status === 'ABSENT' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {status === 'ABSENT' ? '❌ 결석' : '✅ 출석'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[10px]">미기록</span>
                      )}
                    </td>
                    <td className="p-2 text-gray-500">{note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
