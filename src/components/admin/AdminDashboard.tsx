'use client'

import { useState, useMemo, useEffect } from 'react'
import { Utensils, BarChart3, CheckCircle, XCircle, ArrowLeft, Download, Ticket, Plus, Minus, Search, Edit2, Save, X } from 'lucide-react'
import { UserProfile, Role, getUserDisplayName, MealCouponAccount } from '../../lib/mockData'
import { getUpcomingSundays, getRecentMonths } from '../../lib/dateUtils'
import { dbFetchMealCoupons, dbUpdateMealCoupon, dbFetchAttendanceRecords, dbUpdateProfile, dbFetchMealRegistrations } from '../../lib/db'

interface AdminDashboardProps {
  allUsers: UserProfile[]
  onApproveUser: (userId: string, labriId: string, role: Role, duty: string, familyInfo: string, familyGroupId?: string) => void
  onRejectUser: (userId: string) => void
  onBack: () => void
}

export default function AdminDashboard({ allUsers, onApproveUser, onRejectUser, onBack }: AdminDashboardProps) {
  const [adminTab, setAdminTab] = useState<'meals' | 'approval' | 'stats' | 'coupons' | 'members'>('meals')

  // ── 성도관리 탭 상태 ──
  const approvedMembers = allUsers.filter(u => u.role !== 'PENDING')
  const [memberSearch, setMemberSearch] = useState('')
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null)
  const [editMemberData, setEditMemberData] = useState<{
    name: string; phone: string; address: string; birthday: string;
    role: Role; duty: string; labriId: string; familyGroupId: string; familyInfo: string
  }>({ name: '', phone: '', address: '', birthday: '', role: 'MEMBER', duty: '성도', labriId: '', familyGroupId: '', familyInfo: '' })

  const filteredMembers = memberSearch
    ? approvedMembers.filter(m => m.name.includes(memberSearch) || m.phone.includes(memberSearch) || (m.email && m.email.includes(memberSearch)))
    : approvedMembers

  const handleStartEditMember = (member: UserProfile) => {
    setEditingMember(member)
    setEditMemberData({
      name: member.name,
      phone: member.phone,
      address: member.address || '',
      birthday: member.birthday || '',
      role: member.role,
      duty: member.duty || '성도',
      labriId: member.labriId || '',
      familyGroupId: member.familyGroupId || '',
      familyInfo: member.familyInfo || ''
    })
  }

  const handleSaveMemberEdit = async () => {
    if (!editingMember) return
    await dbUpdateProfile(editingMember.id, {
      name: editMemberData.name,
      phone: editMemberData.phone,
      address: editMemberData.address,
      birthday: editMemberData.birthday,
      role: editMemberData.role,
      duty: editMemberData.duty,
      labriId: editMemberData.labriId || undefined,
      familyGroupId: editMemberData.familyGroupId || undefined,
      familyInfo: editMemberData.familyInfo
    })
    setEditingMember(null)
    showToast(`✅ ${editMemberData.name} 성도 정보가 수정되었습니다.`)
  }

  // ── 식사 집계 (DB 실시간 연동) ──
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const [mealViewMode, setMealViewMode] = useState<'summary' | 'individual'>('summary')
  const [forecastWeek, setForecastWeek] = useState(0)
  const [dbMealRegistrations, setDbMealRegistrations] = useState<any[]>([])

  useEffect(() => {
    dbFetchMealRegistrations().then(regs => {
      if (regs) setDbMealRegistrations(regs)
    })
  }, [])

  // 주차별 식수 계산
  const weekMealStats = useMemo(() => {
    return upcomingSundays.map(sun => {
      const targetDate = sun.dateStr
      const matched = dbMealRegistrations.filter(r => r.date_str === targetDate && r.attending)
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
  }, [upcomingSundays, dbMealRegistrations])

  const currentWeekStat = weekMealStats[forecastWeek] || { total: 0, adult: 0, child: 0, rows: [] }

  // 식수 복사 토스트 (alert 대체)
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1000)
  }

  const handleCopyMeal = () => {
    const dateStr = upcomingSundays[forecastWeek]?.displayStr || ''
    const { total, adult, child } = currentWeekStat
    const txt = `[더브릿지교회] ${dateStr} 주일 식수 집계 안내\n\n• 총 식사 인원: ${total}명\n• 성인: ${adult}명 | 어린이: ${child}명\n\n(맛있는 주일 식사 준비 감사드립니다! 🙏)`
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

  const handleApprove = async (userId: string) => {
    const assignedLabri = selectedLabris[userId] || '미정'
    const assignedRole = selectedRoles[userId] || 'MEMBER'
    const assignedDuty = dutyInputs[userId] || '성도'
    const familyInfo = familyInputs[userId] || ''
    
    // 자동 가족 그룹 ID 결정 (연결된 가족이 있으면 기존 그룹 사용 또는 자동 생성)
    const linkedIds = familyLinks[userId] || []
    let resolvedFamilyGroupId = ''

    if (linkedIds.length > 0) {
      // 연결된 성도들 중 이미 familyGroupId가 있는 사람이 있는지 확인
      const existingLinked = allUsers.find(u => linkedIds.includes(u.id) && u.familyGroupId)
      if (existingLinked && existingLinked.familyGroupId) {
        resolvedFamilyGroupId = existingLinked.familyGroupId
      } else {
        // 둘 다 없으면 새로 생성 (fam_시간기반)
        resolvedFamilyGroupId = `fam_${Date.now().toString(36)}`
        // 연결된 성도들에게도 새 familyGroupId를 즉시 DB에 부여
        for (const lid of linkedIds) {
          await dbUpdateProfile(lid, { familyGroupId: resolvedFamilyGroupId })
        }
      }
    }

    onApproveUser(userId, assignedLabri, assignedRole, assignedDuty, familyInfo, resolvedFamilyGroupId || undefined)
    showToast(`✅ 가입 승인 완료 (${assignedLabri} · ${assignedDuty} · ${assignedRole})`)
  }

  // ── 쿠폰 (DB에서만 로드, 초기값 빈 객체) ──
  const [couponAccounts, setCouponAccounts] = useState<Record<string, MealCouponAccount>>({})

  useEffect(() => {
    dbFetchMealCoupons().then(dbCoupons => {
      if (dbCoupons && Object.keys(dbCoupons).length > 0) {
        setCouponAccounts(dbCoupons)
      }
    })
  }, [])

  const handleUpdateCoupon = async (famId: string, familyName: string, delta: number) => {
    const famName = familyName || couponAccounts[famId]?.familyName || famId
    const newBal = await dbUpdateMealCoupon(famId, famName, delta)
    const newHistItem = {
      id: `h_${Date.now()}`,
      dateStr: new Date().toISOString().slice(0, 10),
      type: (delta > 0 ? 'GRANT' : 'USE') as 'GRANT' | 'USE',
      amount: Math.abs(delta),
      note: delta > 0 ? (delta === 10 ? '관리자 10장 발급' : '관리자 발급') : '식사 사용/차감'
    }
    setCouponAccounts(prev => {
      const prevAcc = prev[famId]
      const prevHist = prevAcc?.history || []
      return {
        ...prev,
        [famId]: {
          familyGroupId: famId,
          familyName: famName,
          balance: newBal,
          history: [...prevHist, newHistItem]
        }
      }
    })
    showToast(`🎟️ ${famName.replace(' 가정', '')}: ${delta > 0 ? `+${delta}장 발급` : `${delta}장 차감`} (잔여: ${newBal}장)`)
  }

  // ── 쿠폰구매 QR 모달 ──
  const [showQrModal, setShowQrModal] = useState(false)
  const MEAL_QR_IMAGE_URL = 'https://isbwfpokewammwiicxqr.supabase.co/storage/v1/object/public/church-assets/photos/meal_account.jpg'

  // ── 출석 탭 — 월/날짜 드롭다운 (DB 기록 기반) ──
  const recentMonths = useMemo(() => getRecentMonths(3), [])
  const [statsMonth, setStatsMonth] = useState(recentMonths[recentMonths.length - 1].value)
  const [dbAttendanceData, setDbAttendanceData] = useState<Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]>>({})

  useEffect(() => {
    dbFetchAttendanceRecords().then(records => {
      if (records && records.length > 0) {
        const grouped: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]> = {}
        records.forEach(r => {
          if (!grouped[r.date_str]) grouped[r.date_str] = []
          grouped[r.date_str].push({
            userId: r.user_id,
            status: r.status,
            note: r.note || ''
          })
        })
        setDbAttendanceData(grouped)
      }
    })
  }, [])

  const combinedMonthData = useMemo(() => {
    const filteredDb: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]> = {}
    Object.entries(dbAttendanceData).forEach(([date, list]) => {
      if (date.startsWith(statsMonth)) {
        filteredDb[date] = list
      }
    })
    return filteredDb
  }, [statsMonth, dbAttendanceData])

  const monthSundays = useMemo(() => {
    return Object.keys(combinedMonthData).sort()
  }, [combinedMonthData])

  const [statsDate, setStatsDate] = useState<string>('')
  const selectedStatsDate = statsDate && monthSundays.includes(statsDate) ? statsDate : (monthSundays[monthSundays.length - 1] || '')

  const attendanceRows = useMemo(() => {
    const data = combinedMonthData[selectedStatsDate] || []
    return allUsers.filter(u => u.role !== 'PENDING').map(u => {
      const rec = data.find(r => r.userId === u.id)
      return { user: u, status: rec?.status || null, note: rec?.note || '' }
    })
  }, [combinedMonthData, selectedStatsDate, allUsers])

  // 라브리별 통계 (합계 행 포함)
  const labriStats = useMemo(() => {
    const labriGroups = ['라브리1', '라브리2', '라브리3', '라브리 미정']
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
    const monthData = combinedMonthData
    let csv = '날짜,성도명,소속라브리,출석여부,결석사유\n'
    Object.entries(monthData).sort().forEach(([date, records]) => {
      records.forEach((rec: { userId: string; status: string; note: string }) => {
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
          { id: 'meals', label: '🍱 식사' },
          { id: 'approval', label: `👥 승인${pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}` },
          { id: 'members', label: '📋 성도관리' },
          { id: 'coupons', label: '🎟️ 쿠폰' },
          { id: 'stats', label: '📊 출석' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setAdminTab(id as typeof adminTab)}
            className={`flex-1 py-2 px-1.5 rounded-lg shrink-0 transition-all ${
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
                        <option value="라브리1">라브리1</option>
                        <option value="라브리2">라브리2</option>
                        <option value="라브리3">라브리3</option>
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
          <div className="space-y-2">
            {(() => {
              // DB 쿠폰 계정 + allUsers 가정 그룹을 병합하여 전체 표시
              const approvedUsers = allUsers.filter(u => u.role !== 'PENDING')
              const familyMap: Record<string, string> = {}
              approvedUsers.forEach(u => {
                const fid = u.familyGroupId || `fam_single_${u.id}`
                if (!familyMap[fid]) {
                  familyMap[fid] = u.familyGroupId ? `${u.name} 가정` : `${u.name} 성도`
                }
              })

              const mergedAccounts: Record<string, MealCouponAccount> = {}
              // DB에 있는 쿠폰 계정 먼저
              Object.entries(couponAccounts).forEach(([fid, acc]) => {
                mergedAccounts[fid] = acc
              })
              // DB에 없는 가정 추가 (잔액 0)
              Object.entries(familyMap).forEach(([fid, fname]) => {
                if (!mergedAccounts[fid]) {
                  mergedAccounts[fid] = { familyGroupId: fid, familyName: fname, balance: 0, history: [] }
                }
              })

              const entries = Object.values(mergedAccounts)
              if (entries.length === 0) {
                return <p className="text-xs text-gray-400 text-center py-4">승인된 성도가 없습니다.</p>
              }

              // 최근 발급/차감 이력 최신순 정렬 (이력이 최신인 가정 상단 배치)
              const sortedEntries = [...entries].sort((a, b) => {
                const aLastHist = a.history && a.history.length > 0 ? a.history[a.history.length - 1] : null
                const bLastHist = b.history && b.history.length > 0 ? b.history[b.history.length - 1] : null

                const aDate = aLastHist?.dateStr || (a.balance > 0 ? '1999-01-01' : '')
                const bDate = bLastHist?.dateStr || (b.balance > 0 ? '1999-01-01' : '')

                if (aDate && bDate) {
                  return bDate.localeCompare(aDate)
                }
                if (aDate) return -1
                if (bDate) return 1
                return a.familyName.localeCompare(b.familyName)
              })

              return sortedEntries.map((acc) => {
                const lastHist = acc.history && acc.history.length > 0 ? acc.history[acc.history.length - 1] : null
                return (
                  <div key={acc.familyGroupId} className="p-3 bg-gray-50 rounded-xl flex items-center justify-between text-xs hover:bg-gray-100/70 transition-all">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-gray-800">{acc.familyName.replace(' 가정', '')}</h4>
                        {lastHist && (
                          <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                            {lastHist.type === 'GRANT' ? '발급' : '차감'} {lastHist.dateStr.slice(5)}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">잔여 쿠폰: <strong className="text-[#335f87]">{acc.balance}장</strong></p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleUpdateCoupon(acc.familyGroupId, acc.familyName, -1)}
                        className="w-7 h-7 bg-white border border-gray-200 text-gray-600 rounded-lg font-bold flex items-center justify-center hover:bg-gray-100 shadow-2xs active:scale-95"
                        title="1장 차감"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="font-bold text-[#335f87] w-6 text-center text-sm">{acc.balance}</span>
                      <button
                        onClick={() => handleUpdateCoupon(acc.familyGroupId, acc.familyName, 1)}
                        className="w-7 h-7 bg-white border border-gray-200 text-gray-600 rounded-lg font-bold flex items-center justify-center hover:bg-gray-100 shadow-2xs active:scale-95"
                        title="1장 발급"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => handleUpdateCoupon(acc.familyGroupId, acc.familyName, 10)}
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-lg shadow-2xs active:scale-95 transition-all"
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
      )}

      {/* ── 성도관리 탭 ── */}
      {adminTab === 'members' && (
        <div className="space-y-3">
          {/* 검색 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="이름, 전화번호, 이메일로 검색..."
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 bg-white rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87] shadow-2xs"
            />
            {memberSearch && <button onClick={() => setMemberSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">✕</button>}
          </div>

          <p className="text-[10px] text-gray-400 font-semibold">총 {filteredMembers.length}명의 성도</p>

          {/* 성도 리스트 */}
          {filteredMembers.map(member => (
            <div key={member.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                    {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" /> : member.name.slice(0, 1)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">{getUserDisplayName(member, '')}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">{member.email || '이메일 없음'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    member.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                    member.role === 'LEADER' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{member.role}</span>
                  <button onClick={() => handleStartEditMember(member)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-all">
                    <Edit2 size={13} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500 pl-12">
                <span>📞 {member.phone || '미입력'}</span>
                <span>🏠 {member.address || '미입력'}</span>
                <span>🎂 {member.birthday || '미입력'}</span>
                <span>⛪ {member.labriId || '라브리 미정'}</span>
                {member.familyInfo && <span className="col-span-2">👨‍👩‍👧 {member.familyInfo}</span>}
              </div>
            </div>
          ))}

          {filteredMembers.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-gray-100 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>
          )}
        </div>
      )}

      {/* ── 성도 편집 모달 ── */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">성도 정보 수정</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{editingMember.name} ({editingMember.email || '이메일 없음'})</p>
              </div>
              <button onClick={() => setEditingMember(null)} className="p-1 hover:bg-white/10 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {/* 이름 */}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">이름</label>
                <input type="text" value={editMemberData.name} onChange={e => setEditMemberData(p => ({ ...p, name: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]" />
              </div>

              {/* 등급 + 직분 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold">등급 (Role)</label>
                  <select value={editMemberData.role} onChange={e => setEditMemberData(p => ({ ...p, role: e.target.value as Role }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none">
                    <option value="MEMBER">일반 성도</option>
                    <option value="LEADER">라브리 리더</option>
                    <option value="ADMIN">관리자</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold">직분</label>
                  <select value={editMemberData.duty} onChange={e => setEditMemberData(p => ({ ...p, duty: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none">
                    {['성도', '청년', '서리집사', '집사', '권사', '장로', '선생님', '목사', '전도사', '사모'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 소속 라브리 */}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">소속 라브리</label>
                <select value={editMemberData.labriId} onChange={e => setEditMemberData(p => ({ ...p, labriId: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none">
                  <option value="">라브리 미정</option>
                  <option value="라브리1">라브리1</option>
                  <option value="라브리2">라브리2</option>
                  <option value="라브리3">라브리3</option>
                </select>
              </div>

              {/* 연락처 */}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">연락처</label>
                <input type="tel" value={editMemberData.phone} onChange={e => setEditMemberData(p => ({ ...p, phone: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]" placeholder="037-123-4567" />
              </div>

              {/* 주소 */}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">주소</label>
                <input type="text" value={editMemberData.address} onChange={e => setEditMemberData(p => ({ ...p, address: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]" placeholder="경남 A동 1023호" />
              </div>

              {/* 생년월일 */}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">생년월일 (YYYY-MM-DD)</label>
                <input type="text" value={editMemberData.birthday} onChange={e => setEditMemberData(p => ({ ...p, birthday: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]" placeholder="1990-08-15" />
              </div>

              {/* 가족 연결 (자동 그룹 연결) */}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">가족/배우자 연결</label>
                <select
                  value={editMemberData.familyGroupId || ''}
                  onChange={e => {
                    const val = e.target.value
                    setEditMemberData(p => ({ ...p, familyGroupId: val }))
                  }}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
                >
                  <option value="">단독 (가족 연결 없음)</option>
                  {approvedMembers
                    .filter(m => m.id !== editingMember.id)
                    .map(m => {
                      const famId = m.familyGroupId || `fam_${m.id.slice(0, 8)}`
                      return (
                        <option key={m.id} value={famId}>
                          {m.name} {m.duty} ({m.labriId || '미정'}) 와(과) 한 가족으로 묶기
                        </option>
                      )
                    })
                  }
                </select>
                <p className="text-[10px] text-gray-400 mt-1">가족으로 묶으면 식사 신청과 식사 쿠폰이 함께 연동됩니다.</p>
              </div>

              {/* 가족 현황 메모 */}
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">가족 현황 메모</label>
                <input type="text" value={editMemberData.familyInfo} onChange={e => setEditMemberData(p => ({ ...p, familyInfo: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]" placeholder="배우자: 홍길순, 자녀: 홍길동" />
              </div>

              {/* 버튼 */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditingMember(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
                <button onClick={handleSaveMemberEdit} className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1">
                  <Save size={13} /> 저장
                </button>
              </div>
            </div>
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
              const colors: Record<string, string> = { '라브리1': '#335f87', '라브리2': '#914c24', '라브리3': '#2d7d46', '라브리 미정': '#6b7280' }
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

      {/* ── 쿠폰구매 QR 모달 ── */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
    </div>
  )
}
