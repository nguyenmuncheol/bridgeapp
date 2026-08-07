'use client'

import { useState } from 'react'
import { Role } from '../../lib/mockData'

interface AuthPendingProps {
  onRegisterSubmit: (name: string, phone: string, address: string) => void
  onRefreshStatus: () => void
  currentRole: Role
}

export default function AuthPending({ onRegisterSubmit, onRefreshStatus, currentRole }: AuthPendingProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim() || !address.trim()) {
      alert('이름, 전화번호, 주소를 모두 입력해주세요.')
      return
    }
    onRegisterSubmit(name, phone, address)
  }

  if (currentRole === 'PENDING') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center font-bold text-2xl animate-pulse">
          ⏳
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-2xs max-w-xs w-full space-y-1">
          <h2 className="font-bold text-sm text-gray-900">가입 승인 대기 중</h2>
          <p className="text-xs text-gray-600">
            교회 관리자의 가입 승인을 기다리고 있습니다. 아래 공개 메뉴는 자유롭게 둘러보실 수 있습니다.
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

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center p-4 text-center space-y-5">
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm max-w-xs w-full text-left space-y-4">
        <h2 className="font-bold text-base text-[#335f87] text-center">더브릿지교회 회원가입</h2>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-gray-600 font-semibold mb-1">성도 이름 *</label>
            <input
              type="text"
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-gray-600 font-semibold mb-1">전화번호 *</label>
            <input
              type="text"
              placeholder="+84 90 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-gray-600 font-semibold mb-1">거주지 주소 *</label>
            <input
              type="text"
              placeholder="하노이 미딩 송다 A동 1001호"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#335f87] text-white font-bold rounded-xl hover:bg-[#2b5072] transition-all shadow-sm mt-2"
          >
            가입 신청하기
          </button>
        </form>
      </div>
    </div>
  )
}
