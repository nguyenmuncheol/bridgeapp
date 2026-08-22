'use client'

import { useState, Dispatch, SetStateAction } from 'react'
import { Play, Trash2, X, ExternalLink, Edit2, Heart, MessageCircle } from 'lucide-react'
import { PostItem, UserProfile, getSimpleUserName } from '../../lib/mockData'
import { dbUpdatePost, dbDeletePost, dbAddComment, dbTogglePostLike } from '../../lib/db'
import { getYouTubeVideoId } from './youtube'
import CommentList from '../CommentList'
import Avatar from '../news/Avatar'
import { SkeletonList } from '../SkeletonCard'
import { todayLocalDateStr } from '../../lib/dateUtils'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'

interface PraiseBoardProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  isAdmin: boolean
  praises: PostItem[]
  setPraises: Dispatch<SetStateAction<PostItem[]>>
  isLoading: boolean
  // "더보기" 페이지네이션 (SharingTab이 관리)
  isLoadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  // 다른 게시판들과 동일하게 "오류가 있었나" 여부만 받습니다.
  // (unknown 으로 두면 화면에 그대로 그리려다 빌드가 실패합니다)
  error?: unknown
  onRetry?: () => void
}

// ── 찬양/묵상나눔 게시판 (유튜브 임베드 + 수정/삭제) ──
export default function PraiseBoard({ currentUser, allUsers, isAdmin, praises, setPraises, isLoading, isLoadingMore, hasMore, onLoadMore, error, onRetry }: PraiseBoardProps) {
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // ── 링크 종류 판별 ──
  // 🐛 과거 문제: 유튜브가 아닌 주소(교회 홈페이지, 블로그 등)를 넣으면 영상 자리에
  //    검은 상자만 뜨고 아무것도 안 보였습니다. 이제 일반 링크는 새 창으로 엽니다.
  const isSafeWebUrl = (url?: string) => {
    if (!url) return false
    const u = url.trim().toLowerCase()
    // javascript: 같은 위험한 주소는 링크로 만들지 않습니다.
    return u.startsWith('http://') || u.startsWith('https://')
  }
  const linkHostOf = (url?: string) => {
    try { return new URL((url || '').trim()).hostname.replace(/^www\./, '') } catch { return '링크' }
  }

  // ── 댓글 ──
  const handleAddComment = async (postId: string, text: string) => {
    const tempId = `c_${Date.now()}`
    setPraises(prev => prev.map(p => p.id === postId ? {
      ...p,
      comments: [...(p.comments || []), {
        id: tempId,
        authorId: currentUser.id,
        authorName: getSimpleUserName(currentUser),
        content: text,
        createdAt: todayLocalDateStr(),
      }],
    } : p))

    const { error: addError, id: realId, createdAt: realAt } = await dbAddComment(postId, currentUser.id, getSimpleUserName(currentUser), text)
    if (!addError && realId) {
      // 🐛 저장에 성공하면 **임시 번호를 진짜 번호로 갈아끼웁니다.**
      // 이걸 안 하면 방금 쓴 댓글을 바로 수정·삭제할 때 서버가 그 댓글을 못 찾습니다.
      setPraises(prev => prev.map(p => p.id === postId ? {
        ...p,
        comments: (p.comments || []).map(c => (c.id === tempId ? { ...c, id: realId, createdAt: realAt || c.createdAt } : c))
      } : p))
    }
    if (addError) {
      // 실패하면 방금 넣은 임시 댓글을 걷어냅니다 (저장 안 됐는데 남아 있으면 안 됩니다)
      setPraises(prev => prev.map(p => p.id === postId ? {
        ...p, comments: (p.comments || []).filter(c => c.id !== tempId),
      } : p))
      showToast('댓글 등록 중 오류가 발생했습니다.', true)
    }
  }

  // 좋아요 — 아멘/축하응원과 같은 방식입니다.
  // 카드가 지금 화면에 보이는 값을 넘겨주고, 서버가 돌려준 값으로 마지막에 맞춥니다.
  // (setState 안에서 값을 읽으면 React가 즉시 실행하지 않아 저장이 통째로 건너뛰어집니다)
  const handleLike = async (e: React.MouseEvent, id: string, current: { likes: number; likedUserIds: string[] }) => {
    e.stopPropagation()
    const before = { likes: current.likes, likedUserIds: current.likedUserIds || [] }
    const liked = before.likedUserIds.includes(currentUser.id)
    const guessLikes = liked ? Math.max(0, before.likes - 1) : before.likes + 1
    const guessIds = liked
      ? before.likedUserIds.filter(uid => uid !== currentUser.id)
      : [...before.likedUserIds, currentUser.id]

    const apply = (likes: number, ids: string[]) =>
      setPraises(prev => prev.map(p => (p.id === id ? { ...p, likes, likedUserIds: ids } : p)))

    apply(guessLikes, guessIds)
    const res = await dbTogglePostLike(id, currentUser.id, before)
    if (res.error) {
      apply(before.likes, before.likedUserIds)
      showToast('좋아요가 저장되지 않았습니다.', true)
      return
    }
    if (res.likes !== guessLikes || res.likedUserIds.length !== guessIds.length) {
      apply(res.likes, res.likedUserIds)
    }
  }

  const handleCommentChanged = (postId: string, commentId: string, nextContent: string | null) => {
    setPraises(prev => prev.map(p => {
      if (p.id !== postId) return p
      const comments = p.comments || []
      return {
        ...p,
        comments: nextContent === null
          ? comments.filter(c => c.id !== commentId)
          : comments.map(c => (c.id === commentId ? { ...c, content: nextContent } : c)),
      }
    }))
    setSelectedPraise(prev => (prev && prev.id === postId ? { ...prev } : prev))
  }

  const [selectedPraise, setSelectedPraise] = useState<PostItem | null>(null)
  const [editingPraise, setEditingPraise] = useState<PostItem | null>(null)
  useModalDismiss(!!selectedPraise && !editingPraise, () => setSelectedPraise(null))
  useModalDismiss(!!editingPraise, () => setEditingPraise(null))
  const [editPraiseTitle, setEditPraiseTitle] = useState('')
  const [editPraiseContent, setEditPraiseContent] = useState('')

  const handleDeletePraise = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await dbDeletePost(id)
    setPraises(p => p.filter(x => x.id !== id))
    if (selectedPraise?.id === id) setSelectedPraise(null)
  }

  // ── 찬양/묵상 수정 저장 ──
  const handleSavePraiseEdit = async () => {
    if (!editingPraise) return
    await dbUpdatePost(editingPraise.id, { title: editPraiseTitle, content: editPraiseContent })
    setPraises(prev => prev.map(p => p.id === editingPraise.id
      ? { ...p, title: editPraiseTitle, content: editPraiseContent }
      : p
    ))
    setEditingPraise(null)
    setSelectedPraise(null)
  }

  return (
    <div className="space-y-4">
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}
      {/* error 는 어떤 형태로든 올 수 있으므로(unknown) 반드시 참/거짓으로 바꿔서 씁니다.
          그냥 {error && ...} 로 쓰면 error 자체를 화면에 그리려는 코드가 되어 빌드가 실패합니다. */}
      {!!error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
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
      {!isLoading && !error && praises.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-400">아직 등록된 찬양/묵상나눔이 없습니다.</div>
      )}
      {praises.map(praise => (
        <div
          key={praise.id}
          onClick={() => setSelectedPraise(praise)}
          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2 cursor-pointer hover:border-blue-200 transition-all active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Avatar allUsers={allUsers} authorId={praise.authorId || ''} authorName={praise.authorName} size="w-8 h-8 text-2xs" />
              <span className="font-bold text-gray-900">{praise.authorName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-gray-400">{praise.createdAt}</span>
              {(praise.authorId === currentUser.id || isAdmin) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeletePraise(praise.id)
                  }}
                  className="p-1 text-gray-400 hover:text-rose-500 rounded"
                  title="삭제"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
          <h3 className="font-bold text-sm text-gray-900">{praise.title}</h3>
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{praise.content}</p>
          {praise.youtubeUrl ? (() => {
            const videoId = getYouTubeVideoId(praise.youtubeUrl)
            const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
            // 유튜브가 아닌 일반 웹페이지 주소는 검은 상자 대신 "링크" 카드로 보여줍니다.
            if (!videoId) {
              return (
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-[#335f87] rounded-full flex items-center justify-center shrink-0 text-white">
                    <ExternalLink size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#335f87]">웹페이지 링크</p>
                    <p className="text-2xs text-gray-500 truncate">{linkHostOf(praise.youtubeUrl)}</p>
                  </div>
                </div>
              )
            }
            return (
              <div className="relative rounded-xl overflow-hidden bg-slate-900 group/yt">
                {thumbUrl ? (
                  <div className="h-36 relative">
                    <img src={thumbUrl} alt="YouTube thumbnail" className="w-full h-full object-cover opacity-90 group-hover/yt:scale-105 transition-all" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg group-hover/yt:scale-110 transition-transform"><Play size={18} className="ml-0.5 fill-white" /></div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-white text-center flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shrink-0"><Play size={14} className="ml-0.5 fill-white" /></div>
                    <span className="text-xs font-semibold">유튜브 영상 – 클릭하여 재생</span>
                  </div>
                )}
              </div>
            )
          })() : (
            <div className="text-2xs text-[#335f87] font-semibold flex items-center gap-1 opacity-60">탭하여 전체 내용 보기 →</div>
          )}

          {/* 좋아요 · 댓글 수 */}
          <div className="flex items-center gap-3 pt-1.5 border-t border-gray-50 text-2xs">
            <button
              onClick={(e) => handleLike(e, praise.id, { likes: praise.likes, likedUserIds: praise.likedUserIds || [] })}
              className={`flex items-center gap-1 font-bold transition-transform active:scale-95 ${
                (praise.likedUserIds || []).includes(currentUser.id) ? 'text-rose-500' : 'text-gray-400 hover:text-rose-500'
              }`}
            >
              <Heart size={12} className={(praise.likedUserIds || []).includes(currentUser.id) ? 'fill-rose-500' : ''} />
              {praise.likes || 0}
            </button>
            <span className="flex items-center gap-1 font-bold text-gray-400">
              <MessageCircle size={12} /> {(praise.comments || []).length}
            </span>
          </div>
        </div>
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

      {/* ── 찬양/묵상 상세 모달 (수정 & 삭제 버튼 포함) ── */}
      {selectedPraise && !editingPraise && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setSelectedPraise(null))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden max-h-[85vh] overflow-y-auto">
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{selectedPraise.title}</h3>
                  <p className="text-2xs text-gray-400 mt-0.5">{selectedPraise.authorName} · {selectedPraise.createdAt}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {(selectedPraise.authorId === currentUser.id || isAdmin) && (
                    <>
                      <button
                        onClick={() => {
                          setEditingPraise(selectedPraise)
                          setEditPraiseTitle(selectedPraise.title)
                          setEditPraiseContent(selectedPraise.content)
                        }}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                        title="수정"
                      ><Edit2 size={14} /></button>
                      <button
                        onClick={() => handleDeletePraise(selectedPraise.id)}
                        className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"
                        title="삭제"
                      ><Trash2 size={14} /></button>
                    </>
                  )}
                  <button onClick={() => setSelectedPraise(null)} className="text-gray-400 hover:text-gray-600 ml-1"><X size={18} /></button>
                </div>
              </div>
              {selectedPraise.youtubeUrl && (() => {
                const videoId = getYouTubeVideoId(selectedPraise.youtubeUrl)
                return (
                  <div className="space-y-2">
                    {videoId ? (
                      <>
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-md">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                            title={selectedPraise.title || 'YouTube video'}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="w-full h-full border-0"
                          />
                        </div>
                        <a
                          href={selectedPraise.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-2xs text-blue-600 hover:underline flex items-center justify-center gap-1 font-semibold py-0.5"
                        >
                          <ExternalLink size={11} /> 유튜브 앱/웹에서 직접 열기
                        </a>
                      </>
                    ) : isSafeWebUrl(selectedPraise.youtubeUrl) ? (
                      // 유튜브가 아닌 일반 웹페이지 → 앱 안에서 못 여니 새 창으로 엽니다.
                      <a
                        href={selectedPraise.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                      >
                        <ExternalLink size={14} /> 링크 열기 ({linkHostOf(selectedPraise.youtubeUrl)})
                      </a>
                    ) : (
                      <p className="text-2xs text-gray-400 text-center py-2">
                        열 수 없는 주소입니다. (http:// 또는 https:// 로 시작해야 합니다)
                      </p>
                    )}
                  </div>
                )
              })()}
              <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">{selectedPraise.content}</p>

              {/* 댓글 — 기도제목·교우소식과 같은 부품을 씁니다 */}
              <div className="pt-1 border-t border-gray-100 space-y-2">
                <CommentList
                  postId={selectedPraise.id}
                  comments={(praises.find(p => p.id === selectedPraise.id)?.comments) || []}
                  currentUser={currentUser}
                  allUsers={allUsers}
                  isAdmin={isAdmin}
                  onAddComment={handleAddComment}
                  onCommentChanged={handleCommentChanged}
                  onError={msg => showToast(msg, true)}
                  placeholder="은혜 나눔을 댓글로 남겨보세요..."
                />
              </div>

              <button onClick={() => setSelectedPraise(null)} className="w-full py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 찬양/묵상 수정 모달 ── */}
      {editingPraise && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overscroll-contain"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full h-[88vh] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden overscroll-contain">
            {/* 상단 고정 헤더 */}
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100 bg-gray-50/80 shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-gray-900">✏️ 찬양/묵상 수정</h3>
              <button
                type="button"
                onClick={() => setEditingPraise(null)}
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
                  value={editPraiseTitle}
                  onChange={e => setEditPraiseTitle(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                  placeholder="제목"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-2xs font-bold text-gray-500 mb-1">내용</label>
                <textarea
                  rows={10}
                  value={editPraiseContent}
                  onChange={e => setEditPraiseContent(e.target.value)}
                  className="w-full min-h-[220px] sm:min-h-[280px] text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] resize-y text-gray-900 font-medium leading-relaxed"
                  placeholder="내용"
                />
              </div>
            </div>

            {/* 하단 고정 버튼 */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingPraise(null)}
                className="flex-1 py-3 bg-gray-200/80 hover:bg-gray-300/80 text-gray-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSavePraiseEdit}
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
