'use client'

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import dynamic from 'next/dynamic'
import BottomNav from '../src/components/BottomNav'
import HomeTab from '../src/components/home/HomeTab'
import { copyExternalImageToStorage } from '../src/lib/storage'
import AuthPending from '../src/components/auth/AuthPending'
import { UserProfile, Role, getUserDisplayName, isApprovedMember, hasCommunityAccess, canOpenAdmin, NotificationItem, getInitials } from '../src/lib/mockData'
import { supabase } from '../src/lib/supabase'
import { dbFetchProfiles, dbApproveUser, dbRejectUser, dbReapplyUser, dbFetchMyRole, dbFetchNotifications, dbMarkWelcomed, dbMarkNotificationRead } from '../src/lib/db'
import NotificationPanel, { destinationOf } from '../src/components/NotificationPanel'
import { clearCache, ViewActiveContext } from '../src/lib/dataCache'
import { toLocalDateStr } from '../src/lib/dateUtils'
import { useModalDismiss } from '../src/lib/useModalDismiss'
import { usePullToRefresh } from '../src/lib/usePullToRefresh'
import { isRunningStandalone } from '../src/lib/pwaInstall'
import { markLoginStarted, clearLoginStarted, loginStartedRecently, explainAuthError } from '../src/lib/loginReturn'
import { trackUserActivity } from '../src/lib/activityTracker'
import LandingPage from '../src/components/landing/LandingPage'
import { LogIn, RefreshCw, Bell } from 'lucide-react'
import { askConfirm, showAlert } from '../src/components/ConfirmDialog'
import { SkeletonList } from '../src/components/SkeletonCard'
import Modal from '../src/components/ui/Modal'

// ── 첫 화면(홈)에 필요 없는 화면은 따로 떼어 받습니다 ──
// 처음 앱을 열 때 받아야 하는 프로그램 양을 줄여 홈이 더 빨리 뜨게 합니다.
// 대신 앱이 켜지고 한가해지면 미리 받아 두므로(preloadLaterScreens), 탭을 눌렀을 때 기다리지 않습니다.
const loadNewsTab = () => import('../src/components/news/NewsTab')
const loadSharingTab = () => import('../src/components/sharing/SharingTab')
const loadRequestTab = () => import('../src/components/request/RequestTab')
const loadMyPageTab = () => import('../src/components/mypage/MyPageTab')
const loadAdminDashboard = () => import('../src/components/admin/AdminDashboard')
const TabLoading = () => <div className="pt-2"><SkeletonList count={3} /></div>
const NewsTab = dynamic(loadNewsTab, { loading: TabLoading })
const SharingTab = dynamic(loadSharingTab, { loading: TabLoading })
const RequestTab = dynamic(loadRequestTab, { loading: TabLoading })
const MyPageTab = dynamic(loadMyPageTab, { loading: TabLoading })
const AdminDashboard = dynamic(loadAdminDashboard, { loading: TabLoading })
// 가끔 한 번 뜨는 팝업은 필요할 때만 받습니다.
const ProfileSetupModal = dynamic(() => import('../src/components/auth/ProfileSetupModal'))
const WelcomeModal = dynamic(() => import('../src/components/auth/WelcomeModal'))

function preloadLaterScreens(includeAdmin: boolean) {
  const run = () => {
    const jobs: Promise<unknown>[] = [loadNewsTab(), loadSharingTab(), loadRequestTab(), loadMyPageTab()]
    if (includeAdmin) jobs.push(loadAdminDashboard())
    Promise.all(jobs).catch(() => { /* 실패하면 탭을 누를 때 다시 받습니다 */ })
  }
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 3000 })
    return () => window.cancelIdleCallback(id)
  }
  const t = setTimeout(run, 1500)
  return () => clearTimeout(t)
}

/** 브라우저의 "기록 칸마다 스크롤 되돌리기"를 끕니다 — 화면별 스크롤은 Home 이 직접 기억합니다. */
function setManualScrollRestoration() {
  if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual'
  }
}

// 로그인 실패 사유(?auth_error=)를 주소에서 한 번만 꺼냅니다.
// 🐛 useState 초기값 함수는 React 가 화면을 다시 그리면 또 불릴 수 있는데, 첫 번째 호출에서 주소의
//    값을 지워 버려 두 번째엔 빈 값이 되어 안내가 사라졌습니다. → 처음 꺼낸 값을 기억해 둡니다.
let authErrorFromUrl: string | null = null
function takeAuthErrorFromUrl(): string {
  if (typeof window === 'undefined') return ''
  if (authErrorFromUrl !== null) return authErrorFromUrl
  authErrorFromUrl = ''
  try {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('auth_error')
    if (err) {
      params.delete('auth_error')
      const rest = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
      authErrorFromUrl = explainAuthError(err)
    }
  } catch { /* 주소 파싱 실패는 무시 */ }
  return authErrorFromUrl
}
const noopSubscribe = () => () => {}

export default function Home() {
  // 🐛 과거 불편: 어느 탭에 있는지가 화면 기억에만 있고 주소창에는 없어서,
  //    새로고침하면 무조건 홈으로 돌아갔습니다. 휴대폰 뒤로가기도 앱을 그냥 껐습니다.
  // → 주소 끝에 #news 같은 표시를 붙여, 새로고침해도 보던 탭이 유지되게 합니다.
  //   (덤: 뒤로가기가 "이전 탭"으로 동작하고, 특정 탭 주소를 공유할 수도 있습니다)
  const VALID_TABS = ['home', 'news', 'sharing', 'request', 'mypage']
  const readTabFromHash = (): string => {
    if (typeof window === 'undefined') return 'home'
    const raw = (window.location.hash || '').replace(/^#/, '')
    return VALID_TABS.includes(raw) ? raw : 'home'
  }
  const [currentTab, setCurrentTab] = useState<string>(() => (typeof window !== 'undefined' ? readTabFromHash() : 'home'))

  // ── 휴대폰 뒤로가기·탭별 스크롤 기억에 쓰는 값들 (자세한 설명은 아래 handleSetCurrentTab 위 주석) ──
  const navDepthRef = useRef(0)                       // 홈 위로 쌓아 둔 기록 칸 수 (0 홈 · 1 탭 · 2 관리 화면)
  const currentTabRef = useRef(currentTab)            // 기록 이벤트 처리기가 읽는 "지금 탭"
  const isAdminViewRef = useRef(false)                // 기록 이벤트 처리기가 읽는 "관리 화면 여부"
  const scrollByViewRef = useRef<Record<string, number>>({})  // 화면별 마지막 스크롤 위치
  const pendingScrollRef = useRef<number | null>(null)        // 다음 화면에서 되돌릴 스크롤 위치
  const pendingTabReplaceRef = useRef<string | null>(null)    // 관리 칸을 걷어 낸 뒤 바꿔 넣을 탭
  // 한 번 연 탭 목록. 이 탭들은 다른 탭으로 가도 숨겨 둔 채 살려 둡니다.
  const [visitedTabs, setVisitedTabs] = useState<string[]>(() => [currentTab])
  if (!visitedTabs.includes(currentTab)) setVisitedTabs([...visitedTabs, currentTab])
  // 당겨서 새로고침 때 화면 부품을 통째로 새로 그리기 위한 번호
  const [contentKey, setContentKey] = useState(0)

  // ── 알림을 눌렀을 때 "그 글이 있는 서브탭"까지 열어 주기 위한 요청값 ──
  // 큰 탭만 바꾸면 나눔은 늘 기도제목이, 우리소식은 늘 교회일정이 먼저 보입니다.
  // token은 같은 서브탭을 연달아 요청해도 다시 열리도록 하는 번호표입니다.
  const [subTabRequest, setSubTabRequest] = useState<{ tab: string; sub: string; token: number }>(
    { tab: '', sub: '', token: 0 }
  )
  const [users, setUsers] = useState<UserProfile[]>([])  // 더미 데이터 제거
  const [isLoading, setIsLoading] = useState(true)        // DB 로드 완료 전 로딩

  // 현재 사용자 로그인 ID ('guest'는 비로그인)
  const [currentUserId, setCurrentUserId] = useState<string>('guest')
  // 관리 화면에서 새로고침했으면 관리 화면으로 돌아옵니다(기록 칸에 adminView 표시가 남아 있음).
  // 처음엔 로딩 화면만 그리므로 서버 렌더와 어긋나지 않습니다.
  const [isAdminViewMode, setIsAdminViewMode] = useState<boolean>(
    () => typeof window !== 'undefined' && !!(window.history.state as { adminView?: boolean } | null)?.adminView
  )
  // 알림을 눌러 관리자 대시보드의 특정 탭(승인·출석)을 열 때의 요청값 (subTabRequest 와 같은 방식)
  const [adminTabRequest, setAdminTabRequest] = useState<{ tab: string; token: number }>({ tab: '', token: 0 })
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false)
  useModalDismiss(showAuthModal, () => setShowAuthModal(false))
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null)
  const [showProfileSetup, setShowProfileSetup] = useState<boolean>(false)
  const [oauthName, setOauthName] = useState<string>('')
  const [oauthEmail, setOauthEmail] = useState<string>('')
  // 성도 명단 조회 실패 메시지. "명단이 비어 있음"과 반드시 구분해서 보여줍니다.
  const [rosterError, setRosterError] = useState<string | null>(null)
  // OAuth 콜백에서 로그인 교환이 실패했을 때 표시할 안내
  const [authError, setAuthError] = useState<string>(takeAuthErrorFromUrl)
  // 대기 중에 관리자가 승인하면 화면이 저절로 바뀌는데, 왜 바뀌었는지 알 수 있도록 띄우는 축하 안내
  const [justApproved, setJustApproved] = useState(false)
  // ── 앱 안 알림함 ── (헤더의 내 이름 버튼에서 열립니다)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  // 승인 후 첫 방문 환영 팝업 닫힘 여부
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  // 방문자 랜딩 페이지를 이번 세션에서 넘겼는지 (새로고침하면 다시 보입니다)
  const [landingDismissed, setLandingDismissed] = useState(false)

  // 로그아웃/세션만료 시 완전한 비로그인 상태로 되돌립니다.
  const resetToGuest = () => {
    setSupabaseUser(null)
    setCurrentUserId('guest')
    setCurrentTab('home')
    // 기록·주소창도 홈으로 되돌립니다. 쌓아 둔 칸만큼 되돌려서, 로그아웃 뒤 뒤로가기 한 번에 앱이 닫히고
    // 새로고침해도 다시 잠긴 탭으로 가지 않게 합니다.
    if (typeof window !== 'undefined') {
      if (navDepthRef.current > 0) window.history.go(-navDepthRef.current)
      else if (window.location.hash) window.history.replaceState({ bridgeNav: 0 }, '', window.location.pathname + window.location.search)
      navDepthRef.current = 0
    }
    currentTabRef.current = 'home'
    isAdminViewRef.current = false
    scrollByViewRef.current = {}
    setVisitedTabs(['home'])   // 살려 둔 탭도 모두 내립니다 — 다음 사람에게 이전 사용자의 화면이 남지 않게
    setIsAdminViewMode(false)
    setShowProfileSetup(false)
    setUsers([])       // 성도 개인정보 명단 제거
    setRosterError(null)
    clearCache()       // 가족이 함께 쓰는 폰에서 이전 사용자 데이터가 남지 않도록
  }

  // Supabase profiles 조회 → 신규면 추가정보 입력 모달 표시
  // 확인된 내 프로필을 돌려줍니다(실패하면 null). 부르는 쪽이 전체 명단을 받아도 되는지 판단합니다.
  const fetchProfile = async (id: string, email: string, name: string): Promise<UserProfile | null> => {
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
        // 이 경로는 handle_new_user 트리거가 어떤 이유로 행을 못 만들었을 때의 보완책입니다.
        // 실패해도 로그인 흐름 자체는 막지 않되, 조용히 넘어가면 이후 저장이 전부 실패하는데
        // 원인을 알 수 없게 되므로 기록은 반드시 남깁니다.
        const { error: bootstrapError } = await supabase.from('profiles').insert(newProfile)
        if (bootstrapError) {
          console.error('[가입] 기본 프로필 생성 실패:', bootstrapError.message)
        }
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
        // 환영 팝업을 이미 봤는지 (없으면 승인 후 첫 방문)
        welcomedAt: profileData.welcomed_at || undefined,
        // "가입 완료 및 승인 신청" 버튼을 실제로 눌렀는지 (없으면 로그인만 한 상태)
        signupRequestedAt: profileData.signup_requested_at || undefined,
        // 탈퇴(LEFT) 계정도 이 값이 켜져 있으면 커뮤니티를 계속 씁니다 — 명단을 받을지 여기서 정합니다.
        keepAppAccess: profileData.keep_app_access === true,
      }

      // ── 카톡 프로필 사진을 우리 저장소로 한 번만 옮깁니다 ──
      // 저장된 값이 아직 카카오 서버 주소라면, 그건 "복사 전"이라는 뜻입니다.
      // 성도님이 카톡에서 사진을 바꾸면 그 주소가 죽어 사진이 깨지므로 미리 옮겨둡니다.
      // 실패해도 화면은 그대로 진행합니다(다음 로그인 때 다시 시도).
      if (spUser.avatarUrl && spUser.avatarUrl.includes('kakaocdn.net')) {
        copyExternalImageToStorage(spUser.avatarUrl, 'avatars')
          .then(copied => {
            if (!copied) return
            supabase.from('profiles').update({ avatar_url: copied }).eq('id', spUser.id)
              .then(() => {
                setUsers(prev => prev.map(u => (u.id === spUser.id ? { ...u, avatarUrl: copied } : u)))
              })
          })
          .catch(() => { /* 조용히 넘어갑니다 */ })
      }

      setUsers(prev => {
        const exists = prev.some(u => u.id === spUser.id)
        return exists ? prev.map(u => u.id === spUser.id ? spUser : u) : [spUser, ...prev]
      })
      setCurrentUserId(spUser.id)
      setShowAuthModal(false)

      // 성도 접속 환경 및 최근 활동 일시 비동기 기록 (15분 Throttled)
      trackUserActivity(spUser.id)

      // 연락처 미입력 = 추가정보를 아직 입력하지 않은 신규 성도 → 세부정보 입력 모달 강제 팝업
      if (!profileData.phone) {
        setOauthName(profileData.name || name || '')
        setOauthEmail(profileData.email || email || '')
        setShowProfileSetup(true)
      }
      return spUser
    } catch (err) {
      console.error('fetchProfile error:', err)
      return null
    }
  }

  // Supabase 세션 및 전체 profiles 동기화
  // 🔒 개인정보 보호: 전화번호/주소/생일/가족정보가 담긴 성도 전체 명단(dbFetchProfiles)은
  // **승인된 성도에게만** 불러옵니다.
  // 🐛 예전엔 "로그인했으면" 불러왔습니다. 구글·카카오 로그인은 누구나 할 수 있어서, 가입 신청만
  //    해 둔 모르는 사람의 브라우저에도 전 성도 명단이 내려갔습니다(개발자도구에 그대로 보임).
  //    서버 규칙(RLS)도 함께 막았으므로 이제 대기자가 불러도 자기 행만 옵니다. 여기서는 그 헛걸음까지 없앱니다.
  //    승인되는 순간에는 아래 "승인되면 화면이 저절로 바뀌도록" 효과가 명단을 받아 옵니다.
  const loadRosterIfMember = (me: UserProfile | null, loadFullRoster: () => void) => {
    if (hasCommunityAccess(me)) loadFullRoster()
  }
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSupabaseUser(session.user)
        const uMeta = session.user.user_metadata || {}
        const name = uMeta.full_name || uMeta.name || uMeta.preferred_username || uMeta.user_name || ''
        // 내 프로필을 먼저 확정한 뒤 전체 명단을 불러와야, 둘이 경쟁하면서
        // 방금 만든 내 프로필이 덮여 사라지는 일이 없습니다.
        fetchProfile(session.user.id, session.user.email || '', name)
          .then(me => loadRosterIfMember(me, loadFullRoster))
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
          fetchProfile(user.id, user.email || '', name).then(me => loadRosterIfMember(me, loadFullRoster))
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

  // OAuth 가입 후 추가정보 저장 + 실제 승인 신청 (Supabase profiles 업데이트)
  // 이 버튼을 눌러야만 signup_requested_at이 채워지고, 그 순간에만 관리자에게 알림이 갑니다.
  const handleProfileSetupSubmit = async (info: { name: string; phone: string; address: string; birthday: string }) => {
    if (!supabaseUser) return
    const requestedAt = new Date().toISOString()

    // 🐛 과거 사고: 여기서 update 의 error 를 **확인하지 않았습니다.** 저장이 실패해도
    //    창은 닫히고 화면 오른쪽 위에 이름까지 바뀌어 보여서, 성도는 신청을 마쳤다고
    //    믿고 관리자는 아무것도 못 받는 상태가 됐습니다. 실제로 RLS 정책 오류로 저장이
    //    막혔던 동안 두 분이 이렇게 묶여 있었고, 아무도 원인을 알 수 없었습니다.
    // → 실패하면 창을 닫지 않고 그대로 두어 다시 시도할 수 있게 합니다.
    const { error } = await supabase.from('profiles').update({
      name: info.name,
      phone: info.phone,
      address: info.address,
      birthday: info.birthday,
      signup_requested_at: requestedAt,
    }).eq('id', supabaseUser.id)

    if (error) {
      await showAlert(
        '가입 신청을 저장하지 못했습니다.\n\n' +
        '인터넷 상태를 확인하고 다시 시도해 주세요. 계속 안 되면 교회 사무실로 알려 주세요.\n\n' +
        `(오류: ${error.message})`
      )
      return
    }

    setShowProfileSetup(false)
    // 로컬 상태에도 즉시 반영
    setUsers(prev => prev.map(u => u.id === supabaseUser.id
      ? { ...u, name: info.name, phone: info.phone, address: info.address, birthday: info.birthday, signupRequestedAt: requestedAt }
      : u
    ))
  }

  // 구글 로그인 실행
  const handleGoogleLogin = async () => {
    markLoginStarted()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) await showAlert(`구글 로그인 에러: ${error.message}`)
  }

  // 카카오 로그인 실행 (이메일 권한 요구 없이 닉네임/프로필만 요청)
  const handleKakaoLogin = async () => {
    markLoginStarted()
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
    if (error) await showAlert(`카카오 로그인 에러: ${error.message}`)
  }

  // 로그아웃 (홈 탭으로 즉시 복귀)
  const handleLogout = async () => {
    if (!await askConfirm('로그아웃 하시겠습니까?')) return
    await supabase.auth.signOut()
    resetToGuest()
  }

  // ─────────────────────────────────────────────────────────────
  // 탭 전환 · 휴대폰 뒤로가기 · 탭별 스크롤 기억
  //
  // 🐛 과거 불편 (사용자의 대부분이 홈 화면에 설치한 앱으로 씁니다)
  //  ① 탭을 옮길 때마다 기록이 한 칸씩 쌓여, 안드로이드에서 앱을 닫으려면 지나온 탭 수만큼
  //     뒤로가기를 눌러야 했습니다.
  //  ② 관리자 대시보드는 기록에 없어서, 뒤로가기를 누르면 대시보드는 그대로 두고 아래 메뉴
  //     강조만 바뀌었습니다(쌓인 기록이 없으면 앱이 그냥 꺼짐).
  //  ③ 탭을 옮기면 늘 맨 위부터 보였고, 다녀온 탭은 새로 그려져 "더보기"로 불러온 글과
  //     고른 소메뉴까지 초기화됐습니다. 기도제목을 읽다 홈에 다녀오면 처음부터 다시 내려가야 했습니다.
  //
  // → 기록을 늘 [홈] ← [탭] ← [관리 화면] 모양으로 유지합니다(팝업은 그 위에 잠깐 얹혔다 빠짐).
  //    · 홈 → 탭: 한 칸 쌓기 / 탭 → 탭: 제자리 바꾸기 / 탭 → 홈: 쌓은 만큼 되돌리기
  //    · 뒤로가기: 관리 화면 → 내정보 → 홈 → 앱 종료 (휴대폰 앱들의 약속과 같게)
  //   각 칸의 history.state.bridgeNav 에 "홈 위로 몇 칸째인지"를 적어 두어 새로고침해도 이어집니다.
  //   한 번 연 탭은 숨겨 둔 채 살려 두고, 떠날 때 스크롤 위치를 적어 두었다가 돌아오면 되돌립니다.
  //   지금 보고 있는 탭을 한 번 더 누르면 맨 위로 올라갑니다.
  // ─────────────────────────────────────────────────────────────
  const urlForTab = (tab: string) =>
    window.location.pathname + window.location.search + (tab === 'home' ? '' : `#${tab}`)

  // 보이는 화면만 바꿉니다(기록 조작은 부르는 쪽 책임). 떠나는 화면의 스크롤 위치를 먼저 적어 둡니다.
  const showView = (tab: string, admin: boolean, scrollTo: number) => {
    const leaving = isAdminViewRef.current ? 'admin' : currentTabRef.current
    scrollByViewRef.current[leaving] = window.scrollY
    currentTabRef.current = tab
    isAdminViewRef.current = admin
    pendingScrollRef.current = scrollTo
    setCurrentTab(tab)
    setIsAdminViewMode(admin)
  }
  const savedScrollOf = (tab: string) => scrollByViewRef.current[tab] ?? 0

  // 관리자 대시보드 열기. 관리 화면은 내정보 아래 한 칸입니다: [홈] ← [내정보] ← [관리]
  const openAdmin = (adminTab?: string) => {
    // (아래에서 만드는 currentUser 대신 명단에서 직접 찾습니다 — 선언 순서 때문에)
    const myRole = users.find(u => u.id === currentUserId)?.role
    if (!canOpenAdmin(myRole)) { handleSetCurrentTab('mypage'); return }
    if (adminTab) setAdminTabRequest(prev => ({ tab: adminTab, token: prev.token + 1 }))
    if (isAdminViewRef.current) { window.scrollTo({ top: 0 }); return }
    if (navDepthRef.current === 0) window.history.pushState({ bridgeNav: 1 }, '', urlForTab('mypage'))
    else if (currentTabRef.current !== 'mypage') window.history.replaceState({ bridgeNav: 1 }, '', urlForTab('mypage'))
    window.history.pushState({ bridgeNav: 2, adminView: true }, '')
    navDepthRef.current = 2
    showView('mypage', true, 0)
  }

  // 관리자 대시보드의 ← 버튼. 뒤로가기와 똑같이 기록을 한 칸 되돌립니다(화면은 popstate 처리기가 바꿈).
  const closeAdmin = () => {
    if (isAdminViewRef.current && navDepthRef.current >= 2) window.history.back()
    else showView(currentTabRef.current, false, savedScrollOf(currentTabRef.current))
  }

  // 탭 전환 (하단 메뉴·홈 카드·알림에서 부릅니다). tab 이 'admin' 이면 관리자 대시보드의 subTab 을 엽니다.
  const handleSetCurrentTab = (tab: string, subTab?: string) => {
    if (typeof window === 'undefined') return
    if (tab === 'admin') { openAdmin(subTab); return }
    if (subTab) setSubTabRequest(prev => ({ tab, sub: subTab, token: prev.token + 1 }))

    // 지금 보고 있는 탭을 다시 누르면 맨 위로 (알림으로 소메뉴를 연 경우엔 바로 맨 위에서 시작)
    if (tab === currentTabRef.current && !isAdminViewRef.current) {
      window.scrollTo({ top: 0, behavior: subTab ? 'auto' : 'smooth' })
      return
    }

    const depth = navDepthRef.current
    if (tab === 'home') {
      if (depth > 0) window.history.go(-depth)
      else if (window.location.hash) window.history.replaceState({ bridgeNav: 0 }, '', urlForTab('home'))
      navDepthRef.current = 0
    } else if (depth === 0) {
      window.history.pushState({ bridgeNav: 1 }, '', urlForTab(tab))
      navDepthRef.current = 1
    } else if (depth >= 2) {
      // 관리 화면에서 곧장 다른 탭으로: 관리 칸을 걷어 낸 뒤 내정보 칸을 이 탭으로 바꿉니다(popstate 처리기).
      pendingTabReplaceRef.current = tab
      window.history.go(-(depth - 1))
      navDepthRef.current = 1
    } else {
      window.history.replaceState({ bridgeNav: 1 }, '', urlForTab(tab))
    }
    // 소메뉴를 지정해 들어오면(알림 등) 새 내용이므로 맨 위에서, 아니면 마지막으로 보던 위치에서 시작합니다.
    showView(tab, false, subTab ? 0 : savedScrollOf(tab))
  }

  const isGuest = currentUserId === 'guest'
  // 홈 화면 앱으로 켰는지. 🐛 그리는 도중에 바로 물으면 서버가 미리 만든 화면(항상 "아님")과 달라
  //    React 가 화면을 통째로 다시 그렸고(오류 #418), 그 바람에 로그인 실패 안내까지 사라졌습니다.
  //    → 서버 값(아님)으로 먼저 맞춘 뒤 곧바로 실제 값으로 바꿉니다.
  const isStandalone = useSyncExternalStore(noopSubscribe, isRunningStandalone, () => false)

  const currentUser: UserProfile = useMemo(() => {
    return users.find(u => u.id === currentUserId) || {
      id: 'guest',
      name: '방문자',
      email: '',
      phone: '',
      role: 'PENDING' as Role,
      duty: '',
      createdAt: ''
    }
  }, [users, currentUserId])

  // role='PENDING'은 두 가지 상태를 함께 나타냅니다: ① 로그인만 하고 아직 "가입 완료 및
  // 승인 신청" 버튼을 안 누른 상태, ② 실제로 신청해서 관리자 승인을 기다리는 상태.
  // signupRequestedAt으로 이 둘을 구분해, ①일 때는 "승인 대기 중" 문구 대신 기본 화면을 보여줍니다.
  const isPending = !isGuest && currentUser.role === 'PENDING' && !!currentUser.signupRequestedAt
  const isUnrequestedPending = !isGuest && currentUser.role === 'PENDING' && !currentUser.signupRequestedAt
  const isRejected = !isGuest && currentUser.role === 'REJECTED'
  // 관리자가 탈퇴 처리한 계정. 복구는 관리자만 할 수 있어 본인이 누르는 버튼은 없습니다
  // (REJECTED와 달리 "다시 신청" 버튼이 없는 이유).
  //
  // 좋게 마무리된 탈퇴(예: 한국 복귀 등)는 keepAppAccess를 켜서, 주소록·생일·성도수·
  // 출석·식사신청 참여에서는 여전히 빠지지만(=role 자체가 LEFT라 그 판단들은 그대로 동작)
  // 나눔·교우소식·일정 같은 커뮤니티 기능은 계속 쓸 수 있게 둡니다. isLeft는 "탈퇴 상태
  // 자체"(신청 탭 숨김 등에 사용), isLeftBlocked는 "화면을 아예 막아야 하는 탈퇴"(커뮤니티
  // 접근도 없는 경우)로 나눠 씁니다.
  const isLeft = !isGuest && currentUser.role === 'LEFT'
  const isLeftBlocked = isLeft && !currentUser.keepAppAccess

  // ── 안 읽은 알림 개수 확인 ──
  // 폰이 울리는 푸시가 아니라 앱 안 알림이므로, 앱을 보고 있을 때만 가볍게 확인합니다.
  // (승인 대기·거절 상태에서는 알림이 올 일이 없어 건너뜁니다)
  useEffect(() => {
    if (isGuest || isPending || isUnrequestedPending || isRejected || isLeftBlocked) return
    let stopped = false

    const check = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      dbFetchNotifications(currentUserId)
        .then(list => { if (!stopped) setNotifications(list) })
        .catch(() => { /* 일시적 오류는 다음 차례에 다시 시도 */ })
    }

    const timer = setInterval(check, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    check()

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isGuest, isPending, isUnrequestedPending, isRejected, isLeftBlocked, currentUserId])

  const unreadCount = notifications.filter(n => !n.isRead).length

  // ── 아이폰 홈 화면 앱: 로그인하고 돌아왔는데 로그아웃 상태로 보일 때 (src/lib/loginReturn.ts) ──
  const [showLoginReturnHelp, setShowLoginReturnHelp] = useState(false)
  useEffect(() => {
    // 첫 로그인 확인이 끝나기 전에는 기다립니다(그 사이엔 로그인된 분도 잠깐 '비로그인'으로 보입니다).
    if (isLoading) return
    if (!isGuest) { clearLoginStarted(); return }
    const check = async () => {
      if (document.visibilityState !== 'visible' || !loginStartedRecently()) return
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // 로그인 창에서 이미 로그인이 끝나 저장공간에 들어와 있음 → 앱을 새로 읽어 바로 반영
        clearLoginStarted()
        window.location.reload()
        return
      }
      // 사파리·카카오톡 쪽에서 로그인이 끝나 이 앱까지 오지 못한 경우 → 여기서 다시 로그인하도록 안내
      if (isRunningStandalone()) setShowLoginReturnHelp(true)
    }
    const onPageShow = () => { check() }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [isGuest, isLoading])

  // ── 가입 환영 팝업 ──
  // 승인이 끝난 성도인데 아직 환영 인사를 못 받았으면 딱 한 번 띄웁니다.
  // (추가정보 입력 모달이 떠 있는 동안에는 겹치지 않게 기다립니다)
  const showWelcome =
    !welcomeDismissed &&
    !isGuest &&
    !isPending &&
    !isUnrequestedPending &&
    !isRejected &&
    !isLeft &&
    !showProfileSetup &&
    !!currentUser &&
    currentUser.id !== 'guest' &&
    !currentUser.welcomedAt

  const handleCloseWelcome = () => {
    setWelcomeDismissed(true)
    // 화면에서도 즉시 "본 것"으로 바꿔, 명단이 다시 로드돼도 또 뜨지 않게 합니다.
    const now = new Date().toISOString()
    setUsers(prev => prev.map(u => (u.id === currentUserId ? { ...u, welcomedAt: now } : u)))
    dbMarkWelcomed(currentUserId).catch(() => { /* 실패하면 다음에 한 번 더 뜹니다 */ })
  }

  // ── 휴대폰 푸시 알림을 눌렀을 때 (public/sw.js 의 notificationclick 과 짝) ──
  // 앱이 떠 있으면 서비스워커가 메시지로, 꺼져 있었으면 주소의 ?n=<알림 번호> 로 알려 줍니다.
  // 목적지는 앱 안 알림함과 **같은 규칙(destinationOf)** 으로 정합니다.
  const pendingPushRef = useRef<{ notificationId?: string; url?: string } | null>(null)
  const [pushTick, setPushTick] = useState(0)   // 앱이 떠 있을 때 도착한 알림을 처리하라는 신호
  useEffect(() => {
    // 꺼져 있던 앱이 알림으로 켜진 경우: 주소의 알림 번호를 꺼내 둡니다.
    // (주소에서 지우는 일은 아래 "기록 모양 맞추기"가 합니다 — 새로고침해도 다시 가지 않게)
    const n = new URLSearchParams(window.location.search).get('n')
    if (n) pendingPushRef.current = { notificationId: n, url: '/' + window.location.hash }
  }, [])

  const openFromPush = async ({ notificationId, url }: { notificationId?: string; url?: string }) => {
    // 팝업(글쓰기 등)이 열려 있으면 화면을 바꾸지 않습니다 — 쓰던 내용이 사라지면 안 되니까요.
    // (앱은 이미 앞으로 나와 있으므로 팝업을 닫은 뒤 알림함에서 확인할 수 있습니다)
    if (document.body.style.overflow === 'hidden') return
    let hashTab = ''
    try { hashTab = new URL(url || '/', window.location.origin).hash.replace(/^#/, '') } catch { /* 주소가 이상하면 무시 */ }

    if (!isGuest && notificationId) {
      let found = notifications.find(item => item.id === notificationId)
      if (!found) {
        try {
          const list = await dbFetchNotifications(currentUserId)
          setNotifications(list)
          found = list.find(item => item.id === notificationId)
        } catch { /* 못 찾으면 아래 주소 기준으로 */ }
      }
      if (found) {
        // 푸시로 이미 확인한 알림이므로 종 아이콘의 빨간 숫자에서 빼 줍니다.
        if (!found.isRead) {
          setNotifications(prev => prev.map(item => (item.id === notificationId ? { ...item, isRead: true } : item)))
          dbMarkNotificationRead(notificationId).catch(() => { /* 실패해도 알림함을 열면 읽음 처리됩니다 */ })
        }
        const { tab, sub } = destinationOf(found)
        handleSetCurrentTab(tab, sub || undefined)
        return
      }
      // 알림함에 없는 푸시 = "확인 안 하신 댓글·좋아요가 N건" 같은 요약 알림입니다.
      // 🐛 예전엔 홈으로만 가서 무엇이 왔는지 알 수 없었습니다 → 알림함을 열어 목록을 보여 줍니다.
      if (!hashTab || hashTab === 'home') {
        setShowNotifications(true)
        return
      }
    }
    if (VALID_TABS.includes(hashTab)) handleSetCurrentTab(hashTab)
  }
  // 메시지 처리기는 한 번만 등록하므로, 늘 최신 화면 상태를 쓰도록 최신 함수를 가리켜 둡니다.
  const openFromPushRef = useRef(openFromPush)
  useEffect(() => { openFromPushRef.current = openFromPush })

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; notificationId?: string; url?: string } | null
      if (!d || d.type !== 'bridge:open-notification') return
      e.ports?.[0]?.postMessage('ok')   // "받았어요" — 서비스워커가 앱을 다시 켜지 않게
      pendingPushRef.current = { notificationId: d.notificationId, url: d.url }
      setPushTick(t => t + 1)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  // 로그인 확인이 끝난 뒤에 처리합니다(누구의 알림인지 알아야 하므로). 이미 끝났으면 바로 처리합니다.
  useEffect(() => {
    if (isLoading || !pendingPushRef.current) return
    const pending = pendingPushRef.current
    pendingPushRef.current = null
    openFromPushRef.current(pending)
  }, [isLoading, pushTick])

  // ── 기록(history) 모양 맞추기 + 뒤로가기/앞으로가기 따라가기 ──
  useEffect(() => {
    // 스크롤 위치는 화면별로 우리가 직접 기억합니다(브라우저가 기록 칸마다 멋대로 되돌리지 않게).
    setManualScrollRestoration()

    type NavState = { bridgeNav?: number; adminView?: boolean } | null
    // ⚠️ 기록 정리는 한 박자 뒤(setTimeout 0)에 합니다.
    //    이 effect 는 Next.js 가 history.pushState/replaceState 에 자기 표식(__NA)을 붙여 주는 장치를
    //    설치하기 **전에** 돕니다(자식 컴포넌트의 effect 가 부모보다 먼저 실행). 그때 기록을 고쳐 쓰면
    //    표식이 빠지고, 나중에 그 칸으로 뒤로 가면 Next.js 가 페이지를 통째로 다시 불러옵니다.
    const initTimer = setTimeout(() => {
      // 알림으로 켜졌다면 주소의 ?n=<알림 번호> 를 지웁니다(위에서 이미 꺼내 둠).
      const params = new URLSearchParams(window.location.search)
      if (params.has('n')) {
        params.delete('n')
        const rest = params.toString()
        window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
      }
      const st = window.history.state as NavState
      const initialTab = readTabFromHash()
      if (typeof st?.bridgeNav === 'number') {
        // 새로고침: 기록은 이미 규칙대로 쌓여 있습니다. 관리 화면에서 새로고침했으면 관리 화면으로 돌아옵니다.
        navDepthRef.current = st.bridgeNav
        isAdminViewRef.current = !!st.adminView   // 화면 상태는 useState 초기값이 이미 맞춰 둠
      } else if (initialTab !== 'home') {
        // 알림·바로가기로 탭 주소(#news)에 곧장 들어온 경우: 홈을 아래에 깔아 뒤로가기가 홈으로 가게 합니다.
        window.history.replaceState({ bridgeNav: 0 }, '', urlForTab('home'))
        window.history.pushState({ bridgeNav: 1 }, '', urlForTab(initialTab))
        navDepthRef.current = 1
      } else {
        window.history.replaceState({ bridgeNav: 0 }, '')
        navDepthRef.current = 0
      }
    }, 0)

    const onPopState = () => {
      const s = window.history.state as NavState
      // 팝업이 쌓은 칸(bridgeNav 없음)으로 오간 것은 팝업이 알아서 처리합니다.
      if (typeof s?.bridgeNav !== 'number') return
      navDepthRef.current = s.bridgeNav
      const replaceWith = pendingTabReplaceRef.current
      if (replaceWith) {
        pendingTabReplaceRef.current = null
        window.history.replaceState({ bridgeNav: s.bridgeNav }, '', urlForTab(replaceWith))
        return
      }
      const tab = readTabFromHash()
      const admin = !!s.adminView
      if (tab === currentTabRef.current && admin === isAdminViewRef.current) return   // 팝업이 닫혔을 뿐
      showView(tab, admin, admin ? 0 : savedScrollOf(tab))
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      clearTimeout(initTimer)
      window.removeEventListener('popstate', onPopState)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 화면이 바뀌면 그 화면의 마지막 스크롤 위치로 ──
  // 살려 둔 탭은 내용이 이미 그려져 있어 바로 돌아갑니다. 사진처럼 뒤늦게 높이가 생기는 경우를 위해
  // 잠깐(최대 약 0.7초) 더 맞춰 보고, 그 사이 사용자가 화면을 만지면 곧바로 멈춥니다.
  const viewKey = isAdminViewMode ? 'admin' : currentTab
  useLayoutEffect(() => {
    const target = pendingScrollRef.current
    pendingScrollRef.current = null
    if (target === null) return
    window.scrollTo(0, target)
    if (target <= 0) return
    let frames = 0
    let raf = 0
    const stop = () => cancelAnimationFrame(raf)
    const tick = () => {
      if (Math.abs(window.scrollY - target) < 2 || ++frames > 40) return
      window.scrollTo(0, target)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('touchstart', stop, { once: true, passive: true })
    window.addEventListener('wheel', stop, { once: true, passive: true })
    return () => {
      stop()
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('wheel', stop)
    }
  }, [viewKey])

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

    const applyRoleUpdate = async (role: Role | null | undefined) => {
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

    const check = async () => {
      if (stopped) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const role = await dbFetchMyRole(currentUserId)
      applyRoleUpdate(role)
    }

    // 관리자가 승인을 누르는 즉시 반영되도록, profiles 내 행 변경을 실시간으로 구독합니다.
    // (아래 15초 폴링은 실시간 연결이 끊기는 등의 상황을 대비한 안전장치로 남겨둡니다)
    const channel = supabase
      .channel(`profile-role-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${currentUserId}` },
        (payload) => applyRoleUpdate(payload.new?.role as Role | undefined)
      )
      .subscribe()

    const timer = setInterval(check, 15_000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    check()

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [isGuest, isPending, isRejected, currentUserId, currentUser.role])

  // 🐛 과거 버그: 관리자 화면의 성도 전체 명단(users)은 최초 로그인 시 딱 한 번만
  // 불러오고, 그 뒤로는 새로고침(페이지 재로드)을 하기 전까지 다시 불러오지 않았습니다.
  // 그래서 새 가입 신청 알림이 와도 승인 탭은 그 알림이 오기 전 상태 그대로였고,
  // 관리자가 "새로고침했다"고 생각한 조작(당겨서 새로고침 등)이 실제로는 새 네트워크
  // 요청으로 이어지지 않아 계속 비어 보였습니다 — 실제로는 명단을 다시 부르는 순간엔
  // 항상 정상이었습니다.
  // → 관리자에게만, 폴링 대신 Realtime 구독으로 profiles 변경을 받아 명단을 다시
  //   불러옵니다. 폴링과 달리 실제 변경이 있을 때만 이벤트가 오므로 서버 부담이
  //   거의 없습니다(WebSocket 연결 하나 유지 비용뿐).
  useEffect(() => {
    if (isGuest || currentUser.role !== 'ADMIN') return
    let stopped = false

    const refreshRoster = () => {
      dbFetchProfiles().then(dbUsers => {
        if (stopped || !dbUsers || dbUsers.length === 0) return
        setUsers(prev => {
          const byId = new Map(dbUsers.map(u => [u.id, u]))
          prev.forEach(u => { if (!byId.has(u.id)) byId.set(u.id, u) })
          return Array.from(byId.values())
        })
      }).catch(() => { /* 실시간 갱신 실패는 다음 변경 이벤트나 수동 새로고침으로 복구됩니다 */ })
    }

    const channel = supabase
      .channel('admin-profiles-roster')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        refreshRoster
      )
      .subscribe()

    return () => {
      stopped = true
      supabase.removeChannel(channel)
    }
  }, [isGuest, currentUser.role])

  // 관리자 - 가입 승인 처리
  const handleApproveUser = async (
    userId: string,
    labriId: string,
    role: Role,
    duty: string = '성도',
    familyInfo: string = '',
    familyGroupId: string = '',
    familyRole: string = ''
  ): Promise<{ error: { message?: string } | null }> => {
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

  const handleRejectUser = async (userId: string): Promise<{ error: { message?: string } | null }> => {
    const res = await dbRejectUser(userId)
    if (res.error) return { error: res.error }
    // 거절된 계정은 삭제하지 않고 role만 'REJECTED'로 바뀝니다(되돌릴 수 있도록).
    // 화면 목록에서는 승인 대기 필터에서 자동으로 빠집니다.
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'REJECTED' as Role } : u))
    return { error: null }
  }

  // ── 화면 구성 ──
  const canUseCommunity = !isGuest && !isPending && !isUnrequestedPending && !isRejected && !isLeftBlocked
  // 관리 화면 여부는 기록에서 되살아날 수도 있으므로(새로고침), 실제로 열 수 있는 권한일 때만 보여 줍니다.
  const showAdmin = isAdminViewMode && canOpenAdmin(currentUser.role)
  // 한 번 연 탭은 숨겨 둔 채 살려 둡니다. 보이는지 여부는 ViewActiveContext 로 알려 주어,
  // 숨어 있다 다시 보일 때 오래된 데이터를 새로 받게 합니다(src/lib/dataCache.ts).
  const tabPane = (id: string, node: ReactNode) => {
    if (!visitedTabs.includes(id)) return null
    const active = !showAdmin && currentTab === id
    return (
      <div hidden={!active}>
        <ViewActiveContext.Provider value={active}>{node}</ViewActiveContext.Provider>
      </div>
    )
  }

  // ── 당겨서 새로고침: 앱을 다시 켜지 않고 데이터만 새로 받습니다 (usePullToRefresh 주석 참고) ──
  const handleSoftRefresh = async () => {
    clearCache()                    // 저장해 둔 조회 결과를 비우고
    scrollByViewRef.current = {}    // 내용이 새로 오므로 탭마다 기억해 둔 위치도 버립니다
    setContentKey(k => k + 1)       // 화면 부품을 새로 그려 각자 최신 데이터를 받게 합니다
    if (!supabaseUser) return
    // 내 등급(승인·탈퇴 등)과 알림, 성도 명단도 다시 확인합니다 — 예전 "앱 다시 켜기"가 하던 일.
    const uMeta = supabaseUser.user_metadata || {}
    const me = await fetchProfile(supabaseUser.id, supabaseUser.email || '', uMeta.full_name || uMeta.name || '')
    const tasks: Promise<unknown>[] = [
      dbFetchNotifications(supabaseUser.id).then(setNotifications),
    ]
    if (hasCommunityAccess(me)) {
      tasks.push(dbFetchProfiles().then(dbUsers => {
        if (!dbUsers || dbUsers.length === 0) return
        setUsers(prev => {
          const byId = new Map(dbUsers.map(u => [u.id, u]))
          prev.forEach(u => { if (!byId.has(u.id)) byId.set(u.id, u) })
          return Array.from(byId.values())
        })
        setRosterError(null)
      }))
    }
    await Promise.allSettled(tasks)
  }
  const { pullPx, refreshing, threshold } = usePullToRefresh(handleSoftRefresh)

  // 로그인 확인이 끝나 성도 화면이 보이면, 나머지 탭(과 관리 화면)의 프로그램을 한가할 때 미리 받아 둡니다.
  const canPreloadAdmin = canOpenAdmin(currentUser.role)
  useEffect(() => {
    if (isLoading || !canUseCommunity) return
    return preloadLaterScreens(canPreloadAdmin)
  }, [isLoading, canUseCommunity, canPreloadAdmin])

  // 비로그인 + 앱 미설치 방문자에게는 랜딩 페이지를 먼저 보여줍니다.
  // currentUserId는 세션 확인 전 기본값이 'guest'이므로(위 useState 초기값 참고),
  // isLoading을 기다리지 않고 즉시 랜딩을 보여줍니다 — 검색엔진/AI 크롤러가
  // 자바스크립트 실행 없이 받는 최초 HTML에도 실제 소개 문구가 담기도록 하기 위함입니다.
  // (이미 로그인된 재방문 회원은 세션 확인이 끝나는 순간 바로 앱 화면으로 전환됩니다)
  const showLanding = isGuest && !landingDismissed && !isStandalone
  if (showLanding) {
    return <LandingPage onEnter={() => setLandingDismissed(true)} />
  }

  return (
    <div className="bg-brand-50 min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] w-full max-w-lg md:max-w-xl mx-auto relative border-x border-gray-200/60 shadow-md md:shadow-xl font-sans">
      {/* 당겨서 새로고침 표시 (아이폰 설치 앱은 사파리와 달리 기본 당김-새로고침이 없어서 직접 구현) */}
      <div
        className="fixed left-1/2 top-2 z-50 w-9 h-9 flex items-center justify-center bg-white rounded-full shadow-md pointer-events-none"
        style={{
          transform: `translate(-50%, ${pullPx - 40}px)`,
          opacity: pullPx > 0 || refreshing ? 1 : 0,
          transition: pullPx === 0 ? 'opacity 0.2s, transform 0.2s' : undefined,
        }}
      >
        <RefreshCw
          size={18}
          className={`text-brand ${refreshing ? 'animate-spin' : ''}`}
          style={!refreshing ? { transform: `rotate(${(pullPx / threshold) * 360}deg)` } : undefined}
        />
      </div>

      {/* 브랜드 헤더 */}
      <div className="bg-white/85 backdrop-blur-md px-5 py-1.5 border-b border-gray-100 flex items-center justify-between sticky top-0 z-40">
        {/* 가로형 로고에 교회 이름이 이미 들어 있어 글자를 따로 쓰지 않습니다 */}
        <button
          onClick={() => handleSetCurrentTab('home')}
          className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          title="홈으로 이동"
          aria-label="더브릿지교회 홈으로 이동"
        >
          <img src="/logo-wide.png" alt="더브릿지교회" className="h-12 w-auto" />
        </button>

        {isGuest ? (
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-3.5 py-1.5 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl shadow-2xs flex items-center gap-1 transition-all active:scale-95"
          >
            <LogIn size={13} /> 로그인 / 가입
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {/* 내 이름 버튼 = 알림함. 안 읽은 알림이 있으면 종 위에 빨간 숫자가 붙습니다.
                (내 정보 보기·로그아웃은 알림함 아래쪽으로 옮겼습니다)
                🐛 예전엔 이름만 있어서 이 버튼이 알림함이라는 걸 알기 어려웠습니다 → 종 아이콘을 붙입니다. */}
            <button
              onClick={() => setShowNotifications(v => !v)}
              className="relative flex items-center gap-1.5 bg-brand-50 text-brand font-bold pl-1 pr-2.5 py-1 rounded-full border border-brand-100/60 shadow-2xs hover:bg-brand-100/70 transition-all cursor-pointer max-w-[60vw]"
              title="알림 · 내 정보"
              aria-label={unreadCount > 0 ? `알림 ${unreadCount}건 · 내 정보` : '알림 · 내 정보'}
            >
              <span className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-2xs font-bold shrink-0 overflow-hidden">
                {currentUser.avatarUrl
                  ? <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : getInitials(currentUser.name)
                }
              </span>
              <span className="text-2xs truncate min-w-0">{getUserDisplayName(currentUser)}</span>
              <span className="relative shrink-0 flex items-center" aria-hidden="true">
                <Bell size={16} strokeWidth={2.2} className={unreadCount > 0 ? 'text-brand' : 'text-brand/70'} />
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2.5 min-w-[17px] h-[17px] px-1 bg-rose-500 text-white text-2xs font-black rounded-full flex items-center justify-center shadow-sm ring-2 ring-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
            </button>
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
            <p className="text-2xs text-rose-700 leading-relaxed break-all">{authError}</p>
            <p className="text-2xs text-rose-600/80 leading-relaxed">
              다시 시도해도 같은 문제가 계속되면 교회 관리자에게 이 메시지를 알려주세요.
            </p>
          </div>
          <button aria-label="닫기" onClick={() => setAuthError('')} className="tap-area relative p-2 -m-1 text-rose-400 hover:text-rose-600 shrink-0" title="닫기">✕</button>
        </div>
      )}

      {/* 아이폰 홈 화면 앱: 로그인이 다른 곳(사파리·카카오톡)에서 끝나 앱으로 오지 못했을 때 */}
      {showLoginReturnHelp && isGuest && (
        <div className="mx-4 mt-3 bg-brand-50 border border-brand-100 rounded-2xl p-3 space-y-2 animate-fade-in" role="status">
          <div className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">🔑</span>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold text-brand-deep">로그인이 이 앱에 반영되지 않았나요?</p>
              <p className="text-2xs text-gray-600 leading-relaxed">
                아이폰에서는 카카오톡이나 사파리에서 끝난 로그인이 홈 화면 앱으로 넘어오지 않을 수 있습니다.
                아래 버튼으로 이 앱에서 한 번 더 로그인해 주세요.
              </p>
            </div>
            <button aria-label="닫기" title="닫기" onClick={() => { clearLoginStarted(); setShowLoginReturnHelp(false) }} className="tap-area relative p-2 -m-1 text-gray-500 shrink-0">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setShowLoginReturnHelp(false); handleKakaoLogin() }} className="py-2.5 bg-[#FEE500] text-[#3C1E1E] text-xs font-bold rounded-xl">카카오로 다시 로그인</button>
            <button onClick={() => { setShowLoginReturnHelp(false); handleGoogleLogin() }} className="py-2.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-xl">구글로 다시 로그인</button>
          </div>
        </div>
      )}

      <main className="p-4">
        {/* 승인이 확인되면 화면이 저절로 바뀝니다. 왜 바뀌었는지 알 수 있도록 알려드립니다. */}
        {justApproved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-3 flex items-start gap-2 animate-fade-in">
            <span className="text-base leading-none mt-0.5">🎉</span>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold text-emerald-800">가입이 승인되었습니다</p>
              <p className="text-2xs text-emerald-700 leading-relaxed">
                이제 소식 · 나눔 · 신청 기능을 모두 이용하실 수 있습니다. 환영합니다!
              </p>
            </div>
            <button aria-label="닫기" onClick={() => setJustApproved(false)} className="tap-area relative p-2 -m-1 text-emerald-400 hover:text-emerald-600 shrink-0" title="닫기">✕</button>
          </div>
        )}
        {rosterError && !isLoading && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-3 flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">📡</span>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold text-amber-800">성도 명단을 불러오지 못했습니다</p>
              <p className="text-2xs text-amber-700 leading-relaxed">
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
              className="px-2.5 py-1.5 bg-amber-600 text-white text-2xs font-bold rounded-lg shrink-0"
            >다시 시도</button>
          </div>
        )}
        {isLoading ? (
          // DB 로드 전 로딩 스피너 (더미 데이터 노출 방지)
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <div className="w-10 h-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
            <p className="text-xs text-gray-500 font-medium">더브릿지교회 로딩 중...</p>
          </div>
        ) : (
          // 당겨서 새로고침하면 contentKey 가 바뀌어 아래 화면 부품이 모두 새로 그려집니다(각자 최신 데이터를 다시 받음).
          <div key={contentKey}>
            {/* 관리자 대시보드 — 탭들은 그 아래에 숨겨 둔 채 살려 둡니다(돌아오면 보던 자리 그대로) */}
            {showAdmin && (
              <AdminDashboard
                currentUser={currentUser}
                allUsers={users}
                onApproveUser={handleApproveUser}
                onRejectUser={handleRejectUser}
                onUpdateUsers={setUsers}
                onBack={closeAdmin}
                openTab={adminTabRequest.tab}
                openToken={adminTabRequest.token}
              />
            )}

            {/* 1. 홈 탭 (누구나 열람 가능) */}
            {tabPane('home', (
              <HomeTab
                currentUser={currentUser}
                allUsers={users}
                isGuest={isGuest || isPending || isUnrequestedPending || isRejected || isLeftBlocked}
                onNavigate={handleSetCurrentTab}
              />
            ))}

            {/* 2. 비회원(isGuest) 접근 차단 카드 */}
            {!showAdmin && currentTab !== 'home' && isGuest && (
              <div className="bg-white rounded-3xl p-8 text-center space-y-4 border border-brand-100 shadow-2xs mt-2 animate-fade-in">
                <div className="text-4xl">🔒</div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-sm text-gray-900">로그인이 필요한 서비스입니다</h3>
                  <p className="text-xs text-gray-500">교회 소식과 나눔은 로그인 후 이용하실 수 있습니다.</p>
                </div>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full py-3 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  로그인 / 회원가입 신청하기
                </button>
              </div>
            )}

            {/* 2-1. 로그인은 했지만 아직 "가입 완료 및 승인 신청"을 안 누른 사람 —
                이때는 아직 신청서를 낸 게 아니므로 "승인 대기 중"이 아니라 신청을 이어가라고 안내합니다. */}
            {!showAdmin && currentTab !== 'home' && isUnrequestedPending && (
              <div className="bg-white rounded-3xl p-8 text-center space-y-4 border border-brand-100 shadow-2xs mt-2 animate-fade-in">
                <div className="text-4xl">📝</div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-sm text-gray-900">가입 신청이 아직 완료되지 않았습니다</h3>
                  <p className="text-xs text-gray-500">추가 정보를 입력하고 승인 신청을 완료하시면 이용하실 수 있습니다.</p>
                </div>
                <button
                  onClick={() => {
                    setOauthName(currentUser.name || '')
                    setOauthEmail(currentUser.email || '')
                    setShowProfileSetup(true)
                  }}
                  className="w-full py-3 bg-brand hover:bg-brand-hover text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  가입 신청 이어하기
                </button>
              </div>
            )}

            {/* 3. 가입 승인 대기자(isPending) 접근 차단 및 대기 안내 카드 */}
            {!showAdmin && currentTab !== 'home' && isPending && (
              <div className="bg-white rounded-3xl p-8 text-center space-y-4 border border-amber-100 shadow-2xs mt-2 animate-fade-in">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center text-3xl mx-auto animate-pulse">
                  ⏳
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base text-gray-900">가입 승인 대기 중입니다</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    교회 관리자의 가입 승인 완료 후<br />소식, 나눔, 신청 기능을 이용하실 수 있습니다.
                  </p>
                  <p className="text-2xs text-brand font-medium">
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
                        await showAlert('아직 승인되지 않았습니다. 교회 관리자에게 문의해 주세요.')
                      }
                    } catch {
                      await showAlert('상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
                    }
                  }}
                  className="w-full py-2.5 bg-brand text-white text-xs font-bold rounded-xl hover:bg-brand-hover transition-all"
                >
                  승인 상태 새로고침
                </button>
              </div>
            )}

            {/* 3-1. 가입이 거절된 계정 안내 */}
            {!showAdmin && currentTab !== 'home' && isRejected && (
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
                      await showAlert('다시 신청하지 못했습니다. 잠시 후 시도하거나 교회 사무실로 문의해 주세요.')
                      return
                    }
                    setUsers(prev => prev.map(u => u.id === currentUserId ? { ...u, role: 'PENDING' as Role, signupRequestedAt: new Date().toISOString() } : u))
                    await showAlert('가입 신청이 다시 접수되었습니다. 관리자 승인을 기다려 주세요.')
                  }}
                  className="w-full py-3 bg-brand text-white text-xs font-bold rounded-xl hover:bg-brand-hover transition-all"
                >
                  다시 가입 신청하기
                </button>
                <p className="text-2xs text-gray-500">문의: 교회 사무실</p>
              </div>
            )}

            {/* 3-2. 관리자가 탈퇴 처리한 계정 안내 — 커뮤니티 접근이 없는 경우에만 화면을 막습니다.
                (REJECTED와 달리 본인이 되돌릴 수 없습니다 — 관리자만 [성도 관리 > 탈퇴 처리된 성도]
                에서 복구합니다) */}
            {!showAdmin && currentTab !== 'home' && isLeftBlocked && (
              <div className="bg-white rounded-3xl p-8 text-center space-y-4 border border-gray-200 shadow-2xs mt-2 animate-fade-in">
                <div className="w-16 h-16 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-3xl mx-auto">
                  🚪
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base text-gray-900">탈퇴 처리된 계정입니다</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    다시 교회에 나오시게 되면 교회 사무실로 연락해 주세요.<br />
                    관리자가 확인 후 계정을 복구해 드립니다.
                  </p>
                </div>
                <p className="text-2xs text-gray-500">문의: 교회 사무실</p>
              </div>
            )}

            {/* 4. 정회원 이상 승인 완료자만 접근 가능한 탭들 (커뮤니티 접근이 남은 탈퇴 계정도 포함 —
                그 경우 신청 탭만 아래에서 따로 숨깁니다).
                한 번 연 탭은 다른 탭으로 가도 숨겨 둔 채 살려 둡니다(tabPane). */}
            {canUseCommunity && (
              <>
                {/* 우리소식 탭 */}
                {tabPane('news', (
                  <NewsTab
                    currentUser={currentUser}
                    allUsers={users}
                    openSubTab={subTabRequest.tab === 'news' ? subTabRequest.sub : ''}
                    openToken={subTabRequest.token}
                  />
                ))}

                {/* 나눔 탭 */}
                {tabPane('sharing', (
                  <SharingTab
                    currentUser={currentUser}
                    allUsers={users}
                    openSubTab={subTabRequest.tab === 'sharing' ? subTabRequest.sub : ''}
                    openToken={subTabRequest.token}
                  />
                ))}

                {/* 신청 탭 — 탈퇴 처리된 계정(커뮤니티 접근을 유지 중이어도)은 식사 신청 대상이
                    아니므로 제외합니다. */}
                {!isLeft && tabPane('request', (
                  <RequestTab
                    currentUser={currentUser}
                    allUsers={users}
                    openSubTab={subTabRequest.tab === 'request' ? subTabRequest.sub : ''}
                    openToken={subTabRequest.token}
                  />
                ))}
                {!showAdmin && currentTab === 'request' && isLeft && (
                  <div className="bg-white rounded-3xl p-8 text-center space-y-2 border border-gray-100 shadow-2xs mt-2 animate-fade-in">
                    <div className="w-14 h-14 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-2xl mx-auto">🍚</div>
                    <p className="text-xs text-gray-500">식사 신청은 현재 교회 명단에 계신 분들만 이용하실 수 있습니다.</p>
                  </div>
                )}

                {/* 마이페이지 탭 */}
                {tabPane('mypage', (
                  <MyPageTab
                    currentUser={currentUser}
                    allUsers={users}
                    onNavigateAdmin={() => openAdmin()}
                    onUpdateUsers={setUsers}
                    onLogout={supabaseUser ? handleLogout : undefined}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </main>

      {/* 가입 승인 후 첫 방문 환영 */}
      {showWelcome && !isGuest && (
        <WelcomeModal currentUser={currentUser} onClose={handleCloseWelcome} />
      )}

      {/* 알림함 (헤더의 내 이름 버튼에서 열림) */}
      {showNotifications && !isGuest && (
        <NotificationPanel
          currentUser={currentUser}
          items={notifications}
          setItems={setNotifications}
          onClose={() => setShowNotifications(false)}
          onNavigate={handleSetCurrentTab}
          onGoMyPage={() => handleSetCurrentTab('mypage')}
          onLogout={handleLogout}
          canLogout={!!supabaseUser}
        />
      )}

      {/* 회원가입 / 로그인 모달 */}
      {showAuthModal && (
        <Modal onClose={() => setShowAuthModal(false)} title="로그인 / 가입 신청" bodyClassName="p-4">
          <AuthPending
            currentRole={isGuest ? 'MEMBER' : currentUser.role}
            onRefreshStatus={() => setShowAuthModal(false)}
            onGoogleLogin={handleGoogleLogin}
            onKakaoLogin={handleKakaoLogin}
          />
        </Modal>
      )}

      {/* OAuth 가입 후 추가정보 입력 모달 */}
      {showProfileSetup && (
        <ProfileSetupModal
          initialName={oauthName}
          initialEmail={oauthEmail}
          onSubmit={handleProfileSetupSubmit}
          onCancel={() => {
            // 🐛 과거 버그: 여기서 곧바로 로그아웃시켰습니다. 아직 신청서를 제출하지 않았을
            // 뿐인데 로그인 자체가 풀려버려, 나중에 이어서 신청하려면 다시 로그인해야 했습니다.
            // → 로그인은 유지하고 기본(홈) 화면으로 보냅니다. 신청은 마이페이지 등에서 이어할 수 있습니다.
            setShowProfileSetup(false)
          }}
        />
      )}

      {/* 하단 네비게이션 바 */}
      <BottomNav currentTab={currentTab} setCurrentTab={handleSetCurrentTab} hiddenTabIds={isLeft ? ['request'] : undefined} />
    </div>
  )
}