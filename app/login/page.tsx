'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../src/lib/supabase/client'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    if (isSignUp) {
      // 회원가입
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || '새 교인',
          },
        },
      })

      if (error) {
        setErrorMsg(error.message)
      } else {
        alert('회원가입이 완료되었습니다! 로그인해 주세요.')
        setIsSignUp(false)
      }
    } else {
      // 로그인
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setErrorMsg('이메일 또는 비밀번호가 일치하지 않습니다.')
      } else {
        router.push('/')
        router.refresh()
      }
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-5 max-w-md mx-auto">
      <div className="w-full bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-blue-600 tracking-tight">The Bridge</h1>
          <p className="text-xs text-gray-400 mt-1">
            {isSignUp ? '청년부 커뮤니티 회원가입' : '청년부 커뮤니티 로그인'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-xl text-xs font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">이름</label>
              <input
                type="text"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 font-medium"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">이메일</label>
            <input
              type="email"
              placeholder="example@church.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">비밀번호</label>
            <input
              type="password"
              placeholder="6자리 이상 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 font-medium"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-300 mt-2"
          >
            {loading ? '처리 중...' : isSignUp ? '가입하기' : '로그인'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setErrorMsg('')
            }}
            className="text-xs text-gray-500 underline underline-offset-4"
          >
            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '처음이신가요? 회원가입하기'}
          </button>
        </div>
      </div>
    </main>
  )
}