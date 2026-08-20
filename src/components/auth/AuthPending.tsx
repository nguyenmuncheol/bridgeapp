'use client'

import { Role } from '../../lib/mockData'

interface AuthPendingProps {
  onGoogleLogin: () => void
  onKakaoLogin?: () => void
  onRefreshStatus: () => void
  currentRole: Role
}

export default function AuthPending({ onGoogleLogin, onKakaoLogin, onRefreshStatus, currentRole }: AuthPendingProps) {
  // 이미 가입 신청 후 승인 대기 중인 경우
  if (currentRole === 'PENDING') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center text-2xl animate-pulse">
          ⏳
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm max-w-xs w-full space-y-1.5">
          <h2 className="font-bold text-sm text-gray-900">가입 승인 대기 중</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            교회 관리자의 가입승인 후 이용하실 수 있습니다.
          </p>
        </div>
        <button
          onClick={onRefreshStatus}
          className="w-full max-w-xs py-2.5 bg-[#335f87] text-white text-xs font-bold rounded-xl"
        >
          승인 상태 새로고침
        </button>
      </div>
    )
  }

  // 비회원 → 소셜 로그인만 제공
  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center p-4 space-y-6">
      {/* 로고 및 안내 */}
      <div className="text-center space-y-2">
        <div className="text-4xl">⛪</div>
        <h2 className="font-black text-lg text-[#335f87]">더브릿지교회</h2>
        <p className="text-xs text-gray-500">
          카카오/구글 계정으로 간편하게 로그인/가입하세요.<br />
          관리자의 가입 승인 후 이용하실 수 있습니다.
        </p>
      </div>

      {/* 소셜 로그인 버튼 */}
      <div className="w-full max-w-xs space-y-3">
        {/* 구글 로그인 */}
        <button
          type="button"
          onClick={onGoogleLogin}
          className="w-full py-3 px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-bold rounded-2xl flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98]"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Google 계정으로 시작하기
        </button>

        {/* 카카오 로그인 */}
        <button
          type="button"
          onClick={onKakaoLogin}
          className="w-full py-3 px-4 bg-[#FEE500] hover:bg-[#FFDE00] text-[#3C1E1E] text-sm font-bold rounded-2xl flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98]"
        >
          {/* 카카오 로고 */}
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#3C1E1E">
            <path d="M12 3C7.03 3 3 6.14 3 10.01c0 2.45 1.6 4.6 4.03 5.88l-.99 3.69c-.08.3.22.56.5.38L10.76 18c.4.04.81.06 1.24.06 4.97 0 9-3.14 9-7.01C21 6.14 16.97 3 12 3z"/>
          </svg>
          카카오 계정으로 시작하기
        </button>
      </div>

      <p className="text-2xs text-gray-400 text-center max-w-xs leading-relaxed">
        로그인 시 식별을 위한 이름/이메일 등 프로필 정보를 가져오며,<br />
        추가 정보(전화번호/주소/생일)는 직접 입력해주세요
      </p>
    </div>
  )
}
