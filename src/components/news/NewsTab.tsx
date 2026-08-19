'use client'

import { useState, useMemo, useEffect } from 'react'
import { UserProfile, isApprovedMember } from '../../lib/mockData'
import { buildDependentEntries } from '../../lib/familyInfo'
import MemberNewsBoard from './MemberNewsBoard'
import ScheduleCalendar from './ScheduleCalendar'
import AddressBook from './AddressBook'
import AttendanceCheckModal from './AttendanceCheckModal'

interface NewsTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  /** 알림을 눌러서 들어온 경우 열어야 할 서브탭 ('memberNews' 등). 없으면 기본 화면. */
  openSubTab?: string
  /** 같은 서브탭을 연달아 요청해도 다시 열리도록 하는 번호표 */
  openToken?: number
}

// ── 우리소식 탭: 교회일정 | 가족소식 | 주소록 3개 서브탭 + 출석체크(리더/관리자) ──
// 각 서브탭은 별도 컴포넌트(MemberNewsBoard/ScheduleCalendar/AddressBook)로 분리되어 있으며,
// 탭 전환 시 상태(작성 중인 글, 펼친 항목 등)가 유지되도록 언마운트 대신 CSS로 숨김 처리합니다.
export default function NewsTab({ currentUser, allUsers, openSubTab = '', openToken = 0 }: NewsTabProps) {
  // 우리소식을 열면 교회일정이 먼저 보이게 합니다(가장 자주 확인하는 화면).
  const [subTab, setSubTab] = useState<'memberNews' | 'schedule' | 'members'>('schedule')

  // 서브탭을 바꿀 때도 화면 맨 위에서 시작합니다(큰 탭과 동일한 규칙).
  const goSubTab = (next: 'memberNews' | 'schedule' | 'members') => {
    setSubTab(next)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' })
  }
  // 알림에서 들어온 경우 그 글이 있는 서브탭을 열어 줍니다.
  useEffect(() => {
    if (openSubTab === 'memberNews' || openSubTab === 'schedule' || openSubTab === 'members') {
      goSubTab(openSubTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openToken, openSubTab])

  const isLeaderOrAdmin = currentUser.role === 'LEADER' || currentUser.role === 'ADMIN'

  // 주소록/일정용 대상: 승인대기자·쿠폰관리자 제외 + 미가입 자녀 등 가상 항목 포함 (생일 달력에도 사용)
  const members = allUsers.filter(u => isApprovedMember(u.role) && u.role !== 'COUPON')
  const addressBookEntries = useMemo(() => [...members, ...buildDependentEntries(members)], [members])

  return (
    <div className="space-y-5 pb-6 relative">
      {/* 상단 헤더 + 출석체크 버튼 */}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-gray-900 text-base">우리소식</h2>
        <AttendanceCheckModal currentUser={currentUser} allUsers={allUsers} />
      </div>

      {/* 서브탭 3종: 교회일정 | 가족소식 | 주소록 */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl text-xs font-bold text-center">
        <button
          onClick={() => goSubTab('schedule')}
          className={`py-2 rounded-lg transition-all ${subTab === 'schedule' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >📅 교회일정</button>
        <button
          onClick={() => goSubTab('memberNews')}
          className={`py-2 rounded-lg transition-all ${subTab === 'memberNews' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >📣 가족소식</button>
        <button
          onClick={() => goSubTab('members')}
          className={`py-2 rounded-lg transition-all ${subTab === 'members' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >📖 주소록</button>
      </div>

      <div className={subTab === 'memberNews' ? '' : 'hidden'}>
        <MemberNewsBoard currentUser={currentUser} allUsers={allUsers} isLeaderOrAdmin={isLeaderOrAdmin} />
      </div>
      <div className={subTab === 'schedule' ? '' : 'hidden'}>
        <ScheduleCalendar isLeaderOrAdmin={isLeaderOrAdmin} addressBookEntries={addressBookEntries} allUsers={allUsers} />
      </div>
      <div className={subTab === 'members' ? '' : 'hidden'}>
        <AddressBook addressBookEntries={addressBookEntries} allUsers={allUsers} />
      </div>
    </div>
  )
}
