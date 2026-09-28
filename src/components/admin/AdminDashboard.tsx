'use client'

import { useState, useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { UserProfile, Role } from '../../lib/mockData'
import { dbFetchAttendanceRecords } from '../../lib/db'
import { getUnassignedChildren } from '../../lib/familyInfo'
import { useCachedQuery } from '../../lib/dataCache'
import MealsTab from './MealsTab'
import ApprovalTab from './ApprovalTab'
import CouponsTab from './CouponsTab'
import MembersTab from './MembersTab'
import StatsTab from './StatsTab'
import NotificationJobsTab from './NotificationJobsTab'
import BulletinTab from './BulletinTab'
import Toast from '../ui/Toast'

interface AdminDashboardProps {
  currentUser?: UserProfile
  allUsers: UserProfile[]
  // 저장 실패를 화면에서 구분해 보여줄 수 있도록 결과를 돌려받습니다.
  onApproveUser: (userId: string, labriId: string, role: Role, duty: string, familyInfo: string, familyGroupId?: string, familyRole?: string) => Promise<{ error: { message?: string } | null }>
  onRejectUser: (userId: string) => Promise<{ error: { message?: string } | null }>
  onUpdateUsers?: React.Dispatch<React.SetStateAction<UserProfile[]>>
  onBack: () => void
  /**
   * 알림(앱 안·휴대폰 푸시)을 눌러 들어왔을 때 바로 열어 줄 탭 ('approval' | 'stats' 등).
   * 이 권한으로 볼 수 없는 탭이면 무시하고 기본 탭을 엽니다.
   */
  openTab?: string
  /** 같은 탭을 연달아 요청해도 다시 열리도록 하는 번호표 (우리소식·나눔 탭과 같은 방식) */
  openToken?: number
}

type AdminTabId = 'meals' | 'approval' | 'stats' | 'coupons' | 'members' | 'alerts' | 'bulletin'

export default function AdminDashboard({ currentUser, allUsers, onApproveUser, onRejectUser, onUpdateUsers, onBack, openTab = '', openToken = 0 }: AdminDashboardProps) {
  const isLeader = currentUser?.role === 'LEADER'
  const isCouponManager = currentUser?.role === 'COUPON'
  // 선생님은 출석·식사 탭만 볼 수 있습니다 (성도 정보·식권은 안 보입니다)
  const isTeacher = currentUser?.role === 'TEACHER'
  const defaultTab = isCouponManager ? 'coupons' : isTeacher ? 'stats' : 'meals'

  // 권한별로 보이는 탭 — 아래 탭 메뉴와 알림으로 여는 탭이 같은 기준을 씁니다.
  const visibleTabIds: AdminTabId[] = [
    !isCouponManager && 'meals',
    !isLeader && !isCouponManager && !isTeacher && 'approval',
    !isCouponManager && !isTeacher && 'members',
    !isLeader && !isTeacher && 'coupons',
    !isCouponManager && 'stats',
    currentUser?.role === 'ADMIN' && 'bulletin',
    currentUser?.role === 'ADMIN' && 'alerts',
  ].filter(Boolean) as AdminTabId[]
  const requestedTab = visibleTabIds.includes(openTab as AdminTabId) ? (openTab as AdminTabId) : null

  // 🐛 예전엔 "출석체크가 아직 안 끝났습니다"·"새 가입 신청" 알림을 누르면 내정보 탭까지만 가서,
  //    관리자 대시보드를 찾아 들어간 뒤 해당 탭을 다시 골라야 했습니다. → 알림이 가리키는 탭을 바로 엽니다.
  const [adminTab, setAdminTab] = useState<AdminTabId>(requestedTab ?? defaultTab)
  const [prevOpenToken, setPrevOpenToken] = useState(openToken)
  if (openToken !== prevOpenToken) {
    setPrevOpenToken(openToken)
    if (requestedTab) setAdminTab(requestedTab)
  }

  const pendingCount = allUsers.filter(u => u.role === 'PENDING' && !!u.signupRequestedAt).length

  // 부모가 등록했지만 아직 교회학교 그룹이 없는 자녀 — 그룹을 정해 주기 전까지
  // 주소록·생일·출석 어디에도 안 나오므로 성도 탭에 숫자로 알려 줍니다.
  const unassignedChildren = useMemo(() => getUnassignedChildren(allUsers), [allUsers])

  // 식수 복사 등 여러 탭에서 공통으로 쓰는 토스트 (alert 대체)
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1000)
  }

  // ── 출석 데이터: "성도" 탭(장기결석자 정렬)과 "출석" 탭이 함께 사용하므로 이 상위 컴포넌트에서 관리 ──
  // 전체 출석 이력을 캐시로 가져옵니다.
  const { data: rawAttendanceRecords, refetch: loadAttendanceStats } = useCachedQuery(
    'attendanceRecords:all',
    () => dbFetchAttendanceRecords()
  )

  const dbAttendanceData = useMemo(() => {
    const grouped: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]> = {}
    if (!rawAttendanceRecords || rawAttendanceRecords.length === 0) return grouped
    rawAttendanceRecords.forEach(r => {
      if (!grouped[r.date_str]) grouped[r.date_str] = []
      grouped[r.date_str].push({
        userId: r.user_id,
        status: r.status,
        note: r.note || ''
      })
    })
    return grouped
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
      <Toast message={toastMsg} />

      {/* 헤더 */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="tap-area relative p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="font-bold text-base">
              {isCouponManager ? '🎟️ 쿠폰 관리 대시보드' : isTeacher ? '🧒 교회학교 출석 관리' : isLeader ? '📊 리더 대시보드' : '🛠️ 관리자 대시보드'}
            </h1>
            <p className="text-2xs text-slate-400">
              {isCouponManager ? '식사 쿠폰 전용 관리' : isTeacher ? '담당 자녀 그룹 출석 확인' : isLeader ? '식사 집계 및 출석 통계' : '더브릿지교회 운영 관리 모드'}
            </p>
          </div>
        </div>
      </div>

      {/* 탭 메뉴 (권한별 동적 필터링: LEADER는 식사/출석만, COUPON은 쿠폰만, ADMIN은 전체)
          탭이 7개라 한 줄에 다 넣으면 글자가 뭉개집니다. 한 줄에 최대 4개씩 격자로
          접어 두 줄로 보여 줍니다. 탭이 4개 이하인 권한에서는 예전처럼 한 줄입니다. */}
      {(() => {
        const tabs = [
          { id: 'meals', label: '🍱 식사' },
          { id: 'approval', label: `👥 승인${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          { id: 'members', label: `📋 성도${unassignedChildren.length > 0 ? ` (${unassignedChildren.length})` : ''}` },
          { id: 'coupons', label: '🎟️ 쿠폰' },
          { id: 'stats', label: '📊 출석' },
          { id: 'bulletin', label: '📖 주보' },
          { id: 'alerts', label: '🔔 알림' },
        ].filter(t => visibleTabIds.includes(t.id as AdminTabId))

        const cols = Math.min(4, tabs.length)

        return (
          <div
            className="grid gap-1 bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setAdminTab(id as typeof adminTab)}
                className={`py-2 px-1.5 rounded-lg transition-all whitespace-nowrap ${
                  adminTab === id ? 'bg-slate-900 text-white font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )
      })()}

      {/* ── 식사 집계 탭 ── */}
      {adminTab === 'meals' && <MealsTab showToast={showToast} allUsers={allUsers} currentUser={currentUser} />}

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

      {/* ── 주보 작성 탭 (관리자 전용) ── */}
      {adminTab === 'bulletin' && (
        <BulletinTab currentUser={currentUser} allUsers={allUsers} showToast={showToast} />
      )}

      {/* ── 자동 알림 점검 탭 (관리자 전용) ── */}
      {adminTab === 'alerts' && <NotificationJobsTab showToast={showToast} currentUser={currentUser} allUsers={allUsers} />}

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
