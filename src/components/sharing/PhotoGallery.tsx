'use client'

import { useState, useRef, Dispatch, SetStateAction, ReactNode } from 'react'
import { Heart, Filter, Trash2, X, Edit2, MessageCircle, Play } from 'lucide-react'
import { PostItem, UserProfile, CommentItem, getUserDisplayName, getInitials } from '../../lib/mockData'
import { dbUpdatePost, dbDeletePost, dbTogglePostLike } from '../../lib/db'
import { SkeletonList } from '../SkeletonCard'
import ImageSlider from '../ImageSlider'
import { saveImage, openImageViewer } from '../../lib/download'
import { getYouTubeVideoId } from './youtube'
import CommentList from '../CommentList'
import { dbAddComment } from '../../lib/db'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'
import { uploadMultipleImagesToStorage, deleteImagesFromStorage } from '../../lib/storage'

interface PhotoGalleryProps {
  currentUser: UserProfile
  // 작성자 이름/사진을 최신 프로필로 보여주기 위해 필요합니다.
  allUsers: UserProfile[]
  isAdmin: boolean
  photos: PostItem[]
  setPhotos: Dispatch<SetStateAction<PostItem[]>>
  dynamicTags: string[]
  /** 현재 선택된 태그 (서버 조회 조건). SharingTab이 소유합니다. */
  selectedTag: string
  onTagChange: (tag: string) => void
  // "더보기" 페이지네이션 (SharingTab이 관리). 태그 필터는 지금까지 불러온 photos 안에서만
  // 걸러지므로, 아직 안 불러온 사진 중 그 태그가 있으면 "더보기"를 더 눌러야 보일 수 있습니다.
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  error?: string | null
  onRetry?: () => void
}

// ── 행사사진 갤러리 (태그 필터/좋아요/상세보기/수정/삭제) ──
export default function PhotoGallery({ currentUser, allUsers, isAdmin, photos, setPhotos, dynamicTags, selectedTag, onTagChange, isLoading, isLoadingMore, hasMore, onLoadMore, error, onRetry }: PhotoGalleryProps) {
  const [activePhotoModal, setActivePhotoModal] = useState<PostItem | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<PostItem | null>(null)
  useModalDismiss(!!editingPhoto, () => setEditingPhoto(null))
  const [editPhotoTitle, setEditPhotoTitle] = useState('')
  const [editPhotoContent, setEditPhotoContent] = useState('')
  const [editPhotoTag, setEditPhotoTag] = useState('')
  const [editPhotoVideo, setEditPhotoVideo] = useState('')
  // 사진 개별 삭제/추가: 남길 사진 목록(기존 + 새로 올린 것). 저장 시 이 목록으로
  // image_urls를 통째로 교체하고, 원래 있었는데 빠진 사진만 스토리지에서 지웁니다.
  const [editPhotoImages, setEditPhotoImages] = useState<string[]>([])
  const [isUploadingEditPhoto, setIsUploadingEditPhoto] = useState(false)
  const editPhotoFileInputRef = useRef<HTMLInputElement>(null)

  // 다른 게시판(기도제목/찬양나눔)과 동일하게 작성자를 표시합니다.
  // 🐛 과거 문제: 행사사진만 누가 올렸는지 안 보여서, 사진에 문제가 있어도
  //    누구에게 물어봐야 할지 알 수 없었습니다.
  const renderAuthor = (authorId?: string, authorName?: string, size = 'w-7 h-7 text-2xs') => {
    const user = allUsers.find(u => u.id === authorId || u.name === authorName)
    const displayName = user?.name || authorName || '성도'
    return (
      <span className="flex items-center gap-1 min-w-0">
        <span className={`${size} rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden`}>
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            : getInitials(displayName)}
        </span>
        <span className="truncate">{displayName}</span>
      </span>
    )
  }

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // ── 행사사진 좋아요 (그리드/상세 모달 공용, 1인 1회 토글) ──
  // 🐛 과거 버그 2가지:
  //  ① 화면의 값을 읽어 계산한 뒤 게시글을 통째로 덮어썼습니다. 여러 명이 비슷한 시각에
  //     누르면 뒤에 누른 사람이 앞사람 좋아요를 지웠습니다.
  //  ② 이 방식은 "남의 게시글을 수정"하는 것이라, 게시글 수정 권한을 작성자·관리자로
  //     조이면 좋아요가 통째로 고장납니다.
  // → 기도제목/교우소식과 동일하게 서버 함수(dbTogglePostLike)를 거칩니다.
  // ── 댓글 (다른 게시판과 같은 공용 부품을 씁니다) ──
  const handleAddComment = async (photoId: string, text: string) => {
    const tempId = `c_${Date.now()}`
    const authorName = getUserDisplayName(currentUser)
    setPhotos(prev => prev.map(p => p.id === photoId ? {
      ...p,
      comments: [...(p.comments || []), { id: tempId, authorId: currentUser.id, authorName, content: text, createdAt: '방금 전' }]
    } : p))

    const { error, id, createdAt } = await dbAddComment(photoId, currentUser.id, authorName, text)
    if (error) {
      setPhotos(prev => prev.map(p => p.id === photoId ? {
        ...p, comments: (p.comments || []).filter(c => c.id !== tempId)
      } : p))
      showToast('댓글 등록 중 오류가 발생했습니다.', true)
      return
    }
    // 임시 번호를 진짜 번호로 갈아끼웁니다 (안 하면 방금 쓴 댓글을 못 고칩니다)
    if (id) {
      setPhotos(prev => prev.map(p => p.id === photoId ? {
        ...p,
        comments: (p.comments || []).map(c => (c.id === tempId ? { ...c, id, createdAt: createdAt || c.createdAt } : c))
      } : p))
    }
  }

  const handleCommentChanged = (photoId: string, commentId: string, nextContent: string | null) => {
    setPhotos(prev => prev.map(p => {
      if (p.id !== photoId) return p
      const comments = p.comments || []
      return {
        ...p,
        comments: nextContent === null
          ? comments.filter(c => c.id !== commentId)
          : comments.map(c => (c.id === commentId ? { ...c, content: nextContent } : c)),
      }
    }))
  }

  const handlePhotoLike = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const target = photos.find(p => p.id === id)
    if (!target) return
    const likedUsers = target.likedUserIds || []
    const before = { likes: target.likes, likedUserIds: likedUsers }
    const isLiked = likedUsers.includes(currentUser.id)
    const newLikes = isLiked ? Math.max(0, target.likes - 1) : target.likes + 1
    const newLikedUsers = isLiked ? likedUsers.filter(uid => uid !== currentUser.id) : [...likedUsers, currentUser.id]

    // 낙관적 UI 업데이트
    const applyLocal = (likes: number, ids: string[]) => {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, likes, likedUserIds: ids } : p))
      setActivePhotoModal(prev => prev && prev.id === id ? { ...prev, likes, likedUserIds: ids } : prev)
    }
    applyLocal(newLikes, newLikedUsers)

    const res = await dbTogglePostLike(id, currentUser.id, before)
    if (res.error) {
      applyLocal(before.likes, before.likedUserIds)
      showToast('좋아요 처리 중 오류가 발생했습니다.', true)
      return
    }
    // 서버가 알려준 최종 값으로 맞춥니다 (다른 사람이 동시에 눌렀을 수 있으므로)
    if (res.likes !== newLikes || res.likedUserIds.length !== newLikedUsers.length) {
      applyLocal(res.likes, res.likedUserIds)
    }
  }

  // ── 행사사진 수정 저장 (내용 포함) ──
  const [isSavingPhoto, setIsSavingPhoto] = useState(false)
  const handleSavePhotoEdit = async () => {
    if (!editingPhoto || isSavingPhoto) return

    // 🐛 과거 버그: 수정 창의 태그 입력칸에는 첫 번째 태그 하나만 채워지는데,
    // 저장할 때 그 하나로 태그 전체를 갈아치웠습니다. 그래서 제목만 고쳐도
    // #부활절 #유아부 중 #유아부가 조용히 사라졌습니다.
    // → 입력칸에서 편집한 태그만 교체하고 나머지 태그는 그대로 보존합니다.
    const previousTags = (editingPhoto.tags || []).filter(t => t && t !== '전체')
    const editedTag = editPhotoTag.trim()
    const untouchedTags = previousTags.slice(1) // 첫 태그가 입력칸에 표시된 태그
    const tags = ['전체', ...(editedTag ? [editedTag] : []), ...untouchedTags]
      .filter((t, idx, arr) => arr.indexOf(t) === idx)

    // 행사사진은 유튜브 주소만 받습니다.
    const nextVideo = editPhotoVideo.trim()
    if (nextVideo && !getYouTubeVideoId(nextVideo)) {
      showToast('유튜브 주소만 넣을 수 있습니다.', true)
      return
    }
    // 사진도 영상도 없는 글이 되지 않도록 막습니다.
    if (!nextVideo && editPhotoImages.length === 0) {
      showToast('사진이 없는 글에서는 영상 주소를 지울 수 없습니다.', true)
      return
    }

    setIsSavingPhoto(true)
    const { error: saveError } = await dbUpdatePost(editingPhoto.id, {
      title: editPhotoTitle.trim(),
      content: editPhotoContent.trim(),
      youtubeUrl: nextVideo,
      tags,
      imageUrls: editPhotoImages
    })
    setIsSavingPhoto(false)
    if (saveError) {
      showToast('저장하지 못했습니다. 다시 시도해 주세요.', true)
      return
    }

    // 저장에 성공했으면, 원래 있었는데 이번에 뺀 사진만 스토리지에서 정리합니다(고아 파일 방지).
    const removedUrls = (editingPhoto.imageUrls || []).filter(u => !editPhotoImages.includes(u))
    if (removedUrls.length > 0) deleteImagesFromStorage(removedUrls).catch(() => {})

    setPhotos(prev => prev.map(p => p.id === editingPhoto.id
      ? { ...p, title: editPhotoTitle.trim(), content: editPhotoContent.trim(), youtubeUrl: nextVideo, tags, imageUrls: editPhotoImages }
      : p
    ))
    if (activePhotoModal?.id === editingPhoto.id) {
      setActivePhotoModal(prev => prev ? { ...prev, title: editPhotoTitle.trim(), content: editPhotoContent.trim(), youtubeUrl: nextVideo, tags, imageUrls: editPhotoImages } : null)
    }
    setEditingPhoto(null)
  }

  // 수정 창에서 사진을 추가로 골랐을 때 즉시 업로드 후 목록에 붙입니다.
  const handleAddEditPhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const arr = Array.from(files).slice(0, 10 - editPhotoImages.length)
    if (arr.length === 0) {
      showToast('사진은 한 장 이상 뺀 뒤에 추가해 주세요 (최대 10장).', true)
      return
    }
    setIsUploadingEditPhoto(true)
    showToast('⏳ 사진 업로드 중...')
    try {
      const uploaded = await uploadMultipleImagesToStorage(arr, 'photos')
      setEditPhotoImages(prev => [...prev, ...uploaded])
    } catch (err: any) {
      showToast(err?.message || '사진 업로드에 실패했습니다.', true)
    } finally {
      setIsUploadingEditPhoto(false)
      if (editPhotoFileInputRef.current) editPhotoFileInputRef.current.value = ''
    }
  }

  const handleRemoveEditPhotoImage = (url: string) => {
    setEditPhotoImages(prev => prev.filter(u => u !== url))
  }

  const handleDeletePhoto = async (id: string) => {
    const target = photos.find(p => p.id === id)
    // 🐛 과거 버그: 어떤 글인지 안 알려주고 삭제했고, 삭제가 실패해도 화면에서는 사라졌습니다.
    // (사진은 특히 민감합니다 — 지웠다고 믿었는데 다른 성도 화면엔 그대로 남아있었습니다)
    if (!confirm(`${target?.title ? `'${target.title}'` : '이 사진'} 을(를) 삭제할까요?\n사진 파일도 함께 삭제되며 되돌릴 수 없습니다.`)) return

    const { error: delError } = await dbDeletePost(id)
    if (delError) {
      showToast('삭제하지 못했습니다. 다시 시도해 주세요.', true)
      return
    }
    setPhotos(p => p.filter(x => x.id !== id))
    if (activePhotoModal?.id === id) setActivePhotoModal(null)
  }

  // 태그 필터는 이제 **서버**가 걸러줍니다(SharingTab이 선택된 태그를 조회에 넘김).
  // 예전에는 이미 불러온 사진 안에서만 걸렀기 때문에, 30번째에 있는 #부활절 사진은
  // "더보기"를 두 번 눌러야 나타났습니다.
  const filteredPhotos = photos

  return (
    <div className="space-y-4">
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <Filter size={14} className="text-gray-400 shrink-0" />
        {dynamicTags.map(tag => (
          <button key={tag} onClick={() => onTagChange(tag)}
            className={`px-3 py-1 rounded-full shrink-0 transition-all text-xs ${selectedTag === tag ? 'bg-[#335f87] text-white font-bold' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>#{tag}</button>
        ))}
      </div>
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">📡</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">사진을 불러오지 못했습니다</p>
            <p className="text-2xs text-amber-700 mt-0.5">인터넷 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          {onRetry && (
            <button onClick={onRetry} className="px-2.5 py-1.5 bg-amber-600 text-white text-2xs font-bold rounded-lg shrink-0">다시 시도</button>
          )}
        </div>
      )}
      {isLoading && <SkeletonList count={4} variant="photo" />}
      {!isLoading && filteredPhotos.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-400">
          {selectedTag === '전체' ? '아직 등록된 사진이 없습니다.' : `#${selectedTag} 태그의 사진이 없습니다.`}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {filteredPhotos.map(photo => (
          <div
            key={photo.id}
            onClick={() => setActivePhotoModal(photo)}
            className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-2xs cursor-pointer group relative flex flex-col justify-between"
          >
            <div className="h-32 bg-gray-100 overflow-hidden relative">
              {/* 사진이 있으면 사진을, 없으면 유튜브 썸네일을 보여줍니다 */}
              {(() => {
                const videoId = getYouTubeVideoId(photo.youtubeUrl)
                const cover = photo.imageUrls?.[0]
                  || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined)
                return (
                  <>
                    <img src={cover} alt={photo.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                    {/* 영상이 있으면 사진 위에도 ▶ 표시를 얹어 한눈에 구분되게 합니다 */}
                    {videoId && (
                      <span className="absolute inset-0 bg-black/25 flex items-center justify-center">
                        <span className="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg">
                          <Play size={16} className="ml-0.5 fill-white" />
                        </span>
                      </span>
                    )}
                  </>
                )
              })()}
              {photo.imageUrls && photo.imageUrls.length > 1 && (
                <span className="absolute top-2 right-2 bg-black/60 text-white text-2xs px-1.5 py-0.5 rounded-full">+{photo.imageUrls.length - 1}장</span>
              )}
            </div>
            <div className="p-3 space-y-1.5">
              <h4 className="font-bold text-xs text-gray-800 line-clamp-1">{photo.title}</h4>
              {photo.content && (
                <p className="text-2xs text-gray-500 line-clamp-1 leading-snug">{photo.content}</p>
              )}

              {photo.tags && photo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {photo.tags.filter(t => t !== '전체').map(tag => (
                    <span key={tag} className="text-2xs bg-blue-50 text-[#335f87] font-bold px-1.5 py-0.5 rounded-md">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex justify-between text-2xs text-gray-400 items-center pt-1 border-t border-gray-50 gap-1">
                <span className="flex items-center gap-1 min-w-0">
                  {renderAuthor(photo.authorId, photo.authorName)}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-0.5 text-gray-400 font-bold">
                    <MessageCircle size={11} /> {(photo.comments || []).length}
                  </span>
                  <button
                    onClick={(e) => handlePhotoLike(photo.id, e)}
                    className="flex items-center gap-0.5 text-rose-500 font-bold hover:scale-110 transition-transform active:scale-95"
                  >
                    <Heart size={11} className="fill-rose-500" /> {photo.likes}
                  </button>
                </span>
              </div>
              <p className="text-2xs text-gray-300">{photo.createdAt}</p>
            </div>
          </div>
        ))}
      </div>

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

      {/* ── 행사사진 수정 모달 ──
          🐛 과거 버그: 이 창과 사진 상세 창이 둘 다 z-[70]이었습니다. 층이 같으면
          나중에 그려지는 쪽(사진 상세)이 위로 올라오기 때문에, 수정 버튼을 눌러도
          수정 창이 사진 뒤에 가려져 글자를 칠 수 없었습니다.
          → 수정 창을 z-[90]으로 올리고, 뒤의 사진 창은 흐리게 + 클릭 차단합니다.
          → 무엇을 고치는 중인지 알 수 있게 사진 미리보기를 수정 창 안에 넣었습니다. */}
      {editingPhoto && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[90] flex items-center justify-center p-4"
          onClick={backdropClose(() => setEditingPhoto(null))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">✏️ 행사사진 정보 수정</h3>
              <button onClick={() => setEditingPhoto(null)} className="text-gray-400 font-bold">✕</button>
            </div>

            {/* 사진 개별 삭제/추가 */}
            <div className="space-y-1.5">
              <label className="text-2xs text-gray-400 font-bold">사진 ({editPhotoImages.length}장)</label>
              <div className="flex gap-1.5 flex-wrap">
                {editPhotoImages.map((url) => (
                  <div key={url} className="relative shrink-0">
                    <img src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => handleRemoveEditPhotoImage(url)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800/80 text-white rounded-full text-2xs font-bold flex items-center justify-center"
                      aria-label="이 사진 빼기"
                    >✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => editPhotoFileInputRef.current?.click()}
                  disabled={isUploadingEditPhoto || editPhotoImages.length >= 10}
                  className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 text-xs font-bold flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 shrink-0"
                  aria-label="사진 추가"
                >
                  {isUploadingEditPhoto ? '…' : '+ 추가'}
                </button>
              </div>
              <input ref={editPhotoFileInputRef} type="file" accept="image/*" multiple onChange={handleAddEditPhotoFiles} className="hidden" />
            </div>

            <div>
              <label className="text-2xs text-gray-400 font-bold">제목</label>
              <input
                type="text"
                value={editPhotoTitle}
                onChange={e => setEditPhotoTitle(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium"
                placeholder="제목"
              />
            </div>
            <div>
              <label className="text-2xs text-gray-400 font-bold">상세 설명 / 나눔 내용</label>
              <textarea
                rows={3}
                value={editPhotoContent}
                onChange={e => setEditPhotoContent(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none text-gray-900 font-medium"
                placeholder="사진 설명이나 나눔 내용을 적어주세요..."
              />
            </div>
            <div>
              <label className="text-2xs text-gray-400 font-bold">유튜브 영상 주소 (선택)</label>
              <input
                type="text"
                value={editPhotoVideo}
                onChange={e => setEditPhotoVideo(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium"
                placeholder="https://youtu.be/..."
              />
            </div>
            <div>
              <label className="text-2xs text-gray-400 font-bold">대표 태그</label>
              <input
                type="text"
                value={editPhotoTag}
                onChange={e => setEditPhotoTag(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium"
                placeholder="예: 부활절, 수련회"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingPhoto(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button
                onClick={handleSavePhotoEdit}
                disabled={isSavingPhoto || isUploadingEditPhoto}
                className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >
                {isSavingPhoto ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 행사사진 상세 모달 (수정/삭제 연동) ── */}
      {activePhotoModal && (
        <PhotoDetailModal
          photo={activePhotoModal}
          currentUser={currentUser}
          isAdmin={isAdmin}
          renderAuthor={renderAuthor}
          isEditing={!!editingPhoto}
          onClose={() => setActivePhotoModal(null)}
          onLike={(id) => handlePhotoLike(id)}
          onEdit={(photo) => {
            setEditingPhoto(photo)
            setEditPhotoTitle(photo.title)
            setEditPhotoContent(photo.content || '')
            setEditPhotoTag((photo.tags || []).filter(t => t !== '전체')[0] || '')
            setEditPhotoVideo(photo.youtubeUrl || '')
            setEditPhotoImages(photo.imageUrls || [])
          }}
          onDelete={(id) => handleDeletePhoto(id)}
          allUsers={allUsers}
          comments={(photos.find(p => p.id === activePhotoModal.id)?.comments) || []}
          onAddComment={handleAddComment}
          onCommentChanged={handleCommentChanged}
          onCommentError={msg => showToast(msg, true)}
        />
      )}
    </div>
  )
}

function PhotoDetailModal({
  photo,
  currentUser,
  isAdmin,
  renderAuthor,
  isEditing,
  onClose,
  onLike,
  onEdit,
  onDelete,
  allUsers,
  comments,
  onAddComment,
  onCommentChanged,
  onCommentError
}: {
  photo: PostItem
  currentUser: UserProfile
  isAdmin: boolean
  renderAuthor: (authorId?: string, authorName?: string, size?: string) => ReactNode
  /** 수정창이 열려 있으면 이 창은 뒤로 물러납니다 (겹쳐 보이지 않도록) */
  isEditing: boolean
  onClose: () => void
  onLike: (id: string) => void
  onEdit: (photo: PostItem) => void
  onDelete: (id: string) => void
  allUsers: UserProfile[]
  comments: CommentItem[]
  onAddComment: (postId: string, text: string) => void
  onCommentChanged: (postId: string, commentId: string, nextContent: string | null) => void
  onCommentError: (msg: string) => void
}) {
  const videoId = getYouTubeVideoId(photo.youtubeUrl)
  const hasImages = !!(photo.imageUrls && photo.imageUrls.length > 0)
  const images = hasImages
    ? photo.imageUrls!
    : ['https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=800&q=80']
  const [imgIdx, setImgIdx] = useState(0)
  const [toastMsg, setToastMsg] = useState('')

  // 🐛 과거 버그: 사진이 저장되지 않고 그냥 새 탭에 열리기만 했습니다.
  //   브라우저에는 "다른 도메인(=Supabase)의 파일에는 download 지시를 따르지 않는다"는
  //   보안 규칙이 있어서, a.download 가 통째로 무시됐습니다.
  //   전체 저장은 여기에 더해 0.3초 간격으로 새 탭을 여러 개 열려고 해서 팝업 차단까지 걸렸습니다.
  // → download.ts 의 saveImage() 로 처리합니다. (Supabase의 ?download= 신호 + 휴대폰 공유 시트)
  const [isSavingAll, setIsSavingAll] = useState(false)

  // 🐛 과거 버그: 파일명이 항상 bridge_photo_1.jpg 라서, 다른 글의 사진을 받으면
  //    먼저 받은 사진과 이름이 겹쳐 (1) 이 붙거나 덮어써졌습니다.
  // → 글마다 다른 짧은 번호를 넣어 겹치지 않게 합니다.
  const fileNameFor = (n: number) => `bridge_${String(photo.id).replace(/-/g, '').slice(0, 8)}_${n}.jpg`

  const handleDownloadSingle = async () => {
    setToastMsg('📷 저장 중...')
    const ok = await saveImage(images[imgIdx], fileNameFor(imgIdx + 1))
    setToastMsg(ok ? '📷 사진을 저장했습니다' : '⚠️ 저장하지 못했습니다')
    setTimeout(() => setToastMsg(''), 2200)
  }

  const handleDownloadAll = async () => {
    if (isSavingAll) return
    setIsSavingAll(true)
    let saved = 0
    for (let i = 0; i < images.length; i++) {
      setToastMsg(`📦 ${i + 1}/${images.length}장 저장 중...`)
      // 실제로 저장이 시작된 것만 셉니다 — "저장했습니다"가 거짓말이 되지 않도록.
      if (await saveImage(images[i], fileNameFor(i + 1))) saved++
      // 연속으로 너무 빨리 저장하면 브라우저가 뒤쪽을 막습니다.
      if (i < images.length - 1) await new Promise(r => setTimeout(r, 900))
    }
    setIsSavingAll(false)
    setToastMsg(
      saved === images.length
        ? `📦 사진 ${saved}장을 저장했습니다`
        : `⚠️ ${images.length}장 중 ${saved}장만 저장됐습니다`
    )
    setTimeout(() => setToastMsg(''), 3000)
  }

  const canManage = photo.authorId === currentUser.id || isAdmin

  useModalDismiss(true, onClose)

  return (
    <div
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4 transition-all ${
        isEditing ? 'pointer-events-none opacity-40' : ''
      }`}
      aria-hidden={isEditing}
      onClick={backdropClose(onClose)}
    >
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden space-y-3 p-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {toastMsg && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-2xs px-3 py-1.5 rounded-full z-10 font-semibold whitespace-nowrap">{toastMsg}</div>}
        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-gray-900">{photo.title}</h3>
            {/* 누가 언제 올렸는지 — 다른 게시판과 동일한 표기 */}
            <div className="flex items-center gap-1.5 text-2xs text-gray-400 mt-0.5">
              {renderAuthor(photo.authorId, photo.authorName)}
              <span>·</span>
              <span>{photo.createdAt}</span>
            </div>
            {photo.tags && (
              <div className="flex gap-1 mt-0.5">
                {photo.tags.filter(t => t !== '전체').map(t => (
                  <span key={t} className="text-2xs text-[#335f87] font-bold">#{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {canManage && (
              <>
                <button
                  onClick={() => onEdit(photo)}
                  className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                  title="수정"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => onDelete(photo.id)}
                  className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"
                  title="삭제"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button onClick={onClose} className="text-gray-400 font-bold ml-1"><X size={18} /></button>
          </div>
        </div>
        {/* 유튜브 영상 — 있으면 앱 안에서 바로 재생됩니다 */}
        {videoId && (
          <div className="rounded-xl overflow-hidden bg-black aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title={photo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        )}

        {/* 좌우로 밀거나 화살표로 넘길 수 있습니다 (주보 화면과 같은 부품) */}
        {hasImages && <ImageSlider
          images={images}
          index={imgIdx}
          onIndexChange={setImgIdx}
          // 🐛 과거 문제: 사진을 누르면 곧바로 다운로드가 시작됐습니다(주보와 동작이 달랐습니다).
          //    → 주보처럼 "크게 보기"만 하고, 그 화면에서 다시 누르면 닫힙니다.
          onImageClick={() => openImageViewer(images[imgIdx])}
          alt={photo.title}
        />}
        {hasImages && images.length > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {images.map((img, idx) => (
              <button key={idx} onClick={() => setImgIdx(idx)} className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 ${imgIdx === idx ? 'border-[#335f87]' : 'border-transparent'}`}>
                <img src={img} alt="thumb" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {photo.content && (
          <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">
            {photo.content}
          </p>
        )}

        <div className="flex justify-between items-center pt-1 text-xs">
          <button onClick={() => onLike(photo.id)} className="px-3 py-1.5 bg-rose-50 text-rose-600 font-bold rounded-lg flex items-center gap-1">
            <Heart size={14} className="fill-rose-500" /> 좋아요 {photo.likes}
          </button>
          {/* 영상만 올린 글에는 저장할 사진이 없으므로 버튼을 숨깁니다 */}
          {hasImages && (
            <div className="flex gap-1.5">
              <button onClick={handleDownloadSingle} disabled={isSavingAll} className="px-2.5 py-1.5 bg-gray-100 text-gray-700 font-bold rounded-lg text-2xs disabled:opacity-50">📷 이 사진 저장</button>
              <button onClick={handleDownloadAll} disabled={isSavingAll} className="px-2.5 py-1.5 bg-[#335f87] text-white font-bold rounded-lg text-2xs disabled:opacity-50">
                {isSavingAll ? '저장 중...' : `📦 전체 저장 (${images.length}장)`}
              </button>
            </div>
          )}
        </div>

        {/* 댓글 — 기도제목·찬양묵상·가족소식과 같은 공용 부품 */}
        <div className="pt-1 border-t border-gray-100">
          <CommentList
            postId={photo.id}
            comments={comments}
            currentUser={currentUser}
            allUsers={allUsers}
            isAdmin={isAdmin}
            onAddComment={onAddComment}
            onCommentChanged={onCommentChanged}
            onError={onCommentError}
            placeholder="사진에 대한 이야기를 남겨보세요..."
          />
        </div>
      </div>
    </div>
  )
}
