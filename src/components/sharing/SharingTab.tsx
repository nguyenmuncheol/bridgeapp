'use client'

import { useState, useEffect, useMemo } from 'react'
import { Heart, Lock, Play, Plus, Filter, Trash2, Pin, CheckCircle2, X, ExternalLink, Edit2 } from 'lucide-react'
import { PostItem, UserProfile, getUserDisplayName } from '../../lib/mockData'
import { dbFetchPosts, dbCreatePost, dbUpdatePost, dbDeletePost, dbAddComment } from '../../lib/db'
import { uploadMultipleImagesToStorage } from '../../lib/storage'

// 유튜브 비디오 ID 추출 헬퍼 함수 (watch?v=, youtu.be/, shorts/ 등 완벽 지원)
function getYouTubeVideoId(url?: string): string | null {
  if (!url) return null
  const trimmed = url.trim()
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/
  const match = trimmed.match(regExp)
  return (match && match[2].length === 11) ? match[2] : null
}

interface SharingTabProps {
  currentUser: UserProfile
  allUsers?: UserProfile[]
}

export default function SharingTab({ currentUser, allUsers = [] }: SharingTabProps) {
  const [subTab, setSubTab] = useState<'prayer' | 'photo' | 'praise'>('prayer')
  const isAdmin = currentUser.role === 'ADMIN'

  // 실시간 아바타 렌더러 헬퍼
  const renderAvatar = (authorId: string, authorName: string, size = 'w-6 h-6 text-[10px]') => {
    const user = allUsers.find(u => u.id === authorId || u.name === authorName)
    return (
      <div className={`${size} rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden`}>
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          (authorName || '성').slice(0, 1)
        )}
      </div>
    )
  }

  // ── 기도제목 ──
  const [prayers, setPrayers] = useState<PostItem[]>([])
  const [prayerComments, setPrayerComments] = useState<Record<string, string>>({})
  const [editingPrayer, setEditingPrayer] = useState<PostItem | null>(null)
  const [editPrayerTitle, setEditPrayerTitle] = useState('')
  const [editPrayerContent, setEditPrayerContent] = useState('')
  const [editPrayerIsSecret, setEditPrayerIsSecret] = useState(false)
  const [editPrayerIsCompleted, setEditPrayerIsCompleted] = useState(false)

  // ── 찬양/묵상나눔 ──
  const [praises, setPraises] = useState<PostItem[]>([])
  const [selectedPraise, setSelectedPraise] = useState<PostItem | null>(null)
  const [editingPraise, setEditingPraise] = useState<PostItem | null>(null)
  const [editPraiseTitle, setEditPraiseTitle] = useState('')
  const [editPraiseContent, setEditPraiseContent] = useState('')

  // ── 행사사진 ──
  const [photos, setPhotos] = useState<PostItem[]>([])

  // ── 에러/토스트 상태 ──
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }
  const [selectedTag, setSelectedTag] = useState('전체')
  const [activePhotoModal, setActivePhotoModal] = useState<PostItem | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<PostItem | null>(null)
  const [editPhotoTitle, setEditPhotoTitle] = useState('')
  const [editPhotoContent, setEditPhotoContent] = useState('')
  const [editPhotoTag, setEditPhotoTag] = useState('')

  // ── 업로드 진행률 상태 (1번, 2번) ──
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; isUploading: boolean } | null>(null)

  // ── 작성 모달 ──
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [selectedTagChip, setSelectedTagChip] = useState('') // 자동 기본 선택 제거
  const [customTag, setCustomTag] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  // 1번 항목: 실제 게시물(photos)에 등록된 태그들만 동적으로 추출
  const dynamicTags = useMemo(() => {
    const tagSet = new Set<string>()
    photos.forEach(p => {
      (p.tags || []).forEach(t => {
        const clean = t.trim()
        if (clean && clean !== '전체') tagSet.add(clean)
      })
    })
    return ['전체', ...Array.from(tagSet)]
  }, [photos])

  const sortPrayers = (list: PostItem[]) =>
    [...list].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      if (!a.isCompleted && b.isCompleted) return -1
      if (a.isCompleted && !b.isCompleted) return 1
      return 0
    })

  // Supabase DB에서 게시글 로드
  useEffect(() => {
    dbFetchPosts('PRAYER').then(dbPrayers => {
      if (dbPrayers && dbPrayers.length > 0) {
        setPrayers(sortPrayers(dbPrayers))
      }
    })

    dbFetchPosts('PRAISE').then(dbPraises => {
      if (dbPraises && dbPraises.length > 0) {
        setPraises(dbPraises)
      }
    })

    dbFetchPosts('PHOTO').then(dbPhotos => {
      if (dbPhotos && dbPhotos.length > 0) {
        setPhotos(dbPhotos)
      }
    })
  }, [])

  const handleAmen = async (id: string) => {
    const target = prayers.find(p => p.id === id)
    if (!target) return
    const likedUsers = target.likedUserIds || []
    const isLiked = likedUsers.includes(currentUser.id)
    const newLikes = isLiked ? Math.max(0, target.likes - 1) : target.likes + 1
    const newLikedUsers = isLiked ? likedUsers.filter(uid => uid !== currentUser.id) : [...likedUsers, currentUser.id]

    // 낙관적 UI 업데이트
    setPrayers(prev => sortPrayers(prev.map(p => p.id === id ? { ...p, likes: newLikes, likedUserIds: newLikedUsers } : p)))
    try {
      const { error } = await dbUpdatePost(id, { likes: newLikes, likedUserIds: newLikedUsers })
      if (error) throw error
    } catch {
      // 실패 시 원래 상태로 롤백
      setPrayers(prev => sortPrayers(prev.map(p => p.id === id ? { ...p, likes: target.likes, likedUserIds: likedUsers } : p)))
      showToast('아멘 처리 중 오류가 발생했습니다.', true)
    }
  }

  const handlePin = async (id: string) => {
    if (!isAdmin) return
    const target = prayers.find(p => p.id === id)
    if (!target) return
    const newPin = !target.isPinned
    setPrayers(prev => sortPrayers(prev.map(p => p.id === id ? { ...p, isPinned: newPin } : p)))
    await dbUpdatePost(id, { isPinned: newPin })
  }

  const handleAddComment = async (prayerId: string) => {
    const text = prayerComments[prayerId]?.trim()
    if (!text) return
    // 낙관적 UI: 먼저 화면에 추가
    const tempId = `c_${Date.now()}`
    setPrayers(prev => prev.map(p => p.id === prayerId ? {
      ...p,
      comments: [...(p.comments || []), { id: tempId, authorName: getUserDisplayName(currentUser), content: text, createdAt: '방금 전' }]
    } : p))
    setPrayerComments(p => ({ ...p, [prayerId]: '' }))
    try {
      const { error } = await dbAddComment(prayerId, currentUser.id, getUserDisplayName(currentUser), text)
      if (error) throw error
    } catch {
      // 실패 시 추가된 댓글 롤백
      setPrayers(prev => prev.map(p => p.id === prayerId ? {
        ...p,
        comments: (p.comments || []).filter(c => c.id !== tempId)
      } : p))
      showToast('댓글 등록 중 오류가 발생했습니다.', true)
    }
  }

  const handleDeletePost = async (id: string, type: 'prayer' | 'photo' | 'praise') => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await dbDeletePost(id)
    if (type === 'prayer') setPrayers(p => p.filter(x => x.id !== id))
    else if (type === 'photo') {
      setPhotos(p => p.filter(x => x.id !== id))
      if (activePhotoModal?.id === id) setActivePhotoModal(null)
    } else {
      setPraises(p => p.filter(x => x.id !== id))
      if (selectedPraise?.id === id) setSelectedPraise(null)
    }
  }

  // ── 기도제목 수정 저장 ──
  const handleSavePrayerEdit = async () => {
    if (!editingPrayer) return
    await dbUpdatePost(editingPrayer.id, {
      title: editPrayerTitle.trim(),
      content: editPrayerContent.trim(),
      isSecret: editPrayerIsSecret,
      isCompleted: editPrayerIsCompleted
    })
    setPrayers(prev => sortPrayers(prev.map(p => p.id === editingPrayer.id
      ? { ...p, title: editPrayerTitle.trim(), content: editPrayerContent.trim(), isSecret: editPrayerIsSecret, isCompleted: editPrayerIsCompleted }
      : p
    )))
    setEditingPrayer(null)
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

  // ── 행사사진 수정 저장 (내용 포함) ──
  const handleSavePhotoEdit = async () => {
    if (!editingPhoto) return
    const tags = ['전체', editPhotoTag.trim() || '행사']
    await dbUpdatePost(editingPhoto.id, {
      title: editPhotoTitle.trim(),
      content: editPhotoContent.trim(),
      tags
    })
    setPhotos(prev => prev.map(p => p.id === editingPhoto.id
      ? { ...p, title: editPhotoTitle.trim(), content: editPhotoContent.trim(), tags }
      : p
    ))
    if (activePhotoModal?.id === editingPhoto.id) {
      setActivePhotoModal(prev => prev ? { ...prev, title: editPhotoTitle.trim(), content: editPhotoContent.trim(), tags } : null)
    }
    setEditingPhoto(null)
  }

  // ── 행사사진 그리드 좋아요 (1인 1회 토글) ──
  const handlePhotoLike = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
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

  // ── 새 게시물 작성 (진행률 및 압축 지원) ──
  const handleCreate = async () => {
    if (!newTitle.trim()) return

    if (subTab === 'prayer') {
      if (!newContent.trim()) return
      const res = await dbCreatePost({
        authorId: currentUser.id,
        authorName: getUserDisplayName(currentUser),
        title: newTitle.trim(),
        content: newContent.trim(),
        category: 'PRAYER',
        isSecret
      })
      const np: PostItem = {
        id: res.data?.id || `pr_${Date.now()}`,
        authorId: currentUser.id,
        authorName: getUserDisplayName(currentUser),
        title: newTitle.trim(),
        content: newContent.trim(),
        category: 'PRAYER',
        createdAt: '방금 전',
        likes: 0,
        isSecret,
        isCompleted: false,
        comments: []
      }
      setPrayers(prev => sortPrayers([np, ...prev]))
    } else if (subTab === 'praise') {
      if (!newContent.trim()) return
      const res = await dbCreatePost({
        authorId: currentUser.id,
        authorName: getUserDisplayName(currentUser),
        title: newTitle.trim(),
        content: newContent.trim(),
        category: 'PRAISE',
        youtubeUrl: youtubeUrl.trim() || undefined
      })
      const np: PostItem = {
        id: res.data?.id || `ps_${Date.now()}`,
        authorId: currentUser.id,
        authorName: getUserDisplayName(currentUser),
        title: newTitle.trim(),
        content: newContent.trim(),
        category: 'PRAISE',
        youtubeUrl: youtubeUrl.trim() || undefined,
        createdAt: '방금 전',
        likes: 0
      }
      setPraises(prev => [np, ...prev])
    } else {
      // ── 행사사진 업로드 (진행률 및 자동 압축) ──
      const tag = customTag.trim() || selectedTagChip || '행사'
      let uploadedImageUrls: string[] = ['https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=800&q=80']
      
      if (photoFiles.length > 0) {
        setUploadProgress({ current: 0, total: photoFiles.length, isUploading: true })
        uploadedImageUrls = await uploadMultipleImagesToStorage(
          photoFiles,
          'photos',
          (completed, total) => {
            setUploadProgress({ current: completed, total, isUploading: true })
          }
        )
      }

      const res = await dbCreatePost({
        authorId: currentUser.id,
        authorName: getUserDisplayName(currentUser),
        title: newTitle.trim(),
        content: newContent.trim(),
        category: 'PHOTO',
        imageUrls: uploadedImageUrls,
        tags: ['전체', tag]
      })
      const np: PostItem = {
        id: res.data?.id || `ph_${Date.now()}`,
        authorId: currentUser.id,
        authorName: getUserDisplayName(currentUser),
        title: newTitle.trim(),
        content: newContent.trim(),
        category: 'PHOTO',
        imageUrls: uploadedImageUrls,
        tags: ['전체', tag],
        createdAt: '방금 전',
        likes: 0,
        comments: []
      }
      setPhotos(prev => [np, ...prev])
      setUploadProgress(null)
    }
    setNewTitle(''); setNewContent(''); setIsSecret(false); setYoutubeUrl(''); setSelectedTagChip(''); setCustomTag(''); setPhotoFiles([]); setPhotoPreviews([]); setShowAddModal(false)
  }

  const filteredPhotos = selectedTag === '전체' ? photos : photos.filter(p => p.tags?.includes(selectedTag))

  return (
    <div className="space-y-4 pb-6 relative">
      {/* 토스트 메시지 */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}
      {/* 서브탭 */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold">
        <button onClick={() => setSubTab('prayer')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'prayer' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🙏 기도제목</button>
        <button onClick={() => setSubTab('photo')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'photo' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>📸 행사사진</button>
        <button onClick={() => setSubTab('praise')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'praise' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🎵 찬양/묵상나눔</button>
      </div>
      {subTab === 'prayer' && (
        <div className="space-y-3">
          {prayers.map(prayer => (
            <div key={prayer.id} className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-3 transition-all ${prayer.isCompleted ? 'bg-gray-50/70 border-gray-100 opacity-80' : 'border-blue-50'}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  {renderAvatar(prayer.authorId, prayer.authorName, 'w-6 h-6 text-[10px]')}
                  <span className="font-bold text-xs text-gray-900">{prayer.authorName}</span>
                  {prayer.isSecret && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><Lock size={10} /> 비밀글</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  {isAdmin && (
                    <button onClick={() => handlePin(prayer.id)} className={`p-1 rounded hover:bg-gray-100 ${prayer.isPinned ? 'text-amber-500 font-bold' : 'text-gray-300'}`} title="상단 고정">
                      <Pin size={13} className={prayer.isPinned ? 'fill-amber-500' : ''} />
                    </button>
                  )}
                  {(prayer.authorId === currentUser.id || isAdmin) && (
                    <>
                      <button
                        onClick={() => {
                          setEditingPrayer(prayer)
                          setEditPrayerTitle(prayer.title)
                          setEditPrayerContent(prayer.content)
                          setEditPrayerIsSecret(!!prayer.isSecret)
                          setEditPrayerIsCompleted(!!prayer.isCompleted)
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="수정"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeletePost(prayer.id, 'prayer')}
                        className="p-1 text-gray-400 hover:text-rose-500"
                        title="삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-snug text-gray-900">{prayer.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{prayer.content}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs">
                <span className="text-[11px] text-gray-400">{prayer.createdAt}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleAmen(prayer.id)} className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg flex items-center gap-1">
                    <Heart size={12} className="fill-amber-500 text-amber-500" /> 아멘 ({prayer.likes})
                  </button>
                  {prayer.isCompleted && <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5"><CheckCircle2 size={10} /> 응답 완료</span>}
                </div>
              </div>
              {prayer.comments && prayer.comments.length > 0 && (
                <div className="bg-gray-50 p-2.5 rounded-xl space-y-1.5 text-xs">
                  {prayer.comments.map(c => (
                    <div key={c.id} className="flex justify-between items-start text-[11px]">
                      <div className="flex items-center gap-1.5 flex-1">
                        {renderAvatar('', c.authorName, 'w-4 h-4 text-[8px]')}
                        <span className="font-bold text-gray-800 shrink-0">{c.authorName}:</span>
                        <span className="text-gray-600 ml-1">{c.content}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0 ml-1">{c.createdAt}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="함께 기도하는 마음(댓글)을 나누세요..."
                  value={prayerComments[prayer.id] || ''}
                  onChange={e => setPrayerComments({ ...prayerComments, [prayer.id]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddComment(prayer.id)}
                  className="flex-1 text-xs p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none"
                />
                <button onClick={() => handleAddComment(prayer.id)} className="px-3 py-1 bg-[#335f87] text-white text-xs font-bold rounded-lg">등록</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 찬양/묵상나눔 (수정 & 삭제 지원) ── */}
      {subTab === 'praise' && (
        <div className="space-y-4">
          {praises.map(praise => (
            <div
              key={praise.id}
              onClick={() => setSelectedPraise(praise)}
              className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2 cursor-pointer hover:border-blue-200 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {renderAvatar(praise.authorId, praise.authorName, 'w-6 h-6 text-[10px]')}
                  <span className="font-bold text-gray-900">{praise.authorName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">{praise.createdAt}</span>
                  {(praise.authorId === currentUser.id || isAdmin) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletePost(praise.id, 'praise')
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
                <div className="text-[11px] text-[#335f87] font-semibold flex items-center gap-1 opacity-60">탭하여 전체 내용 보기 →</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 행사사진 (실제 게시물 동적 태그 연동) ── */}
      {subTab === 'photo' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <Filter size={14} className="text-gray-400 shrink-0" />
            {dynamicTags.map(tag => (
              <button key={tag} onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1 rounded-full shrink-0 transition-all text-xs ${selectedTag === tag ? 'bg-[#335f87] text-white font-bold' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>#{tag}</button>
            ))}
          </div>
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

                  {/* 7번 항목: 그리드 상태에서 태그 뱃지 노출 */}
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
        </div>
      )}

      {/* 플로팅 + 버튼 */}
      <button onClick={() => setShowAddModal(true)} className="fixed bottom-20 right-6 sm:right-[calc(50%-200px)] bg-[#914c24] text-white p-3.5 rounded-full shadow-lg hover:bg-[#763710] z-40">
        <Plus size={22} />
      </button>

      {/* ── 기도제목 수정 모달 ── */}
      {editingPrayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">✏️ 기도제목 수정</h3>
              <button onClick={() => setEditingPrayer(null)} className="text-gray-400"><X size={16} /></button>
            </div>
            <input
              type="text"
              value={editPrayerTitle}
              onChange={e => setEditPrayerTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
              placeholder="기도제목"
            />
            <textarea
              rows={4}
              value={editPrayerContent}
              onChange={e => setEditPrayerContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none"
              placeholder="내용"
            />
            <label className="flex items-center gap-2 text-xs text-gray-600 font-medium">
              <input
                type="checkbox"
                checked={editPrayerIsSecret}
                onChange={e => setEditPrayerIsSecret(e.target.checked)}
              />
              비밀글로 등록 (목회자/리더만 열람)
            </label>
            {/* 작성자 / 관리자 전용 응답 완료 처리 버튼 */}
            {(editingPrayer.authorId === currentUser.id || isAdmin) && (
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs">
                <div>
                  <p className="font-bold text-amber-900 text-xs">기도 응답 상태</p>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    {editPrayerIsCompleted ? '현재 응답 완료 상태입니다' : '현재 기도 중 상태입니다'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditPrayerIsCompleted(prev => !prev)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                    editPrayerIsCompleted
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {editPrayerIsCompleted ? '✅ 응답 완료됨' : '🙏 응답 완료로 변경'}
                </button>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingPrayer(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSavePrayerEdit} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
            </div>
          </div>
        </div>
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
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
                placeholder="제목"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold">상세 설명 / 나눔 내용</label>
              <textarea
                rows={3}
                value={editPhotoContent}
                onChange={e => setEditPhotoContent(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none"
                placeholder="사진 설명이나 나눔 내용을 적어주세요..."
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-bold">대표 태그</label>
              <input
                type="text"
                value={editPhotoTag}
                onChange={e => setEditPhotoTag(e.target.value)}
                className="w-full mt-1 text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
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

      {/* ── 찬양/묵상 상세 모달 (수정 & 삭제 버튼 포함) ── */}
      {selectedPraise && !editingPraise && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden max-h-[85vh] overflow-y-auto">
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{selectedPraise.title}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">{selectedPraise.authorName} · {selectedPraise.createdAt}</p>
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
                        onClick={() => handleDeletePost(selectedPraise.id, 'praise')}
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
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-md">
                        <iframe
                          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                          title={selectedPraise.title || 'YouTube video'}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      </div>
                    ) : (
                      <div className="bg-black rounded-xl p-4 text-white text-center space-y-2">
                        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center mx-auto">
                          <Play size={18} className="ml-0.5 fill-white" />
                        </div>
                        <p className="text-xs font-semibold">유튜브 영상 링크</p>
                      </div>
                    )}
                    <a
                      href={selectedPraise.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-600 hover:underline flex items-center justify-center gap-1 font-semibold py-0.5"
                    >
                      <ExternalLink size={11} /> 유튜브 앱/웹에서 직접 열기
                    </a>
                  </div>
                )
              })()}
              <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">{selectedPraise.content}</p>
              <button onClick={() => setSelectedPraise(null)} className="w-full py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 찬양/묵상 수정 모달 ── */}
      {editingPraise && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">✏️ 찬양/묵상 수정</h3>
              <button onClick={() => setEditingPraise(null)} className="text-gray-400"><X size={16} /></button>
            </div>
            <input
              type="text"
              value={editPraiseTitle}
              onChange={e => setEditPraiseTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
              placeholder="제목"
            />
            <textarea
              rows={4}
              value={editPraiseContent}
              onChange={e => setEditPraiseContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none"
              placeholder="내용"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingPraise(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSavePraiseEdit} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
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
          onLike={(id) => {
            setPhotos(prev => prev.map(p => p.id === id ? { ...p, likes: p.likes + 1 } : p))
            setActivePhotoModal(prev => prev ? { ...prev, likes: prev.likes + 1 } : null)
          }}
          onEdit={(photo) => {
            setEditingPhoto(photo)
            setEditPhotoTitle(photo.title)
            setEditPhotoContent(photo.content || '')
            setEditPhotoTag((photo.tags || []).filter(t => t !== '전체')[0] || '')
          }}
          onDelete={(id) => handleDeletePost(id, 'photo')}
        />
      )}

      {/* ── 작성 모달 (사진 업로드 진행률 및 압축 안내) ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-900">
              {subTab === 'prayer' ? '🙏 기도제목 작성' : subTab === 'praise' ? '🎵 찬양/묵상나눔 작성' : '📸 사진 업로드하기'}
            </h3>
            <input
              type="text"
              placeholder={subTab === 'photo' ? '행사/사진 제목 입력' : '제목 입력'}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
            />
            <textarea
              rows={3}
              placeholder={subTab === 'photo' ? '사진에 대한 이야기나 설명을 적어주세요...' : '상세 내용 입력'}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none"
            />
            {subTab === 'prayer' && <label className="flex items-center gap-2 text-xs text-gray-600 font-medium"><input type="checkbox" checked={isSecret} onChange={e => setIsSecret(e.target.checked)} /> 비밀글로 등록 (목회자/리더만 열람)</label>}
            {subTab === 'praise' && <input type="text" placeholder="유튜브 URL (선택사항)" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none" />}
            {subTab === 'photo' && (
              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">📸 사진 파일 선택 (최대 10장)</label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={e => {
                      const files = e.target.files
                      if (!files) return
                      const arr = Array.from(files)
                      setPhotoFiles(arr)
                      const previews = arr.map(f => URL.createObjectURL(f))
                      setPhotoPreviews(previews)
                    }}
                    className="w-full text-xs p-2 bg-gray-50 rounded-xl border border-gray-200"
                  />
                </div>
                {photoPreviews.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto py-1">
                    {photoPreviews.map((src, i) => (
                      <img key={i} src={src} alt="preview" className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0" />
                    ))}
                  </div>
                )}
                {(() => {
                  const availableTags = dynamicTags.filter(t => t !== '전체')
                  if (availableTags.length === 0) return null
                  return (
                    <div>
                      <p className="text-gray-600 font-semibold mb-1">기존 태그 추천 (선택사항)</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {availableTags.map(tag => {
                          const isSelected = selectedTagChip === tag
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setSelectedTagChip(isSelected ? '' : tag)}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                                isSelected ? 'bg-[#335f87] text-white shadow-2xs' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              #{tag} {isSelected && '✓'}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">태그 직접 입력</label>
                  <input
                    type="text"
                    placeholder="예: 크리스마스, 라브리, 유아부, 수련회"
                    value={customTag}
                    onChange={e => setCustomTag(e.target.value)}
                    className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">추천 태그를 누르거나 직접 새 태그를 입력하세요.</p>
                </div>

                {/* 1번, 2번: 실시간 업로드 진행률 바 */}
                {uploadProgress?.isUploading && (
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl space-y-2 mt-2">
                    <div className="flex justify-between items-center text-xs font-bold text-[#335f87]">
                      <span>🖼️ 사진 압축 및 업로드 중...</span>
                      <span>{uploadProgress.current} / {uploadProgress.total}장</span>
                    </div>
                    <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#335f87] h-full transition-all duration-300 rounded-full"
                        style={{ width: `${uploadProgress.total > 0 ? Math.round((uploadProgress.current / uploadProgress.total) * 100) : 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500">고화질 사진을 최적 용량으로 자동 압축하고 있습니다.</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                disabled={uploadProgress?.isUploading}
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl disabled:opacity-50"
              >
                취소
              </button>
              <button
                disabled={uploadProgress?.isUploading}
                onClick={handleCreate}
                className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {uploadProgress?.isUploading ? '업로드 중...' : '등록하기'}
              </button>
            </div>
          </div>
        </div>
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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

        {/* 3번 항목: 행사사진 상세 설명 본문 노출 */}
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
