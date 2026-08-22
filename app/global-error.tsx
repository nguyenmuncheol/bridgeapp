'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global layout error:', error)
  }, [error])

  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-lg space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-base font-bold text-gray-900">앱을 실행하는 중 오류가 발생했습니다</h2>
          <p className="text-xs text-gray-500">
            앱을 다시 불러와 주세요.
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-[#335f87] text-white font-bold text-xs rounded-xl shadow-xs"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  )
}
