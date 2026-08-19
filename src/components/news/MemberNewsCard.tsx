'use client'

import { memo, useState } from 'react'
import { Heart, Edit2, Trash2 } from 'lucide-react'
import { UserProfile, PostItem } from '../../lib/mockData'
import Avatar from './Avatar'

interface MemberNewsCardProps {
  item: PostItem
  currentUser: UserProfile
  allUsers: UserProfile[]
  isLeaderOrAdmin: boolean
  onLike: (id: string) => void
  onEdit: (item: PostItem) => void
  onDelete: (id: string) => void
  onAddComment: (id: string, text: string) => void
}

// 교우소식 카드 한 장. React.memo + 댓글 입력값을 로컬 상태로 분리해서,
// 댓글 입력 중 다른 카드들까지 함께 리렌더링되는 걸 막습니다(PrayerCard와 동일한 패턴).
function MemberNewsCardImpl({ item, currentUser, allUsers, isLeaderOrAdmin, onLike, onEdit, onDelete, onAddComment }: MemberNewsCardProps) {
  const [commentText, setCommentText] = useState('')

  const submitComment = () => {
    const text = commentText.trim()
    if (!text) return
    onAddComment(item.id, text)
    setCommentText('')
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-50 p-4 shadow-2xs space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <Avatar allUsers={allUsers} authorId={item.authorId} authorName={item.authorName} size="w-6 h-6 text-[10px]" />
          <span className="font-bold text-xs text-gray-900">{item.authorName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">{item.createdAt}</span>
          {(item.authorId === currentUser.id || isLeaderOrAdmin) && (
            <>
              <button onClick={() => onEdit(item)} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="수정">
                <Edit2 size={12} />
              </button>
              <button onClick={() => onDelete(item.id)} className="p-1 text-gray-400 hover:text-rose-500 rounded" title="삭제">
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="font-bold text-sm text-gray-900 leading-snug">{item.title}</h3>
        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{item.content}</p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs">
        <button
          onClick={() => onLike(item.id)}
          className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
            (item.likedUserIds || []).includes(currentUser.id)
              ? 'bg-rose-100 text-rose-700'
              : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
          }`}
        >
          <Heart size={12} className={(item.likedUserIds || []).includes(currentUser.id) ? 'fill-rose-600' : ''} />
          축하/응원 ({item.likes})
        </button>
      </div>

      {item.comments && item.comments.length > 0 && (
        <div className="bg-gray-50 p-2.5 rounded-xl space-y-1.5 text-xs">
          {item.comments.map(c => (
            <div key={c.id} className="flex justify-between items-start text-[11px]">
              <div className="flex items-center gap-1.5 flex-1">
                <Avatar allUsers={allUsers} authorId={c.authorId || ''} authorName={c.authorName} size="w-4 h-4 text-[8px]" />
                <span className="font-bold text-gray-800 shrink-0">{c.authorName}:</span>
                <span className="text-gray-600 ml-1">{c.content}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 pt-1">
        <input
          type="text"
          placeholder="축하와 응원의 한마디를 나누세요..."
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitComment()}
          className="flex-1 text-xs p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none text-gray-900 font-medium"
        />
        <button onClick={submitComment} className="px-3 py-1 bg-[#335f87] text-white text-xs font-bold rounded-lg">등록</button>
      </div>
    </div>
  )
}

export default memo(MemberNewsCardImpl)
