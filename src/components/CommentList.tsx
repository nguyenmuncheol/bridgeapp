'use client'

import { useState } from 'react'
import { CommentItem, UserProfile, getInitials } from '../lib/mockData'
import { dbUpdateComment, dbDeleteComment } from '../lib/db'

interface CommentListProps {
  postId: string
  comments: CommentItem[]
  currentUser: UserProfile
  allUsers: UserProfile[]
  isAdmin: boolean
  /** 댓글 등록 (부모가 낙관적 UI + 저장을 처리) */
  onAddComment: (postId: string, text: string) => void
  /** 수정/삭제가 성공했을 때 화면 목록을 갱신하도록 부모에게 알립니다 */
  onCommentChanged: (postId: string, commentId: string, nextContent: string | null) => void
  /** 오류를 알릴 때 사용 (없으면 조용히 넘어갑니다) */
  onError?: (msg: string) => void
  placeholder?: string
}

/**
 * 댓글 목록 + 입력창 공용 부품 (기도제목 · 교우소식 · 찬양/묵상 나눔 공용).
 *
 * 🐛 과거 문제: 댓글을 한 번 달면 **고칠 수도 지울 수도 없었습니다.** 오타가 나도,
 * 잘못된 내용을 적어도 그대로 남았습니다. 서버에는 삭제 권한이 이미 열려 있었는데
 * 화면에 버튼이 없어서 못 쓰고 있었습니다.
 *
 * 권한 규칙 (서버 정책과 동일):
 *  - 수정: **작성자 본인만** (목사님도 남의 말을 바꿀 수는 없습니다 — 오해 방지)
 *  - 삭제: 작성자 본인 또는 목사(ADMIN)
 */
export default function CommentList({
  postId, comments, currentUser, allUsers, isAdmin,
  onAddComment, onCommentChanged, onError, placeholder,
}: CommentListProps) {
  const [commentText, setCommentText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const renderAvatar = (authorId: string, authorName: string) => {
    const user = allUsers.find(u => u.id === authorId || u.name === authorName)
    return (
      <span className="w-6 h-6 text-2xs rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden">
        {user?.avatarUrl
          ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          : getInitials(authorName)}
      </span>
    )
  }

  const submitComment = () => {
    const text = commentText.trim()
    if (!text) return
    onAddComment(postId, text)
    setCommentText('')
  }

  const startEdit = (c: CommentItem) => {
    setEditingId(c.id)
    setEditingText(c.content)
  }

  const saveEdit = async (c: CommentItem) => {
    const text = editingText.trim()
    if (!text) { onError?.('내용을 입력해 주세요.'); return }
    if (text === c.content) { setEditingId(null); return }
    setBusyId(c.id)
    const { error } = await dbUpdateComment(c.id, text)
    setBusyId(null)
    if (error) { onError?.('댓글을 수정하지 못했습니다.'); return }
    onCommentChanged(postId, c.id, text)
    setEditingId(null)
  }

  const removeComment = async (c: CommentItem) => {
    if (!confirm('이 댓글을 지울까요?\n지운 댓글은 되돌릴 수 없습니다.')) return
    setBusyId(c.id)
    const { error } = await dbDeleteComment(c.id)
    setBusyId(null)
    if (error) { onError?.('댓글을 지우지 못했습니다.'); return }
    onCommentChanged(postId, c.id, null)
  }

  return (
    <>
      {comments && comments.length > 0 && (
        <div className="bg-gray-50 p-2.5 rounded-xl space-y-2 text-xs">
          {comments.map(c => {
            const isMine = !!c.authorId && c.authorId === currentUser.id
            const canEdit = isMine                 // 수정은 본인만
            const canDelete = isMine || isAdmin    // 삭제는 본인 또는 목사
            const isEditing = editingId === c.id
            const busy = busyId === c.id

            return (
              <div key={c.id} className="text-2xs">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      rows={2}
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      className="w-full text-2xs p-2 bg-white rounded-lg border border-gray-200 focus:outline-none resize-none text-gray-900"
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 bg-gray-100 text-gray-600 font-bold rounded-lg"
                      >취소</button>
                      <button
                        onClick={() => saveEdit(c)}
                        disabled={busy}
                        className="px-2.5 py-1 bg-[#335f87] text-white font-bold rounded-lg disabled:opacity-50"
                      >{busy ? '저장 중...' : '저장'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* 🐛 과거 문제: 이름·내용과 [날짜·수정·삭제]가 **같은 줄을 나눠 써서**
                        이름이나 내용이 길면 오른쪽 버튼이 잘렸습니다.
                        → 첫 줄에 [아바타·이름 | 날짜·수정·삭제], 둘째 줄에 내용을 폭 전체로. */}
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {renderAvatar(c.authorId || '', c.authorName)}
                        <span className="font-bold text-gray-800 truncate">{c.authorName}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-2xs text-gray-400">{c.createdAt}</span>
                        {/* 버튼 사이를 띄우고 탭 영역을 키워, 수정하려다 삭제를 누르는 사고를 줄였습니다 */}
                        {canEdit && (
                          <button
                            onClick={() => startEdit(c)}
                            disabled={busy}
                            aria-label="댓글 수정"
                            className="px-1.5 py-1 -my-1 text-gray-400 hover:text-blue-600 disabled:opacity-40"
                          >수정</button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => removeComment(c)}
                            disabled={busy}
                            aria-label="댓글 삭제"
                            className="px-1.5 py-1 -my-1 text-gray-400 hover:text-rose-500 disabled:opacity-40"
                          >{busy ? '...' : '삭제'}</button>
                        )}
                      </div>
                    </div>
                    {/* 아바타(24px) + 간격(6px) = 30px 만큼 밀어, 윗줄 이름과 같은 위치에서 글이 시작합니다 */}
                    <p className="text-gray-600 break-words leading-relaxed pl-[30px]">{c.content}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-1.5 pt-1">
        <input
          type="text"
          placeholder={placeholder || '댓글을 남겨보세요...'}
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitComment()}
          className="flex-1 text-xs p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none text-gray-900 font-medium"
        />
        <button onClick={submitComment} className="px-3 py-1 bg-[#335f87] text-white text-xs font-bold rounded-lg">등록</button>
      </div>
    </>
  )
}
