'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application runtime error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#f7f9ff] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full text-center shadow-lg border border-gray-100 space-y-5 animate-fade-in">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">
          <AlertTriangle size={32} />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">화면을 불러오는 중 오류가 발생했습니다</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            일시적인 네트워크 또는 시스템 문제일 수 있습니다.<br />
            아래 버튼을 눌러 다시 시도해 주세요.
          </p>
          {error.message && (
            <p className="text-2xs text-gray-400 bg-gray-50 p-2 rounded-lg font-mono break-all text-left">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => reset()}
            className="w-full py-3 bg-[#335f87] hover:bg-[#2b5072] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          >
            <RefreshCw size={14} />
            다시 시도하기
          </button>
          <button
            onClick={() => {
              window.location.href = '/'
            }}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Home size={14} />
            홈으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}
