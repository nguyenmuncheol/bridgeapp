'use client'

import { useState, useEffect } from 'react'
import BottomNav from '../src/components/BottomNav'
import HomeTab from '../src/components/home/HomeTab'
import NewsTab from '../src/components/news/NewsTab'
import SharingTab from '../src/components/sharing/SharingTab'
import RequestTab from '../src/components/request/RequestTab'
import MyPageTab from '../src/components/mypage/MyPageTab'
import AdminDashboard from '../src/components/admin/AdminDashboard'
import AuthPending from '../src/components/auth/AuthPending'
import ProfileSetupModal from '../src/components/auth/ProfileSetupModal'
import { UserProfile, Role, getUserDisplayName } from '../src/lib/mockData'
import { supabase } from '../src/lib/supabase'
import { dbFetchProfiles, dbApproveUser, dbRejectUser } from '../src/lib/db'
import { LogIn, LogOut } from 'lucide-react'

export default function Home() {
  const [currentTab, setCurrentTab] = useState('home')
  const [users, setUsers] = useState<UserProfile[]>([])  // 더미 데이터 제거
  const [isLoading, setIsLoading] = useState(true)        // DB 로드 완료 전 로딩

  // 현재 사용자 로그인 ID ('guest'는 비로그인)
  const [currentUserId, setCurrentUserId] = useState<string>('guest')
  const [isAdminViewMode, setIsAdminViewMode] = useState<boolean>(false)
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false)
  const [supabaseUser, setSupabaseUser] = useState<any>(null)
  const [showProfileSetup, setShowProfileSetup] = useState<boolean>(false)
  const [oauthName, setOauthName] = useState<string>('')
  const [oauthEmail, setOauthEmail] = useState<string>('')

  // Supabase 세션 및 전체 profiles 동기화
  // 🔒 개인정보 보호: 전화번호/주소/생일/가족정보가 담긴 성도 전체 명단(dbFetchProfiles)은
  // 로그인이 확인된 사용자에게만 불러옵니다. 비로그인 방문자에게는 절대 로드하지 않습니다.
  useEffect(() => {
    const loadFullRoster = () => {
      dbFetchProfiles().then(dbUsers => {
        if (dbUsers && dbUsers.length > 0) {
          setUsers(dbUsers)
        }
      }).catch(() => {})
    }

    // 1. 현재 로그인 세션 감지 (최초 1회)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSupabaseUser(session.user)
        const uMeta = session.user.user_metadata || {}
        const name = uMeta.full_name || uMeta.name || uMeta.preferred_username || uMeta.user_name || ''
        loadFullRoster()
        fetchProfile(session.user.id, session.user.email || '', name).finally(() => setIsLoading(false))
      } else {
        // 비로그인 방문자: 성도 개인정보 명단을 불러오지 않고 바로 로딩 종료
        setIsLoading(false)
      }
    })

    // 2. 로그인/로그아웃 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSupabaseUser(session.user)
        const uMeta = session.user.user_metadata || {}
        const name = uMeta.full_name || uMeta.name || uMeta.preferred_username || uMeta.user_name || ''
        loadFullRoster()
        fetchProfile(session.user.id, session.user.email || '', name)
      } else {
        setSupabaseUser(null)
        setUsers([]) // 로그아웃 시 메모리에 남아있던 성도 개인정보 명단 제거
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Supabase profiles 조회 → 신규면 추가정보 입력 모달 표시
  const fetchProfile = async (id: string, email: string, name: string) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
      
      let profileData = data
      // 1. profiles 레코드가 없는 완전 신규 가입자 -> 기본 레코드 자동 생성
      if (!profileData) {
        const newProfile = {
          id,
          name: name || '신규 교인',
          email: email || '',
          phone: '',
          address: '',
          role: 'PENDING',
          duty: '',
          created_at: new Date().toISOString()
        }
        await supabase.from('profiles').insert(newProfile)
        profileData = newProfile
      }

      const spUser: UserProfile = {
        id: profileData.id,
        name: profileData.name || name || '신규 교인',
        email: profileData.email || email || '',
        phone: profileData.phone || '',
        address: profileData.address || '',
        role: (profileData.role || 'PENDING') as Role,
        labriId: profileData.labri_id,
        duty: profileData.duty || '',
        familyGroupId: profileData.family_group_id,
        familyRole: profileData.family_role,
        familyInfo: profileData.family_info,
        birthday: profileData.birthday,
        avatarUrl: profileData.avatar_url,
        createdAt: profileData.created_at ? profileData.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      }

      setUsers(prev => {
        const exists = prev.some(u => u.id === spUser.id)
        return exists ? prev.map(u => u.id === spUser.id ? spUser : u) : [spUser, ...prev]
      })
      setCurrentUserId(spUser.id)
      setShowAuthModal(false)

      // 연락처 미입력 = 추가정보를 아직 입력하지 않은 신규 성도 → 세부정보 입력 모달 강제 팝업
      if (!profileData.phone) {
        setOauthName(profileData.name || name || '')
        setOauthEmail(profileData.email || email || '')
        setShowProfileSetup(true)
      }
    } catch (err) {
      console.error('fetchProfile error:', err)
    }
  }

  // OAuth 가입 후 추가정보 저장 (Supabase profiles 업데이트)
  const handleProfileSetupSubmit = async (info: { name: string; phone: string; address: string; birthday: string }) => {
    if (!supabaseUser) return
    await supabase.from('profiles').update({
      name: info.name,
      phone: info.phone,
      address: info.address,
      birthday: info.birthday,
    }).eq('id', supabaseUser.id)
    setShowProfileSetup(false)
    // 로컬 상태에도 즉시 반영
    setUsers(prev => prev.map(u => u.id === supabaseUser.id
      ? { ...u, name: info.name, phone: info.phone, address: info.address, birthday: info.birthday }
      : u
    ))
  }

  // 구글 로그인 실행
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) alert(`구글 로그인 에러: ${error.message}`)
  }

  // 카카오 로그인 실행 (이메일 권한 요구 없이 닉네임/프로필만 요청)
  const handleKakaoLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'profile_nickname,profile_image',
        queryParams: {
          scope: 'profile_nickname,profile_image',
        },
      },
    })
    if (error) alert(`카카오 로그인 에러: ${error.message}`)
  }

  // 로그아웃 (홈 탭으로 즉시 복귀)
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSupabaseUser(null)
    setCurrentUserId('guest')
    setCurrentTab('home')
    setIsAdminViewMode(false)
  }

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
    duty: '',
    createdAt: ''
  }

  const isPending = !isGuest && currentUser.role === 'PENDING'

  // 관리자 - 가입 승인 처리
  const handleApproveUser = async (
    userId: string,
    labriId: string,
    role: Role,
    duty: string = '성도',
    familyInfo: string = '',
    familyGroupId: string = '',
    familyRole: string = ''
  ) => {
    await dbApproveUser(userId, labriId, role, duty, familyInfo, familyGroupId || undefined, familyRole || undefined)
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, role, labriId, duty, familyInfo, familyRole, familyGroupId: familyGroupId || u.familyGroupId } : u
    ))
  }

  const handleRejectUser = async (userId: string) => {
    await dbRejectUser(userId)
    setUsers(prev => prev.filter(u => u.id !== userId))
  }

  return (
    <div className="bg-[#f7f9ff] min-h-screen pb-20 w-full max-w-lg md:max-w-xl mx-auto relative border-x border-gray-200/60 shadow-md md:shadow-xl font-sans">
      {/* 브랜드 헤더 */}
      <div className="bg-white/85 backdrop-blur-md px-5 py-3.5 border-b border-gray-100 flex items-center justify-between sticky top-0 z-40">
        <h1
          onClick={() => { setCurrentTab('home'); setIsAdminViewMode(false) }}
          className="text-xl font-black text-[#335f87] tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
          title="홈으로 이동"
        >
          The Bridge
        </h1>

        {isGuest ? (
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-3.5 py-1.5 bg-[#335f87] hover:bg-[#2b5072] text-white font-bold text-xs rounded-xl shadow-2xs flex items-center gap-1 transition-all active:scale-95"
          >
            <LogIn size={13} /> 로그인 / 가입
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCurrentTab('mypage'); setIsAdminViewMode(false) }}
              className="flex items-center gap-1.5 bg-blue-50 text-[#335f87] font-bold px-2.5 py-1 rounded-full border border-blue-100/60 shadow-2xs hover:bg-blue-100/70 transition-all cursor-pointer"
              title="내 정보 보기"
            >
              <span className="w-5 h-5 rounded-full bg-[#335f87] text-white flex items-center justify-center text-[9px] font-bold shrink-0 overflow-hidden">
                {currentUser.avatarUrl
                  ? <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : currentUser.name.slice(0, 1)
                }
              </span>
              <span className="text-[11px]">{getUserDisplayName(currentUser)}</span>
            </button>
            {supabaseUser && (
              <button
                onClick={handleLogout}
                className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg text-xs transition-colors"
                title="로그아웃"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <main className="p-4">
        {isLoading ? (
          // DB 로드 전 로딩 스피너 (더미 데이터 노출 방지)
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <div className="w-10 h-10 border-4 border-[#335f87]/20 border-t-[#335f87] rounded-full animate-spin" />
            <p className="text-xs text-gray-400 font-medium">The Bridge 로딩 중...</p>
          </div>
        ) : isAdminViewMode ? (
          <AdminDashboard
            currentUser={currentUser}
            allUsers={users}
            onApproveUser={handleApproveUser}
            onRejectUser={handleRejectUser}
            onUpdateUsers={setUsers}
            onBack={() => setIsAdminViewMode(false)}
          />
        ) : (
          <>
            {/* 1. 홈 탭 (누구나 열람 가능) */}
            {currentTab === 'home' && (
              <HomeTab currentUser={currentUser} allUsers={users} isGuest={isGuest} />
            )}

            {/* 2. 비회원(isGuest) 접근 차단 카드 */}
            {currentTab !== 'home' && isGuest && (
              <div className="bg-white rounded-3xl p-8 text-center space-y-4 border border-blue-50 shadow-2xs mt-2 animate-fade-in">
                <div className="text-4xl">🔒</div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-sm text-gray-900">로그인이 필요한 서비스입니다</h3>
                  <p className="text-xs text-gray-500">교회 소식과 나눔은 로그인 후 이용하실 수 있습니다.</p>
                </div>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full py-3 bg-[#335f87] hover:bg-[#2b5072] text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  로그인 / 회원가입 신청하기
                </button>
              </div>
            )}

            {/* 3. 가입 승인 대기자(isPending) 접근 차단 및 대기 안내 카드 */}
            {currentTab !== 'home' && isPending && (
              <div className="bg-white rounded-3xl p-8 text-center space-y-4 border border-amber-100 shadow-2xs mt-2 animate-fade-in">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center text-3xl mx-auto animate-pulse">
                  ⏳
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base text-gray-900">가입 승인 대기 중입니다</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    교회 관리자의 가입 승인 완료 후<br />소식, 나눔, 신청 기능을 이용하실 수 있습니다.
                  </p>
                </div>
                <button
                  onClick={() => {
                    dbFetchProfiles().then(dbUsers => {
                      if (dbUsers && dbUsers.length > 0) setUsers(dbUsers)
                      if (supabaseUser) {
                        const uMeta = supabaseUser.user_metadata || {}
                        const name = uMeta.full_name || uMeta.name || ''
                        fetchProfile(supabaseUser.id, supabaseUser.email || '', name)
                      }
                    })
                    alert('승인 상태를 새로고침했습니다.')
                  }}
                  className="w-full py-2.5 bg-[#335f87] text-white text-xs font-bold rounded-xl hover:bg-[#2b5072] transition-all"
                >
                  승인 상태 새로고침
                </button>
              </div>
            )}

            {/* 4. 정회원 이상 승인 완료자만 접근 가능한 탭들 */}
            {currentTab !== 'home' && !isGuest && !isPending && (
              <>
                {/* 우리소식 탭 */}
                {currentTab === 'news' && (
                  <NewsTab currentUser={currentUser} allUsers={users} />
                )}

                {/* 나눔 탭 */}
                {currentTab === 'sharing' && (
                  <SharingTab currentUser={currentUser} allUsers={users} />
                )}

                {/* 신청 탭 */}
                {currentTab === 'request' && (
                  <RequestTab currentUser={currentUser} allUsers={users} />
                )}

                {/* 마이페이지 탭 */}
                {currentTab === 'mypage' && (
                  <MyPageTab
                    currentUser={currentUser}
                    allUsers={users}
                    onNavigateAdmin={() => setIsAdminViewMode(true)}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* 회원가입 / 로그인 모달 */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-gray-400 font-bold"
            >
              ✕
            </button>
            <AuthPending
              currentRole={isGuest ? 'MEMBER' : currentUser.role}
              onRefreshStatus={() => setShowAuthModal(false)}
              onGoogleLogin={handleGoogleLogin}
              onKakaoLogin={handleKakaoLogin}
            />
          </div>
        </div>
      )}

      {/* OAuth 가입 후 추가정보 입력 모달 */}
      {showProfileSetup && (
        <ProfileSetupModal
          initialName={oauthName}
          initialEmail={oauthEmail}
          onSubmit={handleProfileSetupSubmit}
          onCancel={() => {
            handleLogout()
            setShowProfileSetup(false)
          }}
        />
      )}

      {/* 하단 네비게이션 바 */}
      <BottomNav currentTab={currentTab} setCurrentTab={handleSetCurrentTab} />
    </div>
  )
}