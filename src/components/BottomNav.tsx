'use client'

import { Home, Newspaper, Heart, ClipboardList, User } from 'lucide-react'

interface BottomNavProps {
  currentTab: string
  setCurrentTab: (tab: string) => void
}

const NAV_ITEMS = [
  { id: 'home', label: '홈', icon: Home },
  { id: 'news', label: '우리소식', icon: Newspaper },
  { id: 'sharing', label: '나눔', icon: Heart },
  { id: 'request', label: '신청', icon: ClipboardList },
  { id: 'mypage', label: '내정보', icon: User },
]

export default function BottomNav({ currentTab, setCurrentTab }: BottomNavProps) {
  return (
    // pb-[env(safe-area-inset-bottom)]: 아이폰에서 홈 화면 앱으로 실행하면 화면 맨 아래
    // 약 34px이 시스템 홈 인디케이터 영역입니다. 이 여백이 없으면 메뉴가 그 아래로 들어가
    // 글자가 가려지고, 그 부분을 누르면 iOS가 탭을 가로채서 "가끔 안 눌려요"가 됩니다.
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-lg pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-lg md:max-w-xl mx-auto flex items-stretch">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = currentTab === id
          return (
            <button
              key={id}
              onClick={() => setCurrentTab(id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-w-0 transition-all ${
                isActive ? 'text-[#335f87]' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className={`relative flex items-center justify-center rounded-xl transition-all ${
                isActive ? 'bg-blue-50 p-1.5' : 'p-1.5'
              }`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={`text-2xs leading-none font-medium truncate max-w-full px-0.5 ${
                isActive ? 'font-bold' : ''
              }`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
