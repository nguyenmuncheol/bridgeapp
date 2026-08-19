'use client'

import { useState, Dispatch, SetStateAction } from 'react'
import { Heart, Filter, Trash2, X, Edit2 } from 'lucide-react'
import { PostItem, UserProfile } from '../../lib/mockData'
import { dbUpdatePost, dbDeletePost } from '../../lib/db'
import { SkeletonList } from '../SkeletonCard'

interface PhotoGalleryProps {
  currentUser: UserProfile
  isAdmin: boolean
  photos: PostItem[]
  setPhotos: Dispatch<SetStateAction<PostItem[]>>
  dynamicTags: string[]
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
export default function PhotoGallery({ currentUser, isAdmin, photos, setPhotos, dynamicTags, isLoading, isLoadingMore, hasMore, onLoadMore, error, onRetry }: PhotoGalleryProps) {
  const [selectedTag, setSelectedTag] = useState('전체')
  const [activePhotoModal, setActivePhotoModal] = useState<PostItem | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<PostItem | null>(null)
  const [editPhotoTitle, setEditPhotoTitle] = useState('')
  const [editPhotoContent, setEditPhotoContent] = useState('')
  const [editPhotoTag, setEditPhotoTag] = useState('')

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // ── 행사사진 좋아요 (그리드/상세 모달 공용, 1인 1회 토글) ──
  const handlePhotoLike = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const target = photos.find(p => p.id === id)
    if (!target) return
    const likedUsers = target.likedUserIds || []
    const isLiked = likedUsers.includes(currentUser.id)
    const newLikes = isLiked ? Math.max(0, target.likes - 1) : target.likes + 1
    const newLikedUsers = isLiked ? likedUsers.filter(uid => uid !== currentUser.id) : [...likedUsers, currentUser.id]

    // 낙관적 UI 업데이트
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, likes: newLikes, likedUserIds: newLikedUsers } : p))
    if (activePhotoModal?.id === id) {
      setActivePhotoModal(prev => prev ? { ...prev, likes: newLikes, likedUserIds: newLikedUsers } : null)
    }
    try {
      const { error } = await dbUpdatePost(id, { likes: newLikes, likedUserIds: newLikedUsers })
      if (error) throw error
    } catch {
      // 실패 시 롤백
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, likes: target.likes, likedUserIds: likedUsers } : p))
      if (activePhotoModal?.id === id) {
        setActivePhotoModal(prev => prev ? { ...prev, likes: target.likes, likedUserIds: likedUsers } : null)
      }
      showToast('좋아요 처리 중 오류가 발생했습니다.', true)
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

    setIsSavingPhoto(true)
    const { error: saveError } = await dbUpdatePost(editingPhoto.id, {
      title: editPhotoTitle.trim(),
      content: editPhotoContent.trim(),
      tags
    })
    setIsSavingPhoto(false)
    if (saveError) {
      showToast('저장하지 못했습니다. 다시 시도해 주세요.', true)
      return
    }

    setPhotos(prev => prev.map(p => p.id === editingPhoto.id
      ? { ...p, title: editPhotoTitle.trim(), content: editPhotoContent.trim(), tags }
      : p
    ))
    if (activePhotoModal?.id === editingPhoto.id) {
      setActivePhotoModal(prev => prev ? { ...prev, title: editPhotoTitle.trim(), content: editPhotoContent.trim(), tags } : null)
    }
    setEditingPhoto(null)
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

  const filteredPhotos = selectedTag === '전체' ? photos : photos.filter(p => p.tags?.includes(selectedTag))

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
          <button key={tag} onClick={() => setSelectedTag(tag)}
            className={`px-3 py-1 rounded-full shrink-0 transition-all text-xs ${selectedTag === tag ? 'bg-[#335f87] text-white font-bold' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>#{tag}</button>
        ))}
      </div>
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">📡</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">사진을 불러오지 못했습니다</p>
            <p className="text-[11px] text-amber-700 mt-0.5">인터넷 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          {onRetry && (
            <button onClick={onRetry} className="px-2.5 py-1.5 bg-amber-600 text-white text-[11px] font-bold rounded-lg shrink-0">다시 시도</button>
          )}
        </div>
      )}
      {isLoading && <SkeletonList count={4} variant="photo" />}
      {!isLoading && filteredPhotos.length === 0 && (
        <div className="py-8 text-center text-xs text-gray-400">
          {selectedTag === '전체' ? '아직 등록된 사진이 없습니다.' : `#${selectedTag} 태그의 사진을 아직 못 찾았어요. ${hasMore ? '더보기를 눌러 더 찾아보세요.' : ''}`}
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
              <img src={photo.imageUrls?.[0]} alt={photo.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
              {photo.imageUrls && photo.imageUrls.length > 1 && (
                <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">+{photo.imageUrls.length - 1}장</span>
              )}
            </div>
            <div className="p-3 space-y-1.5">
              <h4 className="font-bold text-xs text-gray-800 line-clamp-1">{photo.title}</h4>
              {photo.content && (
                <p className="text-[11px] text-gray-500 line-clamp-1 leading-snug">{photo.content}</p>
              )}

              {photo.tags && photo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {photo.tags.filter(t => t !== '전체').map(tag => (
                    <span key={tag} className="text-[9px] bg-blue-50 text-[#335f87] font-bold px-1.5 py-0.5 rounded-md">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex justify-between text-[10px] text-gray-400 items-center pt-1 border-t border-gray-50">
                <span>{photo.createdAt}</span>
                <button
                  onClick={(e) => handlePhotoLike(photo.id, e)}
                  className="flex items-center gap-0.5 text-rose-500 font-bold hover:scale-110 transition-transform active:scale-95"
                >
                  <Heart size={11} className="fill-rose-500" /> {photo.likes}
                </button>
              </div>
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

      {/* ── 행사사진 수정 모달 (z-[70]으로 상세 모달 위로 최상단 배치 + 설명 내용 수정 지원) ── */}
      {editingPhoto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">✏️ 행사사진 정보 수정</h3>
              <button onClick={() => setEditingPhoto(null)} className="text-gray-400 font-bold">✕</button>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold">제목</label>
              <input
                type="text"
                value={editPhotoTitle}
                onChange={e => setEditPhotoTitle(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium"
                placeholder="제목"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold">상세 설명 / 나눔 내용</label>
              <textarea
                rows={3}
                value={editPhotoContent}
                onChange={e => setEditPhotoContent(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none text-gray-900 font-medium"
                placeholder="사진 설명이나 나눔 내용을 적어주세요..."
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold">대표 태그</label>
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
              <button onClick={handleSavePhotoEdit} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
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
          onClose={() => setActivePhotoModal(null)}
          onLike={(id) => handlePhotoLike(id)}
          onEdit={(photo) => {
            setEditingPhoto(photo)
            setEditPhotoTitle(photo.title)
            setEditPhotoContent(photo.content || '')
            setEditPhotoTag((photo.tags || []).filter(t => t !== '전체')[0] || '')
          }}
          onDelete={(id) => handleDeletePhoto(id)}
        />
      )}
    </div>
  )
}

function PhotoDetailModal({
  photo,
  currentUser,
  isAdmin,
  onClose,
  onLike,
  onEdit,
  onDelete
}: {
  photo: PostItem
  currentUser: UserProfile
  isAdmin: boolean
  onClose: () => void
  onLike: (id: string) => void
  onEdit: (photo: PostItem) => void
  onDelete: (id: string) => void
}) {
  const images = photo.imageUrls || ['https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=800&q=80']
  const [imgIdx, setImgIdx] = useState(0)
  const [toastMsg, setToastMsg] = useState('')

  const handleDownloadSingle = () => {
    const a = document.createElement('a')
    a.href = images[imgIdx]
    a.download = `더브릿지_행사사진_${photo.title}_${imgIdx + 1}.jpg`
    a.click()
    setToastMsg(`📷 현재 사진 (${imgIdx + 1}/${images.length}) 다운로드 시작`)
    setTimeout(() => setToastMsg(''), 2000)
  }

  const handleDownloadAll = () => {
    images.forEach((url, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = url
        a.download = `더브릿지_행사사진_${photo.title}_${i + 1}.jpg`
        a.click()
      }, i * 300)
    })
    setToastMsg(`📦 전체 사진 ${images.length}장 다운로드 시작`)
    setTimeout(() => setToastMsg(''), 2000)
  }

  const canManage = photo.authorId === currentUser.id || isAdmin

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden space-y-3 p-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {toastMsg && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[11px] px-3 py-1.5 rounded-full z-10 font-semibold">{toastMsg}</div>}
        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
          <div>
            <h3 className="font-bold text-sm text-gray-900">{photo.title}</h3>
            {photo.tags && (
              <div className="flex gap-1 mt-0.5">
                {photo.tags.filter(t => t !== '전체').map(t => (
                  <span key={t} className="text-[9px] text-[#335f87] font-bold">#{t}</span>
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
        <div className="relative bg-black rounded-xl overflow-hidden min-h-[200px] flex items-center justify-center">
          <img src={images[imgIdx]} alt="photo" className="w-full h-auto max-h-[300px] object-contain" />
          {images.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
              {imgIdx + 1} / {images.length}
            </div>
          )}
        </div>
        {images.length > 1 && (
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
          <div className="flex gap-1.5">
            <button onClick={handleDownloadSingle} className="px-2.5 py-1.5 bg-gray-100 text-gray-700 font-bold rounded-lg text-[11px]">📷 장별 저장</button>
            <button onClick={handleDownloadAll} className="px-2.5 py-1.5 bg-[#335f87] text-white font-bold rounded-lg text-[11px]">📦 전체 저장</button>
          </div>
        </div>
      </div>
    </div>
  )
}
