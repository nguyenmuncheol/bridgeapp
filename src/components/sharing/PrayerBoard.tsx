'use client'

import { useState, useCallback, Dispatch, SetStateAction } from 'react'
import { X } from 'lucide-react'
import { PostItem, UserProfile } from '../../lib/mockData'
import { dbUpdatePost, dbDeletePost, dbAddComment, dbTogglePostLike } from '../../lib/db'
import { getUserDisplayName } from '../../lib/mockData'
import { SkeletonList } from '../SkeletonCard'
import PrayerCard from './PrayerCard'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'

// 고정글 우선, 그 다음 미완료(기도 중)를 완료보다 위로 정렬 (최신 작성순 유지)
export const sortPrayers = (list: PostItem[]) =>
  [...list].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    if (!a.isCompleted && b.isCompleted) return -1
    if (a.isCompleted && !b.isCompleted) return 1
    if (a.createdAt && b.createdAt) {
      return b.createdAt.localeCompare(a.createdAt)
    }
    return 0
  })

interface PrayerBoardProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  isAdmin: boolean
  prayers: PostItem[]
  setPrayers: Dispatch<SetStateAction<PostItem[]>>
  // "더보기" 페이지네이션 — 전체를 한 번에 불러오지 않고 20개씩 이어서 불러옵니다(SharingTab이 관리).
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  error?: string | null
  onRetry?: () => void
}

// ── 기도제목 게시판 (아멘/고정/댓글/비밀글/수정/삭제) ──
export default function PrayerBoard({ currentUser, allUsers, isAdmin, prayers, setPrayers, isLoading, isLoadingMore, hasMore, onLoadMore, error, onRetry }: PrayerBoardProps) {
  const [editingPrayer, setEditingPrayer] = useState<PostItem | null>(null)
  useModalDismiss(!!editingPrayer, () => setEditingPrayer(null))
  const [editPrayerTitle, setEditPrayerTitle] = useState('')
  const [editPrayerContent, setEditPrayerContent] = useState('')
  const [editPrayerIsSecret, setEditPrayerIsSecret] = useState(false)
  const [editPrayerIsCompleted, setEditPrayerIsCompleted] = useState(false)

  const canPin = isAdmin || currentUser.role === 'LEADER'

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // 🐛 과거 버그 2가지를 함께 고칩니다.
  // ① 부모가 매 렌더마다 새 함수를 만들어 자식(PrayerCard)에 넘기는 바람에
  //    React.memo가 무력화되어, 아멘 한 번에 목록 전체가 다시 그려졌습니다.
  //    → useCallback으로 함수 정체성을 고정합니다.
  // ② 화면의 값을 읽어 계산 후 통째로 덮어써서, 여러 명이 동시에 누르면 유실됐습니다.
  //    → 서버에서 처리(dbTogglePostLike)하고, 안 되면 기존 방식으로 대체합니다.
  // 🐛 저장이 안 되던 진짜 원인 (행사사진은 되는데 여기만 안 되던 이유):
  //    예전 코드는 "지금 몇 개인지"를 setState 콜백 **안에서** 꺼내 쓰려 했습니다.
  //    그런데 React는 그 콜백을 즉시 실행해준다고 보장하지 않습니다(나중에 실행될 수 있음).
  //    그래서 바로 다음 줄에서 값을 읽으면 대개 비어 있었고, `if (!before) return` 에 걸려
  //    **서버로 저장 요청을 아예 보내지 않고 끝났습니다.** 화면만 바뀌니 된 것처럼 보였습니다.
  //    (행사사진은 목록에서 직접 값을 읽어 써서 이 문제가 없었습니다)
  // → 카드가 이미 들고 있는 현재 값을 그대로 넘겨받아 씁니다. 추측이 필요 없습니다.
  const handleAmen = useCallback(async (
    id: string,
    current: { likes: number; likedUserIds: string[] }
  ) => {
    const before = { likes: current.likes, likedUserIds: current.likedUserIds || [] }
    const isLiked = before.likedUserIds.includes(currentUser.id)
    const guessedLikes = isLiked ? Math.max(0, before.likes - 1) : before.likes + 1
    const guessedUsers = isLiked
      ? before.likedUserIds.filter(uid => uid !== currentUser.id)
      : [...before.likedUserIds, currentUser.id]

    const apply = (likes: number, ids: string[]) =>
      setPrayers(prev => prev.map(p => (p.id === id ? { ...p, likes, likedUserIds: ids } : p)))

    apply(guessedLikes, guessedUsers)   // 먼저 화면에 반영 (빠른 반응)

    const res = await dbTogglePostLike(id, currentUser.id, before)
    if (res.error) {
      apply(before.likes, before.likedUserIds)   // 실패하면 되돌립니다
      showToast('아멘이 저장되지 않았습니다. 잠시 후 다시 눌러 주세요.', true)
      return
    }
    // 서버가 알려준 최종 값으로 맞춥니다(다른 사람이 동시에 눌렀을 수 있으므로)
    if (res.likes !== guessedLikes || res.likedUserIds.length !== guessedUsers.length) {
      apply(res.likes, res.likedUserIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, setPrayers])

  const handlePin = useCallback(async (id: string) => {
    if (!canPin) return
    let newPin: boolean | null = null
    setPrayers(prev => prev.map(p => {
      if (p.id !== id) return p
      newPin = !p.isPinned
      return { ...p, isPinned: newPin }
    }))
    if (newPin === null) return
    const { error } = await dbUpdatePost(id, { isPinned: newPin })
    if (error) {
      setPrayers(prev => prev.map(p => p.id === id ? { ...p, isPinned: !newPin } : p))
      showToast('고정 처리 중 오류가 발생했습니다.', true)
    } else {
      showToast(newPin ? '📌 기도제목이 상단에 고정되었습니다.' : '📌 상단 고정이 해제되었습니다.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPin, setPrayers])

  // 댓글이 수정되거나(내용) 삭제되면(null) 화면 목록도 같이 맞춰줍니다.
  // 이걸 안 하면 다른 탭에 갔다 돌아왔을 때 지운 댓글이 다시 보입니다.
  const handleCommentChanged = useCallback((postId: string, commentId: string, nextContent: string | null) => {
    setPrayers(prev => prev.map(p => {
      if (p.id !== postId) return p
      const comments = (p.comments || [])
      return {
        ...p,
        comments: nextContent === null
          ? comments.filter(c => c.id !== commentId)
          : comments.map(c => (c.id === commentId ? { ...c, content: nextContent } : c)),
      }
    }))
  }, [setPrayers])

  const handleAddComment = useCallback(async (prayerId: string, text: string) => {
    const tempId = `c_${Date.now()}`
    setPrayers(prev => prev.map(p => p.id === prayerId ? {
      ...p,
      // authorId를 함께 저장해야 댓글 옆에 작성자 프로필 사진이 뜹니다.
      // (이전에는 이름으로만 찾았는데, 댓글엔 "김목사 목사님", 프로필엔 "김목사"라 매칭 실패)
      comments: [...(p.comments || []), { id: tempId, authorId: currentUser.id, authorName: getUserDisplayName(currentUser), content: text, createdAt: '방금 전' }]
    } : p))
    try {
      const { error, id, createdAt } = await dbAddComment(prayerId, currentUser.id, getUserDisplayName(currentUser), text)
      if (error) throw error
      // 🐛 저장에 성공하면 **임시 번호를 진짜 번호로 갈아끼웁니다.**
      // 이걸 안 하면 방금 쓴 댓글을 바로 수정·삭제할 때 서버가 그 댓글을 못 찾습니다.
      if (id) {
        setPrayers(prev => prev.map(p => p.id === prayerId ? {
          ...p,
          comments: (p.comments || []).map(c => (c.id === tempId ? { ...c, id, createdAt: createdAt || c.createdAt } : c))
        } : p))
      }
    } catch {
      setPrayers(prev => prev.map(p => p.id === prayerId ? {
        ...p,
        comments: (p.comments || []).filter(c => c.id !== tempId)
      } : p))
      showToast('댓글 등록 중 오류가 발생했습니다.', true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, setPrayers])

  const handleDeletePrayer = useCallback(async (id: string) => {
    // 🐛 과거 버그: "정말 삭제하시겠습니까?"만 뜨고 어떤 글인지 안 알려줬으며,
    // 삭제가 실패해도 화면에서는 사라졌습니다(다른 성도 화면에는 그대로 남음).
    let title = '이 기도제목'
    setPrayers(prev => { const t = prev.find(x => x.id === id); if (t?.title) title = `'${t.title}'` ; return prev })
    if (!confirm(`${title} 을(를) 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return

    const { error } = await dbDeletePost(id)
    if (error) {
      showToast('삭제하지 못했습니다. 다시 시도해 주세요.', true)
      return
    }
    setPrayers(p => p.filter(x => x.id !== id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPrayers])

  const openEditModal = useCallback((prayer: PostItem) => {
    setEditingPrayer(prayer)
    setEditPrayerTitle(prayer.title)
    setEditPrayerContent(prayer.content)
    setEditPrayerIsSecret(!!prayer.isSecret)
    setEditPrayerIsCompleted(!!prayer.isCompleted)
  }, [])

  // ── 기도제목 수정 저장 ──
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const handleSavePrayerEdit = async () => {
    if (!editingPrayer || isSavingEdit) return
    // 🐛 과거 버그: 제목/내용을 비운 채 저장하면 그대로 빈 글이 됐고,
    // 저장 실패도 확인하지 않아 화면만 바뀌었습니다.
    if (!editPrayerTitle.trim() || !editPrayerContent.trim()) {
      showToast('제목과 내용을 모두 입력해 주세요.', true)
      return
    }
    setIsSavingEdit(true)
    const { error } = await dbUpdatePost(editingPrayer.id, {
      title: editPrayerTitle.trim(),
      content: editPrayerContent.trim(),
      isSecret: editPrayerIsSecret,
      isCompleted: editPrayerIsCompleted
    })
    setIsSavingEdit(false)
    if (error) {
      showToast('저장하지 못했습니다. 다시 시도해 주세요.', true)
      return
    }
    setPrayers(prev => prev.map(p => p.id === editingPrayer.id
      ? { ...p, title: editPrayerTitle.trim(), content: editPrayerContent.trim(), isSecret: editPrayerIsSecret, isCompleted: editPrayerIsCompleted }
      : p
    ))
    setEditingPrayer(null)
  }

  return (
    <div className="space-y-3">
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* 불러오기 실패는 "글이 없음"과 반드시 구분해서 보여줍니다 */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">📡</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">목록을 불러오지 못했습니다</p>
            <p className="text-2xs text-amber-700 mt-0.5">인터넷 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          {onRetry && (
            <button onClick={onRetry} className="px-2.5 py-1.5 bg-amber-600 text-white text-2xs font-bold rounded-lg shrink-0">다시 시도</button>
          )}
        </div>
      )}

      {isLoading && <SkeletonList count={3} />}
      {!isLoading && !error && prayers.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-400">아직 등록된 기도제목이 없습니다.</div>
      )}

      {prayers.map(prayer => (
        <PrayerCard
          key={prayer.id}
          prayer={prayer}
          currentUser={currentUser}
          allUsers={allUsers}
          isAdmin={isAdmin}
          onAmen={handleAmen}
          onPin={handlePin}
          onEdit={openEditModal}
          onDelete={handleDeletePrayer}
          onAddComment={handleAddComment}
          onCommentChanged={handleCommentChanged}
          onError={msg => showToast(msg, true)}
        />
      ))}

      {/* ── 더보기 버튼: 전체를 한 번에 불러오지 않고 20개씩 이어서 로드 ── */}
      {!isLoading && hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="w-full py-2.5 bg-white border border-gray-200 text-gray-500 text-xs font-bold rounded-xl shadow-2xs hover:bg-gray-50 disabled:opacity-50"
        >
          {isLoadingMore ? '불러오는 중...' : '더보기'}
        </button>
      )}

      {/* ── 기도제목 수정 모달 ── */}
      {editingPrayer && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overscroll-contain"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full h-[88vh] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden overscroll-contain">
            {/* 상단 고정 헤더 */}
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100 bg-gray-50/80 shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-gray-900">✏️ 기도제목 수정</h3>
              <button
                type="button"
                onClick={() => setEditingPrayer(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-all font-bold text-base cursor-pointer"
                title="닫기"
              >
                ✕
              </button>
            </div>

            {/* 본문 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain touch-pan-y">
              <div>
                <label className="block text-2xs font-bold text-gray-500 mb-1">제목</label>
                <input
                  type="text"
                  value={editPrayerTitle}
                  onChange={e => setEditPrayerTitle(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                  placeholder="기도제목"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-2xs font-bold text-gray-500 mb-1">내용</label>
                <textarea
                  rows={10}
                  value={editPrayerContent}
                  onChange={e => setEditPrayerContent(e.target.value)}
                  className="w-full min-h-[220px] sm:min-h-[280px] text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] resize-y text-gray-900 font-medium leading-relaxed"
                  placeholder="내용"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-600 font-medium bg-purple-50/50 p-2.5 rounded-xl border border-purple-100/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPrayerIsSecret}
                  onChange={e => setEditPrayerIsSecret(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
                <span>🔒 비밀글로 등록 (목회자/리더만 열람)</span>
              </label>

              {/* 작성자 / 관리자 전용 응답 완료 처리 버튼 */}
              {(editingPrayer.authorId === currentUser.id || isAdmin) && (
                <div className="flex items-center justify-between p-3.5 bg-amber-50/80 rounded-2xl border border-amber-100 text-xs">
                  <div>
                    <p className="font-bold text-amber-900 text-xs">기도 응답 상태</p>
                    <p className="text-2xs text-amber-700 mt-0.5">
                      {editPrayerIsCompleted ? '현재 응답 완료 상태입니다' : '현재 기도 중 상태입니다'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditPrayerIsCompleted(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                      editPrayerIsCompleted
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {editPrayerIsCompleted ? '✅ 응답 완료됨' : '🙏 응답 완료로 변경'}
                  </button>
                </div>
              )}
            </div>

            {/* 하단 고정 버튼 */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingPrayer(null)}
                className="flex-1 py-3 bg-gray-200/80 hover:bg-gray-300/80 text-gray-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSavePrayerEdit}
                className="flex-1 py-3 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSavingEdit ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
