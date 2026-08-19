'use client'

import { useState, useMemo, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { UserProfile, Role } from '../../lib/mockData'
import { dbFetchAttendanceRecords } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import MealsTab from './MealsTab'
import ApprovalTab from './ApprovalTab'
import CouponsTab from './CouponsTab'
import MembersTab from './MembersTab'
import StatsTab from './StatsTab'

interface AdminDashboardProps {
  currentUser?: UserProfile
  allUsers: UserProfile[]
  // 저장 실패를 화면에서 구분해 보여줄 수 있도록 결과를 돌려받습니다.
  onApproveUser: (userId: string, labriId: string, role: Role, duty: string, familyInfo: string, familyGroupId?: string, familyRole?: string) => Promise<{ error: any }>
  onRejectUser: (userId: string) => Promise<{ error: any }>
  onUpdateUsers?: React.Dispatch<React.SetStateAction<UserProfile[]>>
  onBack: () => void
}

export default function AdminDashboard({ currentUser, allUsers, onApproveUser, onRejectUser, onUpdateUsers, onBack }: AdminDashboardProps) {
  const isLeader = currentUser?.role === 'LEADER'
  const isCouponManager = currentUser?.role === 'COUPON'
  const defaultTab = isCouponManager ? 'coupons' : 'meals'
  const [adminTab, setAdminTab] = useState<'meals' | 'approval' | 'stats' | 'coupons' | 'members'>(defaultTab)

  const pendingCount = allUsers.filter(u => u.role === 'PENDING').length

  // 식수 복사 등 여러 탭에서 공통으로 쓰는 토스트 (alert 대체)
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1000)
  }

  // ── 출석 데이터: "성도" 탭(장기결석자 정렬)과 "출석" 탭이 함께 사용하므로 이 상위 컴포넌트에서 관리 ──
  const [dbAttendanceData, setDbAttendanceData] = useState<Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]>>({})

  // 전체 출석 이력을 캐시로 가져옵니다. 예전에는 관리자 탭을 전환할 때마다("식사"/"쿠폰" 탭으로만
  // 옮겨도) 매번 전체 이력을 다시 조회했는데, 캐시 도입으로 짧은 시간 내 탭 전환은 재조회를 건너뜁니다.
  const { data: rawAttendanceRecords, refetch: loadAttendanceStats } = useCachedQuery(
    'attendanceRecords:all',
    () => dbFetchAttendanceRecords()
  )

  useEffect(() => {
    if (rawAttendanceRecords && rawAttendanceRecords.length > 0) {
      const grouped: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]> = {}
      rawAttendanceRecords.forEach(r => {
        if (!grouped[r.date_str]) grouped[r.date_str] = []
        grouped[r.date_str].push({
          userId: r.user_id,
          status: r.status,
          note: r.note || ''
        })
      })
      setDbAttendanceData(grouped)
    } else {
      setDbAttendanceData({})
    }
  }, [rawAttendanceRecords])

  // 출석기록이 존재하는 모든 주일 날짜(월 구분 없이 전체 이력, 최신순) — 연속 결석 주수 계산용
  const attendanceDateKeysDesc = useMemo(() => Object.keys(dbAttendanceData).sort().reverse(), [dbAttendanceData])

  // fromDate(포함)부터 과거로 거슬러 올라가며 연속으로 결석(ABSENT)한 주 수를 셉니다.
  // 출석(ATTEND)을 만나거나 그 주에 기록 자체가 없으면(미기록) 거기서 멈춥니다.
  const getAbsenceStreak = (userId: string, fromDate: string): number => {
    const startIdx = attendanceDateKeysDesc.indexOf(fromDate)
    if (startIdx === -1) return 0
    let streak = 0
    for (let i = startIdx; i < attendanceDateKeysDesc.length; i++) {
      const rec = (dbAttendanceData[attendanceDateKeysDesc[i]] || []).find(r => r.userId === userId)
      if (!rec || rec.status !== 'ABSENT') break
      streak++
    }
    return streak
  }

  // 가장 최근에 기록된 주일 날짜 (성도 리스트 정렬 기준 — 출석탭의 날짜 선택과는 무관하게 항상 최신 주 기준)
  const latestAttendanceDate = attendanceDateKeysDesc[0] || ''

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
            <h1 className="font-bold text-base">
              {isCouponManager ? '🎟️ 쿠폰 관리 대시보드' : isLeader ? '📊 리더 대시보드' : '🛠️ 관리자 대시보드'}
            </h1>
            <p className="text-[11px] text-slate-400">
              {isCouponManager ? '식사 쿠폰 전용 관리' : isLeader ? '식사 집계 및 출석 통계' : '더브릿지교회 운영 관리 모드'}
            </p>
          </div>
        </div>
      </div>

      {/* 탭 메뉴 (권한별 동적 필터링: LEADER는 식사/출석만, COUPON은 쿠폰만, ADMIN은 전체) */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold overflow-x-auto">
        {[
          { id: 'meals', label: '🍱 식사', show: !isCouponManager },
          { id: 'approval', label: `👥 승인${pendingCount > 0 ? ` (${pendingCount})` : ''}`, show: !isLeader && !isCouponManager },
          { id: 'members', label: '📋 성도', show: !isCouponManager },
          { id: 'coupons', label: '🎟️ 쿠폰', show: !isLeader },
          { id: 'stats', label: '📊 출석', show: !isCouponManager },
        ]
          .filter(t => t.show)
          .map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setAdminTab(id as typeof adminTab)}
              className={`flex-1 py-2 px-1.5 rounded-lg shrink-0 transition-all ${
                adminTab === id ? 'bg-slate-900 text-white font-bold' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
      </div>

      {/* ── 식사 집계 탭 ── */}
      {adminTab === 'meals' && <MealsTab showToast={showToast} allUsers={allUsers} />}

      {/* ── 가입 승인 탭 ── */}
      {adminTab === 'approval' && (
        <ApprovalTab
          allUsers={allUsers}
          onApproveUser={onApproveUser}
          onRejectUser={onRejectUser}
          onUpdateUsers={onUpdateUsers}
          showToast={showToast}
        />
      )}

      {/* ── 쿠폰 관리 탭 ── */}
      {adminTab === 'coupons' && <CouponsTab allUsers={allUsers} showToast={showToast} />}

      {/* ── 성도관리 탭 ── */}
      {adminTab === 'members' && (
        <MembersTab
          currentUser={currentUser}
          allUsers={allUsers}
          isLeader={isLeader}
          onUpdateUsers={onUpdateUsers}
          showToast={showToast}
          dbAttendanceData={dbAttendanceData}
          attendanceDateKeysDesc={attendanceDateKeysDesc}
          getAbsenceStreak={getAbsenceStreak}
          latestAttendanceDate={latestAttendanceDate}
        />
      )}

      {/* ── 출석 탭 ── */}
      {adminTab === 'stats' && (
        <StatsTab
          currentUser={currentUser}
          allUsers={allUsers}
          showToast={showToast}
          dbAttendanceData={dbAttendanceData}
          attendanceDateKeysDesc={attendanceDateKeysDesc}
          getAbsenceStreak={getAbsenceStreak}
          loadAttendanceStats={loadAttendanceStats}
        />
      )}
    </div>
  )
}
