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
import { UserProfile, Role, getUserDisplayName, isApprovedMember } from '../src/lib/mockData'
import { supabase } from '../src/lib/supabase'
import { dbFetchProfiles, dbApproveUser, dbRejectUser, dbReapplyUser, dbFetchMyRole } from '../src/lib/db'
import { clearCache } from '../src/lib/dataCache'
import { toLocalDateStr } from '../src/lib/dateUtils'
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
  // 성도 명단 조회 실패 메시지. "명단이 비어 있음"과 반드시 구분해서 보여줍니다.
  const [rosterError, setRosterError] = useState<string | null>(null)
  // OAuth 콜백에서 로그인 교환이 실패했을 때 표시할 안내
  const [authError, setAuthError] = useState<string>('')
  // 대기 중에 관리자가 승인하면 화면이 저절로 바뀌는데, 왜 바뀌었는지 알 수 있도록 띄우는 축하 안내
  const [justApproved, setJustApproved] = useState(false)

  // 로그아웃/세션만료 시 완전한 비로그인 상태로 되돌립니다.
  const resetToGuest = () => {
    setSupabaseUser(null)
    setCurrentUserId('guest')
    setCurrentTab('home')
    setIsAdminViewMode(false)
    setShowProfileSetup(false)
    setUsers([])       // 성도 개인정보 명단 제거
    setRosterError(null)
    clearCache()       // 가족이 함께 쓰는 폰에서 이전 사용자 데이터가 남지 않도록
  }

  // Supabase 세션 및 전체 profiles 동기화
  // 🔒 개인정보 보호: 전화번호/주소/생일/가족정보가 담긴 성도 전체 명단(dbFetchProfiles)은
  // 로그인이 확인된 사용자에게만 불러옵니다. 비로그인 방문자에게는 절대 로드하지 않습니다.
  useEffect(() => {
    const loadFullRoster = () => {
      dbFetchProfiles().then(dbUsers => {
        if (dbUsers && dbUsers.length > 0) {
          // 목록을 통째로 갈아끼우면, 방금 fetchProfile이 만들어 넣은 내 프로필이
          // (아직 서버 목록에 없을 수 있어서) 사라질 수 있습니다. 병합 방식으로 반영합니다.
          setUsers(prev => {
            const byId = new Map(dbUsers.map(u => [u.id, u]))
            prev.forEach(u => { if (!byId.has(u.id)) byId.set(u.id, u) })
            return Array.from(byId.values())
          })
          setRosterError(null)
        }
      }).catch(err => {
        // 🐛 과거 버그: 오류를 통째로 삼켜서, 명단 조회에 실패하면 users가 빈 배열로 남고
        // 화면은 "승인 대기 중"이나 "대기자 없음" 같은 정상 상태로 보였습니다.
        setRosterError(err?.message || '성도 명단을 불러오지 못했습니다.')
      })
    }

    // 1. 현재 로그인 세션 감지 (최초 1회)
    // 로그인 콜백에서 실패 사유를 넘겨줬다면 화면에 안내하고 주소창은 정리합니다.
    try {
      const params = new URLSearchParams(window.location.search)
      const err = params.get('auth_error')
      if (err) {
        setAuthError(err)
        params.delete('auth_error')
        const rest = params.toString()
        window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
      }
    } catch { /* 주소 파싱 실패는 무시 */ }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSupabaseUser(session.user)
        const uMeta = session.user.user_metadata || {}
        const name = uMeta.full_name || uMeta.name || uMeta.preferred_username || uMeta.user_name || ''
        // 내 프로필을 먼저 확정한 뒤 전체 명단을 불러와야, 둘이 경쟁하면서
        // 방금 만든 내 프로필이 덮여 사라지는 일이 없습니다.
        fetchProfile(session.user.id, session.user.email || '', name)
          .then(() => loadFullRoster())
          .finally(() => setIsLoading(false))
      } else {
        // 비로그인 방문자: 성도 개인정보 명단을 불러오지 않고 바로 로딩 종료
        setIsLoading(false)
      }
    })

    // 2. 로그인/로그아웃 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // ⚠️ Supabase 권고: 이 콜백 안에서 곧바로 supabase 조회를 호출하면 내부 잠금과
      // 얽혀 멈출 수 있습니다. setTimeout(0)으로 잠금 밖에서 실행합니다.
      // 또 이벤트 종류를 가리지 않으면 최초 진입 시(INITIAL_SESSION) 위 getSession과
      // 겹쳐 모든 조회가 두 번씩 나가고, 한 시간마다 오는 토큰 갱신(TOKEN_REFRESHED)에도
      // 다시 실행되면서 열려 있던 로그인 창이 닫히는 문제가 있었습니다.
      if (event === 'SIGNED_IN') {
        if (!session?.user) return
        const user = session.user
        setSupabaseUser(user)
        const uMeta = user.user_metadata || {}
        const name = uMeta.full_name || uMeta.name || uMeta.preferred_username || uMeta.user_name || ''
        setTimeout(() => {
          fetchProfile(user.id, user.email || '', name).then(() => loadFullRoster())
        }, 0)
      } else if (event === 'SIGNED_OUT') {
        // 🐛 과거 버그: 여기서 currentUserId를 초기화하지 않아, 세션이 만료되면
        // "로그인은 안 됐는데 누군가이긴 한" 애매한 상태가 됐습니다. 그 결과 앱이
        // 이름을 "방문자"로 바꾸고 모든 탭에 "가입 승인 대기 중"을 띄우면서
        // **로그인 버튼은 보여주지 않아** 성도가 빠져나갈 방법이 없었습니다.
        resetToGuest()
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        createdAt: toLocalDateStr(profileData.created_at) || toLocalDateStr(new Date()),
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
    if (!confirm('로그아웃 하시겠습니까?')) return
    await supabase.auth.signOut()
    resetToGuest()
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
  const isRejected = !isGuest && currentUser.role === 'REJECTED'

  // ── 승인되면 화면이 저절로 바뀌도록 ──
  // 🐛 과거 불편: 관리자가 승인해도 성도 화면은 그대로 "승인 대기 중"이었고,
  //    직접 "승인 상태 새로고침"을 누르거나 앱을 껐다 켜야만 바뀌었습니다.
  //    어르신들은 이걸 모르고 "가입이 안 된다"고 생각하셨습니다.
  // → 대기/거절 상태일 때만, 화면을 보고 있을 때만 15초마다 내 등급을 확인합니다.
  //   (승인이 끝나면 조건이 거짓이 되어 확인도 자동으로 멈춥니다)
  useEffect(() => {
    if (isGuest || !(isPending || isRejected)) return
    let stopped = false
    const myRoleNow = currentUser.role

    const check = async () => {
      if (stopped) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const role = await dbFetchMyRole(currentUserId)
      if (stopped || !role || role === myRoleNow) return

      setUsers(prev => prev.map(u => (u.id === currentUserId ? { ...u, role } : u)))
      if (isApprovedMember(role)) {
        setJustApproved(true)
        // 승인된 순간부터 주소록 등에서 다른 성도 정보가 필요하므로 전체 명단을 받아옵니다.
        try {
          const dbUsers = await dbFetchProfiles()
          if (!stopped && dbUsers && dbUsers.length > 0) setUsers(dbUsers)
        } catch { /* 명단 조회 실패는 기존 rosterError 흐름이 처리합니다 */ }
      }
    }

    const timer = setInterval(check, 15_000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    check()

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isGuest, isPending, isRejected, currentUserId, currentUser.role])


  // 관리자 - 가입 승인 처리
  const handleApproveUser = async (
    userId: string,
    labriId: string,
    role: Role,
    duty: string = '성도',
    familyInfo: string = '',
    familyGroupId: string = '',
    familyRole: string = ''
  ): Promise<{ error: any }> => {
    // 🐛 과거 버그: 결과를 확인하지 않고 화면에서 카드를 지우고 "승인 완료"를 띄웠습니다.
    // 저장이 실패하면 관리자 목록에서는 사라지는데 성도는 계속 대기 화면을 보게 되고,
    // 관리자는 이미 처리한 줄 알아서 아무도 문제를 모릅니다.
    const res = await dbApproveUser(userId, labriId, role, duty, familyInfo, familyGroupId || undefined, familyRole || undefined)
    if (res.error) return { error: res.error }

    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, role, labriId, duty, familyInfo, familyRole, familyGroupId: familyGroupId || u.familyGroupId } : u
    ))
    return { error: null }
  }

  const handleRejectUser = async (userId: string): Promise<{ error: any }> => {
    const res = await dbRejectUser(userId)
    if (res.error) return { error: res.error }
    // 거절된 계정은 삭제하지 않고 role만 'REJECTED'로 바뀝니다(되돌릴 수 있도록).
    // 화면 목록에서는 승인 대기 필터에서 자동으로 빠집니다.
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'REJECTED' as Role } : u))
    return { error: null }
  }

  return (
    <div className="bg-[#f7f9ff] min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] w-full max-w-lg md:max-w-xl mx-auto relative border-x border-gray-200/60 shadow-md md:shadow-xl font-sans">
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
                className="p-3 -m-1 text-gray-400 hover:text-rose-500 rounded-lg text-xs transition-colors"
                title="로그아웃"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      {/* 로그인 실패 안내 (예전에는 아무 메시지 없이 로그인 화면으로 되돌아갔습니다) */}
      {authError && (
        <div className="mx-4 mt-3 bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-start gap-2 animate-fade-in">
          <span className="text-base leading-none mt-0.5">⚠️</span>
          <div className="flex-1 space-y-1">
            <p className="text-xs font-bold text-rose-800">로그인에 실패했습니다</p>
            <p className="text-[11px] text-rose-700 leading-relaxed break-all">{authError}</p>
            <p className="text-[11px] text-rose-600/80 leading-relaxed">
              다시 시도해도 같은 문제가 계속되면 교회 관리자에게 이 메시지를 알려주세요.
            </p>
          </div>
          <button onClick={() => setAuthError('')} className="p-2 -m-1 text-rose-400 hover:text-rose-600 shrink-0" title="닫기">✕</button>
        </div>
      )}

      <main className="p-4">
        {/* 승인이 확인되면 화면이 저절로 바뀝니다. 왜 바뀌었는지 알 수 있도록 알려드립니다. */}
        {justApproved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-3 flex items-start gap-2 animate-fade-in">
            <span className="text-base leading-none mt-0.5">🎉</span>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold text-emerald-800">가입이 승인되었습니다</p>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                이제 소식 · 나눔 · 신청 기능을 모두 이용하실 수 있습니다. 환영합니다!
              </p>
            </div>
            <button onClick={() => setJustApproved(false)} className="p-2 -m-1 text-emerald-400 hover:text-emerald-600 shrink-0" title="닫기">✕</button>
          </div>
        )}
        {rosterError && !isLoading && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-3 flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">📡</span>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold text-amber-800">성도 명단을 불러오지 못했습니다</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                지금 보이는 목록이 비어 있거나 실제와 다를 수 있습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.
              </p>
            </div>
            <button
              onClick={() => {
                setRosterError(null)
                dbFetchProfiles()
                  .then(dbUsers => { if (dbUsers && dbUsers.length > 0) setUsers(dbUsers) })
                  .catch(err => setRosterError(err?.message || '성도 명단을 불러오지 못했습니다.'))
              }}
              className="px-2.5 py-1.5 bg-amber-600 text-white text-[11px] font-bold rounded-lg shrink-0"
            >다시 시도</button>
          </div>
        )}
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
              <HomeTab currentUser={currentUser} allUsers={users} isGuest={isGuest || isPending || isRejected} />
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
                  <p className="text-[11px] text-[#335f87] font-medium">
                    승인되면 이 화면이 자동으로 바뀝니다. 그대로 두셔도 됩니다.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    // 🐛 과거 버그: 조회를 시작하자마자 alert를 띄워서, 실제로 새로고침되기 전에
                    // "새로고침했습니다"가 뜨고 화면은 그대로였습니다. 이제 결과를 기다렸다가
                    // 승인됨/아직 안 됨을 구분해 알려줍니다.
                    try {
                      if (supabaseUser) {
                        const uMeta = supabaseUser.user_metadata || {}
                        const name = uMeta.full_name || uMeta.name || ''
                        await fetchProfile(supabaseUser.id, supabaseUser.email || '', name)
                      }
                      const dbUsers = await dbFetchProfiles()
                      if (dbUsers && dbUsers.length > 0) setUsers(dbUsers)
                      const me = dbUsers.find(u => u.id === currentUserId)
                      if (me && isApprovedMember(me.role)) {
                        // 화면이 곧 바뀌므로 alert 대신 상단 안내로 알려드립니다.
                        setJustApproved(true)
                      } else {
                        alert('아직 승인되지 않았습니다. 교회 관리자에게 문의해 주세요.')
                      }
                    } catch {
                      alert('상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
                    }
                  }}
                  className="w-full py-2.5 bg-[#335f87] text-white text-xs font-bold rounded-xl hover:bg-[#2b5072] transition-all"
                >
                  승인 상태 새로고침
                </button>
              </div>
            )}

            {/* 3-1. 가입이 거절된 계정 안내 */}
            {currentTab !== 'home' && isRejected && (
              <div className="bg-white rounded-3xl p-8 text-center space-y-4 border border-rose-100 shadow-2xs mt-2 animate-fade-in">
                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                  📬
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base text-gray-900">가입이 승인되지 않았습니다</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    정보를 잘못 입력하셨거나 착오가 있었다면<br />아래 버튼으로 다시 신청하실 수 있습니다.
                  </p>
                </div>
                {/* 거절이 "완전 삭제"에서 "상태 변경"으로 바뀌면서, 이 버튼이 없으면
                    거절당한 분은 영영 다시 신청할 수 없게 됩니다. */}
                <button
                  onClick={async () => {
                    const res = await dbReapplyUser(currentUserId)
                    if (res.error) {
                      alert('다시 신청하지 못했습니다. 잠시 후 시도하거나 교회 사무실로 문의해 주세요.')
                      return
                    }
                    setUsers(prev => prev.map(u => u.id === currentUserId ? { ...u, role: 'PENDING' as Role } : u))
                    alert('가입 신청이 다시 접수되었습니다. 관리자 승인을 기다려 주세요.')
                  }}
                  className="w-full py-3 bg-[#335f87] text-white text-xs font-bold rounded-xl hover:bg-[#2b5072] transition-all"
                >
                  다시 가입 신청하기
                </button>
                <p className="text-[11px] text-gray-400">문의: 교회 사무실</p>
              </div>
            )}

            {/* 4. 정회원 이상 승인 완료자만 접근 가능한 탭들 */}
            {currentTab !== 'home' && !isGuest && !isPending && !isRejected && (
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
                    onUpdateUsers={setUsers}
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