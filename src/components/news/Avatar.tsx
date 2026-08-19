'use client'

import { UserProfile } from '../../lib/mockData'

interface AvatarProps {
  allUsers: UserProfile[]
  authorId: string
  authorName: string
  size?: string
}

// 작성자/성도 아바타 렌더러 (교우소식 · 생일 리스트 공용)
export default function Avatar({ allUsers, authorId, authorName, size = 'w-6 h-6 text-[10px]' }: AvatarProps) {
  // authorId가 있으면 id로만 찾습니다. 이름으로 찾으면 댓글에 저장된 이름이
  // "김목사 목사님"처럼 직분이 붙어 있어 프로필 이름("김목사")과 매칭되지 않고,
  // 동명이인이 있을 때 엉뚱한 사람 사진이 뜰 수도 있습니다.
  const user = authorId
    ? allUsers.find(u => u.id === authorId)
    : allUsers.find(u => u.name === authorName)
  return (
    <div className={`${size} rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        (authorName || '성').slice(0, 1)
      )}
    </div>
  )
}
