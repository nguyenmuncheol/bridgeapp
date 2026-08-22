'use client'

import { useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { UserProfile, getUserDisplayName, PostItem } from '../../lib/mockData'
import { CHURCH_AUTHOR_ID, CHURCH_AUTHOR_NAME, CHURCH_AVATAR_URL } from '../../lib/churchIdentity'
import { dbCreatePost, dbUpdatePost, dbDeletePost, dbAddComment, dbTogglePostLike } from '../../lib/db'
import { usePaginatedPosts } from '../../lib/usePaginatedPosts'
import { todayLocalDateStr } from '../../lib/dateUtils'
import { SkeletonList } from '../SkeletonCard'
import MemberNewsCard from './MemberNewsCard'
import { useWriteModalGuard } from '../../lib/useModalDismiss'

interface MemberNewsBoardProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  isLeaderOrAdmin: boolean
}

// ── 교우소식 게시판 (작성/수정/삭제/좋아요/댓글) ──
export default function MemberNewsBoard({ currentUser, allUsers, isLeaderOrAdmin }: MemberNewsBoardProps) {
  const [showAddNewsModal, setShowAddNewsModal] = useState(false)
  const [newNewsTitle, setNewNewsTitle] = useState('')
  const [newNewsContent, setNewNewsContent] = useState('')
  const [editingNews, setEditingNews] = useState<PostItem | null>(null)
  const [editNewsTitle, setEditNewsTitle] = useState('')
  const [editNewsContent, setEditNewsContent] = useState('')
  const [postAsChurch, setPostAsChurch] = useState(false) // 교회 이름으로 올리기 (관리자 전용)

  const hasUnsavedAdd = Boolean(newNewsTitle.trim() || newNewsContent.trim())
  useWriteModalGuard(showAddNewsModal, hasUnsavedAdd, () => setShowAddNewsModal(false))

  const hasUnsavedEdit = Boolean(
    editingNews &&
    (editNewsTitle !== editingNews.title || editNewsContent !== editingNews.content)
  )
  useWriteModalGuard(Boolean(editingNews), hasUnsavedEdit, () => setEditingNews(null))

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // 전체를 한 번에 불러오지 않고 최근 글부터 20개씩 "더보기"로 이어서 불러옴
  const {
    items: memberNewsList,
    setItems: setMemberNewsList,
    isLoading: isNewsLoading,
    isLoadingMore: isNewsLoadingMore,
    hasMore: hasMoreNews,
    error: newsError,
    loadMore: loadMoreNews,
    retry: retryNews
  } = usePaginatedPosts('MEMBER_NEWS')

  // 교우소식 축하/좋아요 1인 1회 (DB 동기화)
  // useCallback으로 감싸야 자식(MemberNewsCard)의 React.memo가 실제로 동작합니다.
  // (매 렌더마다 새 함수를 넘기면 memo가 무력화되어 목록 전체가 다시 그려집니다)
  // 🐛 저장이 안 되던 진짜 원인 (행사사진은 되는데 여기만 안 되던 이유):
  //    예전 코드는 "지금 몇 개인지"를 setState 콜백 **안에서** 꺼내 쓰려 했습니다.
  //    그런데 React는 그 콜백을 즉시 실행해준다고 보장하지 않습니다(나중에 실행될 수 있음).
  //    그래서 바로 다음 줄에서 값을 읽으면 대개 비어 있었고, `if (!before) return` 에 걸려
  //    **서버로 저장 요청을 아예 보내지 않고 끝났습니다.** 화면만 바뀌니 된 것처럼 보였습니다.
  //    (행사사진은 목록에서 직접 값을 읽어 써서 이 문제가 없었습니다)
  // → 카드가 이미 들고 있는 현재 값을 그대로 넘겨받아 씁니다. 추측이 필요 없습니다.
  const handleNewsLike = useCallback(async (
    newsId: string,
    current: { likes: number; likedUserIds: string[] }
  ) => {
    const before = { likes: current.likes, likedUserIds: current.likedUserIds || [] }
    const isLiked = before.likedUserIds.includes(currentUser.id)
    const guessedLikes = isLiked ? Math.max(0, before.likes - 1) : before.likes + 1
    const guessedUsers = isLiked
      ? before.likedUserIds.filter(uid => uid !== currentUser.id)
      : [...before.likedUserIds, currentUser.id]

    const apply = (likes: number, ids: string[]) =>
      setMemberNewsList(prev => prev.map(n => (n.id === newsId ? { ...n, likes, likedUserIds: ids } : n)))

    apply(guessedLikes, guessedUsers)

    const res = await dbTogglePostLike(newsId, currentUser.id, before)
    if (res.error) {
      apply(before.likes, before.likedUserIds)
      showToast('축하/응원이 저장되지 않았습니다. 잠시 후 다시 눌러 주세요.', true)
      return
    }
    if (res.likes !== guessedLikes || res.likedUserIds.length !== guessedUsers.length) {
      apply(res.likes, res.likedUserIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, setMemberNewsList])

  // 교우소식 작성 (DB 동기화)
  const [isCreatingNews, setIsCreatingNews] = useState(false)
  const handleCreateNews = async () => {
    if (isCreatingNews) return
    // 🐛 과거 버그: 비어 있으면 아무 반응 없이 조용히 무시해서, 사용자는 버튼이
    // 고장난 줄 알고 계속 눌렀습니다.
    if (!newNewsTitle.trim() || !newNewsContent.trim()) {
      showToast('제목과 내용을 모두 입력해 주세요.', true)
      return
    }

    // 교회 이름으로 올리기 여부에 따라 저자 정보 결정
    const authorId   = postAsChurch ? CHURCH_AUTHOR_ID   : currentUser.id
    const authorName = postAsChurch ? CHURCH_AUTHOR_NAME : getUserDisplayName(currentUser)
    const authorAvatar = postAsChurch ? CHURCH_AVATAR_URL : undefined

    setIsCreatingNews(true)
    const res = await dbCreatePost({
      authorId,
      authorName,
      authorAvatar,
      title: newNewsTitle.trim(),
      content: newNewsContent.trim(),
      category: 'MEMBER_NEWS',
    })
    setIsCreatingNews(false)

    // 🐛 과거 버그: 저장 실패 시 임시 id(`mn_...`)를 붙여 목록에 얹었습니다. 화면에는
    // 정상 등록된 것처럼 보이지만 실제로는 아무도 못 보고, 새로고침하면 사라집니다.
    // (게다가 그 가짜 id에 아멘/댓글을 달면 또 다른 오류가 납니다)
    if (res.error || !res.data?.id) {
      showToast('등록하지 못했습니다. 인터넷 상태를 확인해 주세요.', true)
      return
    }

    const newItem: PostItem = {
      id: res.data.id,
      authorId,
      authorName,
      authorAvatar,
      title: newNewsTitle.trim(),
      content: newNewsContent.trim(),
      category: 'MEMBER_NEWS',
      createdAt: todayLocalDateStr(),
      likes: 0,
      comments: []
    }
    setMemberNewsList(prev => [newItem, ...prev])
    setNewNewsTitle('')
    setNewNewsContent('')
    setPostAsChurch(false)
    setShowAddNewsModal(false)
    showToast('소식을 등록했습니다.')
  }

  // 교우소식 댓글 등록 (DB 동기화)
  // 댓글이 수정되거나(내용) 삭제되면(null) 화면 목록도 맞춰줍니다.
  const handleCommentChanged = useCallback((postId: string, commentId: string, nextContent: string | null) => {
    setMemberNewsList(prev => prev.map(n => {
      if (n.id !== postId) return n
      const comments = n.comments || []
      return {
        ...n,
        comments: nextContent === null
          ? comments.filter(c => c.id !== commentId)
          : comments.map(c => (c.id === commentId ? { ...c, content: nextContent } : c)),
      }
    }))
  }, [setMemberNewsList])

  const handleAddNewsComment = useCallback(async (newsId: string, text: string) => {
    // 낙관적 UI: 먼저 화면에 추가
    const tempId = `c_${Date.now()}`
    setMemberNewsList(prev => prev.map(n => n.id === newsId ? {
      ...n,
      // authorId를 함께 넣어야 댓글에 작성자 프로필 사진이 뜹니다.
      comments: [...(n.comments || []), { id: tempId, authorId: currentUser.id, authorName: getUserDisplayName(currentUser), content: text, createdAt: '방금 전' }]
    } : n))
    try {
      const { error, id, createdAt } = await dbAddComment(newsId, currentUser.id, getUserDisplayName(currentUser), text)
      if (error) throw error
      // 🐛 저장에 성공하면 **임시 번호를 진짜 번호로 갈아끼웁니다.**
      // 이걸 안 하면 방금 쓴 댓글을 바로 수정·삭제할 때 서버가 그 댓글을 못 찾습니다.
      if (id) {
        setMemberNewsList(prev => prev.map(n => n.id === newsId ? {
          ...n,
          comments: (n.comments || []).map(c => (c.id === tempId ? { ...c, id, createdAt: createdAt || c.createdAt } : c))
        } : n))
      }
    } catch {
      // 실패 시 댓글 롤백
      setMemberNewsList(prev => prev.map(n => n.id === newsId ? {
        ...n,
        comments: (n.comments || []).filter(c => c.id !== tempId)
      } : n))
      showToast('댓글 등록 중 오류가 발생했습니다.', true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, setMemberNewsList])

  // 교우소식 수정 저장
  const handleSaveNewsEdit = async () => {
    if (!editingNews) return
    const { error } = await dbUpdatePost(editingNews.id, {
      title: editNewsTitle.trim(),
      content: editNewsContent.trim()
    })
    if (error) {
      showToast('저장 중 오류가 발생했습니다. 다시 시도해 주세요.', true)
      return
    }
    setMemberNewsList(prev => prev.map(n => n.id === editingNews.id
      ? { ...n, title: editNewsTitle.trim(), content: editNewsContent.trim() }
      : n
    ))
    setEditingNews(null)
  }

  // 교우소식 삭제
  const handleDeleteNews = useCallback(async (newsId: string) => {
    let title = '이 소식'
    setMemberNewsList(prev => { const t = prev.find(n => n.id === newsId); if (t?.title) title = `'${t.title}'`; return prev })
    if (!confirm(`${title} 을(를) 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return

    // 🐛 과거 버그: 삭제 실패를 확인하지 않아, 화면에서만 사라지고 다른 성도 화면에는 남았습니다.
    const { error } = await dbDeletePost(newsId)
    if (error) {
      showToast('삭제하지 못했습니다. 다시 시도해 주세요.', true)
      return
    }
    setMemberNewsList(prev => prev.filter(n => n.id !== newsId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMemberNewsList])

  const openEditModal = useCallback((item: PostItem) => {
    setEditingNews(item)
    setEditNewsTitle(item.title)
    setEditNewsContent(item.content)
  }, [])

  return (
    <div className="space-y-3">
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500 font-semibold">더브릿지 가족 News</span>
        <button
          onClick={() => setShowAddNewsModal(true)}
          className="px-2.5 py-1 bg-[#335f87] text-white text-2xs font-bold rounded-lg hover:bg-[#2b5072] flex items-center gap-1"
        ><Plus size={12} /> 소식 나누기</button>
      </div>

      {newsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">📡</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">소식을 불러오지 못했습니다</p>
            <p className="text-2xs text-amber-700 mt-0.5">인터넷 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          <button onClick={retryNews} className="px-2.5 py-1.5 bg-amber-600 text-white text-2xs font-bold rounded-lg shrink-0">다시 시도</button>
        </div>
      )}
      {isNewsLoading && <SkeletonList count={3} />}
      {!isNewsLoading && !newsError && memberNewsList.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-400">아직 등록된 소식이 없습니다.</div>
      )}

      {memberNewsList.map(item => (
        <MemberNewsCard
          key={item.id}
          item={item}
          currentUser={currentUser}
          allUsers={allUsers}
          isLeaderOrAdmin={isLeaderOrAdmin}
          onLike={handleNewsLike}
          onEdit={openEditModal}
          onDelete={handleDeleteNews}
          onAddComment={handleAddNewsComment}
          onCommentChanged={handleCommentChanged}
          onError={msg => showToast(msg, true)}
        />
      ))}

      {/* ── 더보기 버튼: 전체를 한 번에 불러오지 않고 20개씩 이어서 로드 ── */}
      {!isNewsLoading && hasMoreNews && (
        <button
          onClick={loadMoreNews}
          disabled={isNewsLoadingMore}
          className="w-full py-2.5 bg-white border border-gray-200 text-gray-500 text-xs font-bold rounded-xl shadow-2xs hover:bg-gray-50 disabled:opacity-50"
        >
          {isNewsLoadingMore ? '불러오는 중...' : '더보기'}
        </button>
      )}

      {/* ── 교우소식 작성 모달 ── */}
      {showAddNewsModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overscroll-contain"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden overscroll-contain">
            {/* 상단 고정 헤더 */}
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100 bg-gray-50/80 shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-gray-900">📣 교우소식 작성</h3>
              <button
                type="button"
                onClick={() => {
                  if (hasUnsavedAdd) {
                    if (!confirm('작성 중인 내용이 있습니다. 정말 창을 닫으시겠습니까?')) return
                  }
                  setShowAddNewsModal(false)
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-all font-bold text-base cursor-pointer"
                title="닫기"
              >
                ✕
              </button>
            </div>

            {/* ── 관리자 전용: 교회 이름으로 올리기 토글 ── */}
            {isLeaderOrAdmin && (
              <div
                className={`px-5 py-2.5 flex items-center gap-3 cursor-pointer select-none border-b transition-colors ${
                  postAsChurch ? 'bg-blue-50 border-blue-100' : 'bg-gray-50/60 border-gray-100'
                }`}
                onClick={() => setPostAsChurch(v => !v)}
              >
                <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${postAsChurch ? 'bg-[#335f87]' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${postAsChurch ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {postAsChurch ? (
                    <>
                      <img src="/logo-square.png" alt="" className="w-5 h-5 rounded-full border border-gray-200 shrink-0" />
                      <span className="text-2xs font-bold text-[#335f87] truncate">더브릿지 교회 이름으로 올리기</span>
                    </>
                  ) : (
                    <span className="text-2xs font-semibold text-gray-400">교회 이름으로 올리기 (현재: 내 이름)</span>
                  )}
                </div>
              </div>
            )}

            {/* 본문 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain touch-pan-y">
              <div>
                <label className="block text-2xs font-bold text-gray-500 mb-1">소식 제목</label>
                <input
                  type="text"
                  placeholder="소식 제목 (예: 박성도 성도님 득남 축하)"
                  value={newNewsTitle}
                  onChange={e => setNewNewsTitle(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-2xs font-bold text-gray-500 mb-1">상세 내용</label>
                <textarea
                  rows={6}
                  placeholder="축하, 기도, 소식 등 성도들과 함께 나눌 상세 내용을 작성해 주세요..."
                  value={newNewsContent}
                  onChange={e => setNewNewsContent(e.target.value)}
                  className="w-full min-h-[140px] max-h-[260px] text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] resize-y text-gray-900 font-medium leading-relaxed"
                />
              </div>
            </div>

            {/* 하단 고정 버튼 */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (hasUnsavedAdd) {
                    if (!confirm('작성 중인 내용이 있습니다. 정말 창을 닫으시겠습니까?')) return
                  }
                  setShowAddNewsModal(false)
                }}
                className="flex-1 py-3 bg-gray-200/80 hover:bg-gray-300/80 text-gray-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreateNews}
                disabled={isCreatingNews}
                className="flex-1 py-3 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-xl disabled:opacity-60 shadow-md transition-all cursor-pointer"
              >
                {isCreatingNews ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 교우소식 수정 모달 ── */}
      {editingNews && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overscroll-contain"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden overscroll-contain">
            {/* 상단 고정 헤더 */}
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100 bg-gray-50/80 shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-gray-900">✏️ 교우소식 수정</h3>
              <button
                type="button"
                onClick={() => {
                  if (hasUnsavedEdit) {
                    if (!confirm('작성 중인 내용이 있습니다. 정말 창을 닫으시겠습니까?')) return
                  }
                  setEditingNews(null)
                }}
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
                  value={editNewsTitle}
                  onChange={e => setEditNewsTitle(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                  placeholder="제목"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-2xs font-bold text-gray-500 mb-1">내용</label>
                <textarea
                  rows={6}
                  value={editNewsContent}
                  onChange={e => setEditNewsContent(e.target.value)}
                  className="w-full min-h-[140px] max-h-[260px] text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] resize-y text-gray-900 font-medium leading-relaxed"
                  placeholder="내용"
                />
              </div>
            </div>

            {/* 하단 고정 버튼 */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (hasUnsavedEdit) {
                    if (!confirm('작성 중인 내용이 있습니다. 정말 창을 닫으시겠습니까?')) return
                  }
                  setEditingNews(null)
                }}
                className="flex-1 py-3 bg-gray-200/80 hover:bg-gray-300/80 text-gray-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveNewsEdit}
                className="flex-1 py-3 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
