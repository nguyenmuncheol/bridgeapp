'use client'

import { memo } from 'react'
import { Heart, Lock, Trash2, Pin, CheckCircle2, Edit2 } from 'lucide-react'
import { PostItem, UserProfile } from '../../lib/mockData'
import CommentList from '../CommentList'
import Avatar from '../news/Avatar'

interface PrayerCardProps {
  prayer: PostItem
  currentUser: UserProfile
  allUsers: UserProfile[]
  isAdmin: boolean
  onAmen: (id: string, current: { likes: number; likedUserIds: string[] }) => void
  onPin: (id: string) => void
  onEdit: (prayer: PostItem) => void
  onDelete: (id: string) => void
  onAddComment: (id: string, text: string) => void
  /** 댓글이 수정/삭제되면 목록을 갱신하도록 부모에게 알립니다 (nextContent가 null이면 삭제) */
  onCommentChanged: (postId: string, commentId: string, nextContent: string | null) => void
  onError?: (msg: string) => void
}

// 기도제목 카드 한 장. React.memo로 감싸고, 댓글 입력값을 이 컴포넌트 내부(로컬 상태)에만 둬서
// 댓글 입력창에 타이핑할 때 다른 카드들까지 함께 리렌더링되지 않도록 합니다.
// (예전에는 입력값이 PrayerBoard 하나가 통째로 들고 있어서, 한 글자 칠 때마다 전체 목록이
// 다시 그려졌습니다. 카드마다 독립적인 로컬 상태로 분리하면 그 카드만 다시 그려집니다.)
function PrayerCardImpl({ prayer, currentUser, allUsers, isAdmin, onAmen, onPin, onEdit, onDelete, onAddComment, onCommentChanged, onError }: PrayerCardProps) {
  const canViewSecret = !prayer.isSecret || prayer.authorId === currentUser.id || isAdmin || currentUser.role === 'LEADER'
  const canPin = isAdmin || currentUser.role === 'LEADER'

  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-3 transition-all ${
      prayer.isPinned
        ? 'border-amber-300/80 bg-amber-50/20 shadow-xs'
        : prayer.isCompleted
          ? 'bg-gray-50/70 border-gray-100 opacity-80'
          : 'border-blue-50'
    }`}>
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 flex-wrap">
          <Avatar allUsers={allUsers} authorId={prayer.authorId} authorName={prayer.authorName} size="w-8 h-8 text-2xs" />
          <span className="font-bold text-xs text-gray-900">{prayer.authorName}</span>
          {prayer.isPinned && (
            <span className="text-2xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 border border-amber-200">
              <Pin size={10} className="fill-amber-700 text-amber-700" /> 고정됨
            </span>
          )}
          {prayer.isSecret && (
            <span className="text-2xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
              <Lock size={10} /> 비밀글
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {canPin && (
            <button
              onClick={() => onPin(prayer.id)}
              className={`p-1.5 rounded-lg hover:bg-amber-50 transition-all ${prayer.isPinned ? 'text-amber-600 font-bold bg-amber-50' : 'text-gray-300 hover:text-amber-500'}`}
              title={prayer.isPinned ? "상단 고정 해제" : "상단 고정"}
              aria-label={prayer.isPinned ? "상단 고정 해제" : "상단 고정"}
            >
              <Pin size={14} className={prayer.isPinned ? 'fill-amber-600 text-amber-600' : ''} />
            </button>
          )}
          {(prayer.authorId === currentUser.id || isAdmin) && (
            <>
              <button onClick={() => onEdit(prayer)} className="p-1 text-gray-400 hover:text-blue-600" title="수정">
                <Edit2 size={13} />
              </button>
              <button onClick={() => onDelete(prayer.id)} className="p-1 text-gray-400 hover:text-rose-500" title="삭제">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      {canViewSecret ? (
        <>
          <div className="space-y-1">
            <h3 className="font-bold text-sm leading-snug text-gray-900">{prayer.title}</h3>
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{prayer.content}</p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs">
            <span className="text-2xs text-gray-400">{prayer.createdAt}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onAmen(prayer.id, { likes: prayer.likes, likedUserIds: prayer.likedUserIds || [] })} className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-2xs font-bold rounded-lg flex items-center gap-1">
                <Heart size={12} className="fill-amber-500 text-amber-500" /> 아멘 ({prayer.likes})
              </button>
              {prayer.isCompleted && <span className="text-2xs bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5"><CheckCircle2 size={10} /> 응답 완료</span>}
            </div>
          </div>
          {/* 댓글은 기도제목·교우소식·찬양나눔이 같은 부품(CommentList)을 씁니다.
              수정/삭제 버튼도 여기에 들어 있습니다. */}
          <CommentList
            postId={prayer.id}
            comments={prayer.comments || []}
            currentUser={currentUser}
            allUsers={allUsers}
            isAdmin={isAdmin}
            onAddComment={onAddComment}
            onCommentChanged={onCommentChanged}
            onError={onError}
            placeholder="함께 기도하는 마음(댓글)을 나누세요..."
          />
        </>
      ) : (
        <div className="flex items-center gap-2 py-3 px-1 text-gray-400 text-xs bg-gray-50/70 rounded-xl justify-center">
          <Lock size={13} /> 비밀글입니다. 작성자 본인과 목회자/리더만 열람할 수 있습니다.
        </div>
      )}
    </div>
  )
}

export default memo(PrayerCardImpl)
