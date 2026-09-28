'use client'

/**
 * 화면 위쪽에 잠깐 떴다 사라지는 안내 한 줄("저장되었습니다" 등).
 *
 * 띄우고 지우는 시점은 각 화면이 정합니다(toastMsg 상태 + setTimeout). 이 컴포넌트는
 * **생김새와 위치만** 책임집니다.
 *
 *   {toastMsg && ...직접 그린 div...}   →   <Toast message={toastMsg} />
 *
 * 🐛 예전엔 같은 모양이 10개 화면에 복사돼 있었고, 모두 whitespace-nowrap(줄바꿈 금지)이라
 *    "복사가 지원되지 않는 브라우저입니다. 계좌번호를 길게 눌러 복사해 주세요." 같은 긴 안내가
 *    휴대폰 화면 양옆으로 잘려 앞뒤를 읽을 수 없었습니다.
 *    또 z-50 이라 팝업(z-70 이상) 뒤에 깔려서, 프로필 수정 창에서 사진을 올릴 때 뜨는
 *    "업로드 중…" 안내가 어두운 배경 뒤에 가려졌습니다.
 * → 화면 폭을 넘으면 줄을 바꾸고, 팝업 위(확인창 아래)에 뜹니다.
 *   아이폰 홈 화면 앱의 상단 안전영역만큼 더 내려 둡니다.
 */
export default function Toast({ message }: { message: string }) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+5rem)] z-[90] w-max max-w-[calc(100vw-2rem)] bg-slate-900/90 text-white text-xs font-bold leading-snug text-center break-keep px-4 py-2 rounded-2xl shadow-lg pointer-events-none animate-fade-in"
    >
      {message}
    </div>
  )
}
