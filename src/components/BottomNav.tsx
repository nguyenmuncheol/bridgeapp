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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-lg">
      <div className="max-w-lg mx-auto flex items-stretch">
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
              <span className={`text-[10px] leading-none font-medium truncate max-w-full px-0.5 ${
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
