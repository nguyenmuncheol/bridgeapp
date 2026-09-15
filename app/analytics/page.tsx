'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Lock, LogIn, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react'
import { supabase } from '../../src/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { UserProfile, Role } from '../../src/lib/mockData'
import { dbFetchProfiles } from '../../src/lib/db'
import AnalyticsDashboard from '../../src/components/analytics/AnalyticsDashboard'

/** 어떤 형태로 던져지든 사람이 읽을 메시지 한 줄로 만듭니다. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '')
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [sessionUser, setSessionUser] = useState<User | null>(null)
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [authError, setAuthError] = useState('')

  // 세션 및 관리자 권한 확인
  const verifyAuth = async () => {
    // 첫 줄부터 await 로 시작합니다.
    // 🐛 예전엔 try/finally 로 감싸고 첫 줄에서 setAuthChecking(true) 를 불렀습니다.
    //    이 함수를 마운트 effect 가 그대로 호출하는데, getSession() 이 (드물지만) 동기적으로
    //    던지면 catch/finally 안의 setState 까지 **렌더 직후 동기로** 실행됩니다.
    //    그러면 "그리자마자 곧바로 다시 그리는" 모양이 됩니다.
    // → 오류를 결과값으로 받아 처리해, await 이후에만 상태를 건드리도록 했습니다.
    //   처음 확인은 authChecking 의 초기값(true)이 담당하고, 로그인 직후 재확인은
    //   호출하는 쪽(이벤트 핸들러)에서 표시합니다.
    const sessionResult = await supabase.auth.getSession()
      .then(r => ({ ok: true as const, session: r.data.session ?? null }))
      .catch((err: unknown) => ({ ok: false as const, err }))

    if (!sessionResult.ok) {
      console.error('Analytics auth verification error:', errorMessage(sessionResult.err))
      setAuthError('인증 상태를 확인하지 못했습니다.')
      setAuthChecking(false)
      return
    }

    // 세션을 실제로 확인하고 나서 지난 오류 문구를 지웁니다.
    setAuthError('')

    const session = sessionResult.session
    if (!session?.user) {
      setSessionUser(null)
      setCurrentProfile(null)
      setAuthChecking(false)
      return
    }

    setSessionUser(session.user)

    const profile = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(r => r.data, () => null)

    if (profile) {
      setCurrentProfile({
        id: profile.id,
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        role: (profile.role || 'PENDING') as Role,
        duty: profile.duty || '',
        createdAt: profile.created_at || '',
        lastActiveAt: profile.last_active_at,
        isPwa: profile.is_pwa === true,
      })
    }

    setAuthChecking(false)
  }

  useEffect(() => {
    // 아래 두 억제는 성격이 다릅니다.
    //
    // set-state-in-effect: verifyAuth 안의 상태 변경은 **전부 첫 await 뒤**에 있습니다
    //   (첫 줄이 await supabase.auth.getSession()... 이고, 동기적으로 던지더라도 그냥
    //    거부된 프로미스가 될 뿐 setState 가 동기 실행되지 않습니다).
    //   린트 규칙이 호출된 함수 안까지 따라 들어가지만 async 경계는 구분하지 못해 생기는
    //   오탐입니다. 이 억제를 지우고 싶다면 함수를 effect 안으로 옮겨야 합니다.
    //
    // exhaustive-deps: 로그인 여부 확인은 화면에 들어올 때 한 번만 하면 됩니다.
    //
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    verifyAuth()
  }, [])


  // 이메일/비밀번호 로그인
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthError('이메일과 비밀번호를 모두 입력해 주세요.')
      return
    }

    setIsLoggingIn(true)
    setAuthError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword.trim(),
      })
      if (error) {
        setAuthError(`로그인 실패: ${error.message}`)
        return
      }
      setAuthChecking(true)
      await verifyAuth()
    } catch (err) {
      setAuthError(`로그인 중 오류가 발생했습니다: ${errorMessage(err)}`)
    } finally {
      setIsLoggingIn(false)
    }
  }

  // Google OAuth 로그인
  const handleGoogleLogin = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/analytics` : undefined,
        },
      })
    } catch (err) {
      setAuthError(`Google 로그인 오류: ${errorMessage(err)}`)
    }
  }

  // 로그아웃
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSessionUser(null)
    setCurrentProfile(null)
  }

  // 1. 세션 로딩 중
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-300 space-y-3">
        <RefreshCw size={28} className="animate-spin text-blue-400" />
        <p className="text-xs font-semibold">관리자 보안 권한 확인 중...</p>
      </div>
    )
  }

  // 2. 비로그인 상태 (관리자 전용 로그인 화면)
  if (!sessionUser || !currentProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 text-slate-100">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400">
              <Shield size={28} />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">더브릿지교회 관리자 인증</h1>
            <p className="text-xs text-slate-400">
              성도 이용 분석 페이지는 관리자(ADMIN) 권한이 필요합니다.
            </p>
          </div>

          {authError && (
            <div className="bg-rose-500/20 border border-rose-500/40 p-3 rounded-xl flex items-start gap-2 text-rose-300 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* 이메일 로그인 폼 */}
          <form onSubmit={handleEmailLogin} className="space-y-3 text-xs">
            <div>
              <label className="block text-2xs font-semibold text-slate-400 mb-1">관리자 이메일</label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="pastor@thebridge.org"
                className="w-full p-3 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 text-white font-medium placeholder:text-slate-600"
                required
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-400 mb-1">비밀번호</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 bg-slate-800/80 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 text-white font-medium placeholder:text-slate-600"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
              <span>{isLoggingIn ? '인증 확인 중...' : '관리자 로그인'}</span>
            </button>
          </form>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-3xs text-slate-500 uppercase font-semibold">또는</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Google 계정으로 로그인</span>
          </button>

          <div className="pt-2 text-center">
            <button
              onClick={() => router.push('/')}
              className="text-xs text-slate-400 hover:text-slate-200 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft size={12} />
              <span>교회 홈페이지로 돌아가기</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 3. 로그인은 되었으나 관리자(ADMIN) 권한이 아닌 경우
  if (currentProfile.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 sm:p-8 rounded-3xl shadow-2xl text-center space-y-5 text-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Lock size={28} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">접근 권한 제한</h1>
            <p className="text-xs text-slate-400 mt-1">
              현재 로그인된 계정(<strong>{currentProfile.name}</strong>, {currentProfile.role})은 관리자 권한이 없습니다.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleLogout}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer"
            >
              다른 계정으로 로그인
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              홈으로 이동
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 4. 관리자 권한 확인 완료 → 대시보드 렌더링
  return (
    <AnalyticsDashboard
      currentUser={currentProfile}
      onGoHome={() => router.push('/')}
    />
  )
}
