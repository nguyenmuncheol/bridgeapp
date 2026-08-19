'use client'

import { useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { UserProfile, getUserDisplayName, PostItem } from '../../lib/mockData'
import { dbCreatePost, dbUpdatePost, dbDeletePost, dbAddComment, dbTogglePostLike } from '../../lib/db'
import { usePaginatedPosts } from '../../lib/usePaginatedPosts'
import { todayLocalDateStr } from '../../lib/dateUtils'
import { SkeletonList } from '../SkeletonCard'
import MemberNewsCard from './MemberNewsCard'

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
  const handleNewsLike = useCallback(async (newsId: string) => {
    let snapshot: { likes: number; likedUserIds: string[] } | null = null

    setMemberNewsList(prev => prev.map(n => {
      if (n.id !== newsId) return n
      const likedUsers = n.likedUserIds || []
      snapshot = { likes: n.likes, likedUserIds: likedUsers }
      const isLiked = likedUsers.includes(currentUser.id)
      return {
        ...n,
        likes: isLiked ? Math.max(0, n.likes - 1) : n.likes + 1,
        likedUserIds: isLiked ? likedUsers.filter(uid => uid !== currentUser.id) : [...likedUsers, currentUser.id]
      }
    }))

    if (!snapshot) return

    const res = await dbTogglePostLike(newsId, currentUser.id, snapshot)
    if (res.error) {
      setMemberNewsList(prev => prev.map(n => n.id === newsId ? { ...n, likes: snapshot!.likes, likedUserIds: snapshot!.likedUserIds } : n))
      showToast('축하 처리 중 오류가 발생했습니다.', true)
      return
    }
    setMemberNewsList(prev => prev.map(n => n.id === newsId ? { ...n, likes: res.likes, likedUserIds: res.likedUserIds } : n))
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

    setIsCreatingNews(true)
    const res = await dbCreatePost({
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
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
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
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
      const { error } = await dbAddComment(newsId, currentUser.id, getUserDisplayName(currentUser), text)
      if (error) throw error
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
          className="px-2.5 py-1 bg-[#335f87] text-white text-[11px] font-bold rounded-lg hover:bg-[#2b5072] flex items-center gap-1"
        ><Plus size={12} /> 소식 나누기</button>
      </div>

      {newsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">📡</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">소식을 불러오지 못했습니다</p>
            <p className="text-[11px] text-amber-700 mt-0.5">인터넷 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          <button onClick={retryNews} className="px-2.5 py-1.5 bg-amber-600 text-white text-[11px] font-bold rounded-lg shrink-0">다시 시도</button>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <h3 className="font-bold text-sm text-gray-900">📣 교우소식 작성</h3>
            <input
              type="text"
              placeholder="소식 제목 (예: 박성도 성도님 득남 축하)"
              value={newNewsTitle}
              onChange={e => setNewNewsTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium"
            />
            <textarea
              rows={4}
              placeholder="상세 내용을 작성해 주세요..."
              value={newNewsContent}
              onChange={e => setNewNewsContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none text-gray-900 font-medium"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddNewsModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleCreateNews} disabled={isCreatingNews} className="flex-1 py-3 bg-[#335f87] text-white text-xs font-bold rounded-xl disabled:opacity-60">{isCreatingNews ? '등록 중...' : '등록하기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 교우소식 수정 모달 ── */}
      {editingNews && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">✏️ 교우소식 수정</h3>
              <button onClick={() => setEditingNews(null)} className="text-gray-400 font-bold">✕</button>
            </div>
            <input
              type="text"
              value={editNewsTitle}
              onChange={e => setEditNewsTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium"
              placeholder="제목"
            />
            <textarea
              rows={4}
              value={editNewsContent}
              onChange={e => setEditNewsContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none text-gray-900 font-medium"
              placeholder="내용"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingNews(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSaveNewsEdit} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
