'use client'

import { useState } from 'react'

interface ProfileSetupModalProps {
  initialName: string
  initialEmail: string
  onSubmit: (data: { name: string; phone: string; address: string; birthday: string }) => void
  onCancel: () => void
}

export default function ProfileSetupModal({ initialName, initialEmail, onSubmit, onCancel }: ProfileSetupModalProps) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const currentYear = new Date().getFullYear()
  const [birthYear, setBirthYear] = useState('1980')
  const [birthMonth, setBirthMonth] = useState('01')
  const [birthDay, setBirthDay] = useState('01')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim() || !address.trim()) {
      alert('모든 항목을 입력해 주세요.')
      return
    }
    const birthday = `${birthYear}-${birthMonth}-${birthDay}`
    onSubmit({ name: name.trim(), phone: phone.trim(), address: address.trim(), birthday })
  }

  // 1900년부터 현재년도까지 (내림차순)
  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => String(currentYear - i))
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden relative">
        {/* 상단 닫기/뒤로가기 X 버튼 */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-white/80 hover:text-white font-bold p-1 rounded-lg hover:bg-white/10 transition-all z-10"
          title="취소하고 뒤로가기"
        >
          ✕
        </button>

        {/* 헤더 */}
        <div className="bg-[#335f87] text-white px-6 py-5 text-center space-y-1 relative">
          <div className="text-3xl">🙌</div>
          <h2 className="font-black text-base">환영합니다!</h2>
          <p className="text-[11px] text-blue-200 leading-relaxed">
            더브릿지교회 앱 사용을 위해<br />추가 정보를 입력해 주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
          {/* 소셜 계정 연동 정보 (구글/카카오) */}
          <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
            {initialEmail ? (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#3C1E1E">
                <path d="M12 3C7.03 3 3 6.14 3 10.01c0 2.45 1.6 4.6 4.03 5.88l-.99 3.69c-.08.3.22.56.5.38L10.76 18c.4.04.81.06 1.24.06 4.97 0 9-3.14 9-7.01C21 6.14 16.97 3 12 3z"/>
              </svg>
            )}
            <div>
              <span className="text-[10px] text-gray-400 font-semibold">
                {initialEmail ? '소셜 계정 (Google)' : '소셜 계정 (카카오톡)'}
              </span>
              <p className="font-bold text-gray-700 mt-0.5">
                {initialEmail || `${initialName} (인증 완료)`}
              </p>
            </div>
          </div>

          {/* 이름 */}
          <div>
            <label className="block text-gray-600 font-semibold mb-1">
              이름 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="홍길동"
              className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]"
              required
            />
          </div>

          {/* 연락처 */}
          <div>
            <label className="block text-gray-600 font-semibold mb-1">
              연락처 <span className="text-rose-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="037-123-4567"
              className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]"
              required
            />
          </div>

          {/* 거주지 주소 */}
          <div>
            <label className="block text-gray-600 font-semibold mb-1">
              거주지 주소 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="경남 A동 1023호"
              className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]"
              required
            />
          </div>

          {/* 생년월일 (연도 | 월 | 일 드롭다운) */}
          <div>
            <label className="block text-gray-600 font-semibold mb-1">
              생년월일 <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={birthYear}
                onChange={e => setBirthYear(e.target.value)}
                className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-700 font-medium"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <select
                value={birthMonth}
                onChange={e => setBirthMonth(e.target.value)}
                className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-700 font-medium"
              >
                {months.map(m => (
                  <option key={m} value={m}>{Number(m)}월</option>
                ))}
              </select>
              <select
                value={birthDay}
                onChange={e => setBirthDay(e.target.value)}
                className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-700 font-medium"
              >
                {days.map(d => (
                  <option key={d} value={d}>{Number(d)}일</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              className="w-full py-3 bg-[#335f87] hover:bg-[#2b5072] text-white font-bold rounded-2xl shadow-sm transition-all"
            >
              가입 완료 및 승인 신청
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-2xl transition-all"
            >
              취소 (나중에 신청)
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              가입 후 관리자 승인 완료 시 모든 메뉴를 이용하실 수 있습니다.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
