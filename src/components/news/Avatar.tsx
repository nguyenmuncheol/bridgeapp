'use client'

import { useState } from 'react'
import { UserProfile, getInitials } from '../../lib/mockData'
import { isChurchAuthor, CHURCH_AVATAR_URL, CHURCH_AUTHOR_NAME } from '../../lib/churchIdentity'
import ProfileImageLightbox from '../ProfileImageLightbox'

interface AvatarProps {
  allUsers: UserProfile[]
  authorId: string
  authorName: string
  /**
   * 사진 주소를 이미 알고 있으면 직접 넘겨주세요(생일 리스트의 자녀 항목 등).
   * 자녀(부양가족)는 `dep_xxx` 형태의 가상 id를 쓰기 때문에 allUsers(실제 계정 목록)에서
   * id로 찾을 수 없어, 넘겨주지 않으면 사진을 올려도 항상 이니셜만 표시됐습니다.
   */
  avatarUrl?: string
  size?: string
}

// 작성자/성도 아바타 렌더러 (교우소식 · 생일 리스트 공용)
export default function Avatar({ allUsers, authorId, authorName, avatarUrl, size = 'w-8 h-8 text-2xs' }: AvatarProps) {
  const [showLightbox, setShowLightbox] = useState(false)

  // ── 교회 공식 명의: 교회 로고를 직접 렌더링합니다.
  if (isChurchAuthor(authorId, authorName)) {
    return (
      <>
        <div
          onClick={(e) => { e.stopPropagation(); setShowLightbox(true) }}
          className={`${size} rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden border border-gray-200 cursor-pointer`}
          title={CHURCH_AUTHOR_NAME}
        >
          <img src={CHURCH_AVATAR_URL} alt={CHURCH_AUTHOR_NAME} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        </div>
        {showLightbox && (
          <ProfileImageLightbox src={CHURCH_AVATAR_URL} alt={CHURCH_AUTHOR_NAME} onClose={() => setShowLightbox(false)} />
        )}
      </>
    )
  }

  // authorId가 있으면 id로만 찾습니다. 이름으로 찾으면 댓글에 저장된 이름이
  // "김목사 목사님"처럼 직분이 붙어 있어 프로필 이름("김목사")과 매칭되지 않고,
  // 동명이인이 있을 때 엉뚱한 사람 사진이 뜰 수도 있습니다.
  const user = authorId
    ? allUsers.find(u => u.id === authorId)
    : allUsers.find(u => u.name === authorName)

  // avatarUrl prop이 오면 그걸 우선 사용합니다(항상 최신 값을 들고 있는 쪽).
  // 없을 때만 allUsers에서 id로 찾은 값으로 대체합니다.
  const resolvedAvatarUrl = avatarUrl || user?.avatarUrl

  return (
    <>
      <div
        onClick={resolvedAvatarUrl ? (e) => { e.stopPropagation(); setShowLightbox(true) } : undefined}
        className={`${size} rounded-full bg-brand text-white flex items-center justify-center font-bold shrink-0 overflow-hidden ${resolvedAvatarUrl ? 'cursor-pointer' : ''}`}
      >
        {resolvedAvatarUrl ? (
          <img src={resolvedAvatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          getInitials(authorName)
        )}
      </div>
      {showLightbox && resolvedAvatarUrl && (
        <ProfileImageLightbox src={resolvedAvatarUrl} alt={authorName} onClose={() => setShowLightbox(false)} />
      )}
    </>
  )
}
