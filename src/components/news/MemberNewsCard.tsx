'use client'

import { memo } from 'react'
import { Heart, Edit2, Trash2 } from 'lucide-react'
import { UserProfile, PostItem } from '../../lib/mockData'
import Avatar from './Avatar'
import CommentList from '../CommentList'

interface MemberNewsCardProps {
  item: PostItem
  currentUser: UserProfile
  allUsers: UserProfile[]
  isAdmin: boolean
  onLike: (id: string, current: { likes: number; likedUserIds: string[] }) => void
  onEdit: (item: PostItem) => void
  onDelete: (id: string) => void
  onAddComment: (id: string, text: string) => void
  /** 댓글이 수정/삭제되면 목록을 갱신하도록 부모에게 알립니다 (nextContent가 null이면 삭제) */
  onCommentChanged: (postId: string, commentId: string, nextContent: string | null) => void
  onError?: (msg: string) => void
}

// 교우소식 카드 한 장. React.memo + 댓글 입력값을 로컬 상태로 분리해서,
// 댓글 입력 중 다른 카드들까지 함께 리렌더링되는 걸 막습니다(PrayerCard와 동일한 패턴).
function MemberNewsCardImpl({ item, currentUser, allUsers, isAdmin, onLike, onEdit, onDelete, onAddComment, onCommentChanged, onError }: MemberNewsCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-blue-50 p-4 shadow-2xs space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <Avatar allUsers={allUsers} authorId={item.authorId} authorName={item.authorName} size="w-6 h-6 text-2xs" />
          <span className="font-bold text-xs text-gray-900">{item.authorName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-gray-400">{item.createdAt}</span>
          {(item.authorId === currentUser.id || isAdmin) && (
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
          onClick={() => onLike(item.id, { likes: item.likes, likedUserIds: item.likedUserIds || [] })}
          className={`px-3 py-1 text-2xs font-bold rounded-lg transition-all flex items-center gap-1 ${
            (item.likedUserIds || []).includes(currentUser.id)
              ? 'bg-rose-100 text-rose-700'
              : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
          }`}
        >
          <Heart size={12} className={(item.likedUserIds || []).includes(currentUser.id) ? 'fill-rose-600' : ''} />
          축하/응원 ({item.likes})
        </button>
      </div>

      {/* 댓글은 기도제목·찬양나눔과 같은 부품(CommentList)을 씁니다 — 수정/삭제 포함 */}
      <CommentList
        postId={item.id}
        comments={item.comments || []}
        currentUser={currentUser}
        allUsers={allUsers}
        isAdmin={isAdmin}
        onAddComment={onAddComment}
        onCommentChanged={onCommentChanged}
        onError={onError}
        placeholder="축하와 응원의 한마디를 나누세요..."
      />
    </div>
  )
}

export default memo(MemberNewsCardImpl)
