'use client'

import { useState } from 'react'
import BottomNav from '../src/components/BottomNav'
import HomeTab from '../src/components/home/HomeTab'
import NewsTab from '../src/components/news/NewsTab'
import SharingTab from '../src/components/sharing/SharingTab'
import RequestTab from '../src/components/request/RequestTab'
import MyPageTab from '../src/components/mypage/MyPageTab'
import AdminDashboard from '../src/components/admin/AdminDashboard'
import AuthPending from '../src/components/auth/AuthPending'
import { INITIAL_USERS, UserProfile, Role, getUserDisplayName } from '../src/lib/mockData'
import { LogIn } from 'lucide-react'

export default function Home() {
  const [currentTab, setCurrentTab] = useState('home')
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS)

  // 현재 사용자 로그인 ID (기본: u1 김목사 - ADMIN / 'guest'는 비로그인)
  const [currentUserId, setCurrentUserId] = useState<string>('u1')
  const [isAdminViewMode, setIsAdminViewMode] = useState<boolean>(false)
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false)

  // 탭 전환: 관리자 대시보드 모드 자동 해제
  const handleSetCurrentTab = (tab: string) => {
    setIsAdminViewMode(false)
    setCurrentTab(tab)
  }

  const isGuest = currentUserId === 'guest'

  const currentUser: UserProfile = users.find(u => u.id === currentUserId) || {
    id: 'guest',
    name: '방문자',
    email: '',
    phone: '',
    role: 'PENDING' as Role,
    duty: '방문자',
    createdAt: ''
  }

  // 가입 신청 처리
  const handleRegisterSubmit = (name: string, phone: string, address: string) => {
    const newUser: UserProfile = {
      id: `u_${Date.now()}`,
      name,
      email: `${name}@gmail.com`,
      phone,
      address,
      role: 'PENDING',
      duty: '성도',
      createdAt: '2026-08-06'
    }
    setUsers(prev => [...prev, newUser])
    setCurrentUserId(newUser.id)
    setShowAuthModal(false)
    alert('가입 신청이 완료되었습니다! 관리자의 승인을 기다려주세요.')
  }

  // 관리자 - 가입 승인 처리
  const handleApproveUser = (userId: string, labriId: string, role: Role, familyInfo: string) => {
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, role, labriId, familyInfo } : u
    ))
  }

  const handleRejectUser = (userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId))
  }

  const isGuestOrPending = isGuest || currentUser.role === 'PENDING'

  // 탭 잠금 처리 (공통 래퍼 - Warm Welcome UI)
  const LockedTab = ({ title, msg }: { title: string; msg: string }) => (
    <div className="space-y-4 my-2">
      <div className="bg-gradient-to-br from-white to-[#f7f9ff] rounded-2xl p-6 text-center space-y-3.5 border border-blue-100 shadow-sm relative overflow-hidden">
        <div className="w-12 h-12 bg-blue-50 text-[#335f87] rounded-full flex items-center justify-center mx-auto text-xl font-bold">
          🤝
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-gray-900">{title}</h3>
          <p className="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto">
            {msg}
          </p>
        </div>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-5 py-2.5 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95"
        >
          더브릿지 교인 가입 / 로그인하기
        </button>
      </div>

      {/* 블러 프리뷰 힌트 카드 */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 opacity-60 pointer-events-none select-none blur-[1px] space-y-2">
        <div className="h-3 bg-gray-200 rounded-full w-2/3" />
        <div className="h-3 bg-gray-100 rounded-full w-full" />
        <div className="h-3 bg-gray-100 rounded-full w-4/5" />
      </div>
    </div>
  )

  return (
    <div className="bg-[#f7f9ff] min-h-screen pb-20 max-w-[480px] mx-auto relative border-x border-gray-200/60 shadow-xl font-sans">
      {/* 🛠️ 테스트 시뮬레이터 */}
      <header className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50 border-b border-slate-800">
        <div className="flex items-center gap-1.5 font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-slate-200">계정 시뮬레이터:</span>
        </div>
        <select
          value={currentUserId}
          onChange={(e) => {
            setCurrentUserId(e.target.value)
            setIsAdminViewMode(false)
          }}
          className="bg-slate-800 text-amber-300 font-bold px-2.5 py-1 rounded-lg border border-slate-700 text-[11px] focus:outline-none"
        >
          <option value="guest">🌐 비로그인 (첫 방문자)</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role}{u.labriId ? ` - ${u.labriId}` : ''})
            </option>
          ))}
        </select>
      </header>

      {/* 브랜드 헤더 */}
      <div className="bg-white/80 backdrop-blur-md px-5 py-3 border-b border-gray-100 flex items-center justify-between sticky top-[37px] z-40">
        <h1 className="text-xl font-black text-[#335f87] tracking-tight">The Bridge</h1>

        {isGuest ? (
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-3 py-1.5 bg-[#335f87] hover:bg-[#2b5072] text-white font-bold text-xs rounded-xl shadow-2xs flex items-center gap-1"
          >
            <LogIn size={13} /> 로그인 / 가입
          </button>
        ) : (
          <span className="text-[11px] bg-blue-50 text-[#335f87] font-bold px-2.5 py-1 rounded-full border border-blue-100/60 shadow-2xs">
            {getUserDisplayName(currentUser)}
          </span>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <main className="p-4">
        {isAdminViewMode ? (
          <AdminDashboard
            allUsers={users}
            onApproveUser={handleApproveUser}
            onRejectUser={handleRejectUser}
            onBack={() => setIsAdminViewMode(false)}
          />
        ) : (
          <>
            {/* 홈 탭 */}
            {currentTab === 'home' && (
              <HomeTab currentUser={currentUser} allUsers={users} isGuest={isGuest} />
            )}

            {/* 우리소식 탭 */}
            {currentTab === 'news' && (
              isGuestOrPending ? (
                <LockedTab
                  title="우리소식"
                  msg="교회 일정과 주소록은 등록된 성도만 이용할 수 있습니다."
                />
              ) : (
                <NewsTab currentUser={currentUser} allUsers={users} />
              )
            )}

            {/* 나눔 탭 */}
            {currentTab === 'sharing' && (
              isGuestOrPending ? (
                <LockedTab
                  title="성도 기도제목 및 묵상 나눔"
                  msg="더브릿지 교우들이 마음을 모아 기도하고 묵상을 나눔하는 공간입니다. 가입 승인 후 함께하실 수 있습니다."
                />
              ) : (
                <SharingTab currentUser={currentUser} />
              )
            )}

            {/* 신청 탭 */}
            {currentTab === 'request' && (
              isGuestOrPending ? (
                <LockedTab
                  title="식사 및 행사 신청"
                  msg="주일 식사 신청과 교회 행사 신청은 등록된 성도만 이용할 수 있습니다."
                />
              ) : (
                <RequestTab currentUser={currentUser} allUsers={users} />
              )
            )}

            {/* 마이페이지 탭 */}
            {currentTab === 'mypage' && (
              isGuestOrPending ? (
                <AuthPending
                  currentRole={currentUser.role}
                  onRegisterSubmit={handleRegisterSubmit}
                  onRefreshStatus={() => alert('승인 상태를 재확인하였습니다.')}
                />
              ) : (
                <MyPageTab
                  currentUser={currentUser}
                  onNavigateAdmin={() => setIsAdminViewMode(true)}
                />
              )
            )}
          </>
        )}
      </main>

      {/* 회원가입 / 로그인 모달 */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 relative">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-3 right-3 text-gray-400 font-bold text-xs px-2"
            >
              ✕ 닫기
            </button>
            <AuthPending
              currentRole={currentUser.role}
              onRegisterSubmit={handleRegisterSubmit}
              onRefreshStatus={() => alert('승인 상태를 재확인하였습니다.')}
            />
          </div>
        </div>
      )}

      {/* 하단 네비게이션 바 */}
      <BottomNav currentTab={currentTab} setCurrentTab={handleSetCurrentTab} />
    </div>
  )
}