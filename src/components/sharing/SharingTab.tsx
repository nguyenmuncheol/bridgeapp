'use client'

import { useState } from 'react'
import { Heart, Lock, Play, Plus, Filter, Trash2, Pin, CheckCircle2, X, ExternalLink, Edit2 } from 'lucide-react'
import { PostItem, UserProfile, INITIAL_PRAYERS, INITIAL_PRAISES, INITIAL_PHOTOS } from '../../lib/mockData'

interface SharingTabProps {
  currentUser: UserProfile
}

export default function SharingTab({ currentUser }: SharingTabProps) {
  const [subTab, setSubTab] = useState<'prayer' | 'photo' | 'praise'>('prayer')
  const isAdmin = currentUser.role === 'ADMIN'

  // ── 기도제목 ──
  const [prayers, setPrayers] = useState<PostItem[]>(
    [...INITIAL_PRAYERS].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      if (!a.isCompleted && b.isCompleted) return -1
      if (a.isCompleted && !b.isCompleted) return 1
      return 0
    })
  )
  const [prayerComments, setPrayerComments] = useState<Record<string, string>>({})

  // ── 찬양/묵상나눔 ──
  const [praises, setPraises] = useState<PostItem[]>(INITIAL_PRAISES)
  const [selectedPraise, setSelectedPraise] = useState<PostItem | null>(null)
  const [editingPraise, setEditingPraise] = useState<PostItem | null>(null)
  const [editPraiseTitle, setEditPraiseTitle] = useState('')
  const [editPraiseContent, setEditPraiseContent] = useState('')

  // ── 행사사진 ──
  const [photos, setPhotos] = useState<PostItem[]>(INITIAL_PHOTOS)
  const [selectedTag, setSelectedTag] = useState('전체')
  const [activePhotoModal, setActivePhotoModal] = useState<PostItem | null>(null)

  // ── 작성 모달 ──
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [selectedTagChip, setSelectedTagChip] = useState('부활절')
  const [customTag, setCustomTag] = useState('')

  const existingTags = ['전체', '부활절', '전교인수련회', '라브리행사', '유아부행사']

  const sortPrayers = (list: PostItem[]) =>
    [...list].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      if (!a.isCompleted && b.isCompleted) return -1
      if (a.isCompleted && !b.isCompleted) return 1
      return 0
    })

  const handleAmen = (id: string) => {
    setPrayers(prev => sortPrayers(prev.map(p => {
      if (p.id !== id) return p
      const likedUsers = p.likedUserIds || []
      if (likedUsers.includes(currentUser.id)) {
        return { ...p, likes: Math.max(0, p.likes - 1), likedUserIds: likedUsers.filter(uid => uid !== currentUser.id) }
      } else {
        return { ...p, likes: p.likes + 1, likedUserIds: [...likedUsers, currentUser.id] }
      }
    })))
  }

  const handlePin = (id: string) => {
    if (!isAdmin) return
    setPrayers(prev => sortPrayers(prev.map(p => p.id === id ? { ...p, isPinned: !p.isPinned } : p)))
  }

  const handleAddComment = (prayerId: string) => {
    const text = prayerComments[prayerId]?.trim()
    if (!text) return
    setPrayers(prev => prev.map(p => p.id === prayerId ? {
      ...p,
      comments: [...(p.comments || []), { id: `c_${Date.now()}`, authorName: currentUser.name, content: text, createdAt: '방금 전' }]
    } : p))
    setPrayerComments(p => ({ ...p, [prayerId]: '' }))
  }

  const handleDeletePost = (id: string, type: 'prayer' | 'photo') => {
    if (type === 'prayer') setPrayers(p => p.filter(x => x.id !== id))
    else setPhotos(p => p.filter(x => x.id !== id))
  }

  // ── 찬양/묵상 수정 저장 ──
  const handleSavePraiseEdit = () => {
    if (!editingPraise) return
    setPraises(prev => prev.map(p => p.id === editingPraise.id
      ? { ...p, title: editPraiseTitle, content: editPraiseContent }
      : p
    ))
    setEditingPraise(null)
    setSelectedPraise(null)
  }

  // ── 행사사진 그리드 좋아요 (1인 1회 토글) ──
  const handlePhotoLike = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPhotos(prev => prev.map(p => {
      if (p.id !== id) return p
      const likedUsers = p.likedUserIds || []
      if (likedUsers.includes(currentUser.id)) {
        return { ...p, likes: Math.max(0, p.likes - 1), likedUserIds: likedUsers.filter(uid => uid !== currentUser.id) }
      } else {
        return { ...p, likes: p.likes + 1, likedUserIds: [...likedUsers, currentUser.id] }
      }
    }))
    if (activePhotoModal?.id === id) {
      setActivePhotoModal(prev => {
        if (!prev) return null
        const likedUsers = prev.likedUserIds || []
        const isLiked = likedUsers.includes(currentUser.id)
        return {
          ...prev,
          likes: isLiked ? Math.max(0, prev.likes - 1) : prev.likes + 1,
          likedUserIds: isLiked ? likedUsers.filter(uid => uid !== currentUser.id) : [...likedUsers, currentUser.id]
        }
      })
    }
  }

  const handleCreate = () => {
    if (!newTitle.trim() || !newContent.trim()) return
    if (subTab === 'prayer') {
      const np: PostItem = { id: `p_${Date.now()}`, authorId: currentUser.id, authorName: currentUser.name, title: newTitle, content: newContent, category: 'PRAYER', createdAt: '방금 전', likes: 0, isSecret, isCompleted: false, comments: [] }
      setPrayers(prev => sortPrayers([np, ...prev]))
    } else if (subTab === 'praise') {
      const np: PostItem = { id: `pr_${Date.now()}`, authorId: currentUser.id, authorName: currentUser.name, title: newTitle, content: newContent, category: 'PRAISE', youtubeUrl: youtubeUrl.trim() || undefined, createdAt: '방금 전', likes: 0 }
      setPraises(prev => [np, ...prev])
    } else {
      const tag = customTag.trim() || selectedTagChip
      const np: PostItem = { id: `ph_${Date.now()}`, authorId: currentUser.id, authorName: currentUser.name, title: newTitle, content: newContent, category: 'PHOTO', imageUrls: ['https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=800&q=80'], tags: ['전체', tag], createdAt: '방금 전', likes: 0, comments: [] }
      setPhotos(prev => [np, ...prev])
    }
    setNewTitle(''); setNewContent(''); setIsSecret(false); setYoutubeUrl(''); setCustomTag(''); setShowAddModal(false)
  }

  const filteredPhotos = selectedTag === '전체' ? photos : photos.filter(p => p.tags?.includes(selectedTag))

  return (
    <div className="space-y-4 pb-6">
      {/* 서브탭 */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold">
        <button onClick={() => setSubTab('prayer')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'prayer' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🙏 기도제목</button>
        <button onClick={() => setSubTab('photo')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'photo' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>📸 행사사진</button>
        <button onClick={() => setSubTab('praise')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'praise' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🎵 찬양/묵상나눔</button>
      </div>

      {/* ── 기도제목 ── */}
      {subTab === 'prayer' && (
        <div className="space-y-3">
          {prayers.map(prayer => (
            <div key={prayer.id} className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-3 transition-all ${prayer.isCompleted ? 'bg-gray-50/70 border-gray-100 opacity-80' : 'border-blue-50'}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-gray-900">{prayer.authorName}</span>
                  {prayer.isSecret && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><Lock size={10} /> 비밀글</span>}
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <button onClick={() => handlePin(prayer.id)} className={`p-1 rounded hover:bg-gray-100 ${prayer.isPinned ? 'text-amber-500 font-bold' : 'text-gray-300'}`} title="상단 고정">
                      <Pin size={13} className={prayer.isPinned ? 'fill-amber-500' : ''} />
                    </button>
                  )}
                  {(prayer.authorId === currentUser.id || isAdmin) && (
                    <button onClick={() => handleDeletePost(prayer.id, 'prayer')} className="p-1 text-gray-300 hover:text-rose-500"><Trash2 size={13} /></button>
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
                      <span className="font-bold text-gray-800 shrink-0">{c.authorName}:</span>
                      <span className="text-gray-600 flex-1 ml-1.5">{c.content}</span>
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

      {/* ── 찬양/묵상나눔 (전체보기 텍스트 제거 → 카드 클릭으로 상세 모달) ── */}
      {subTab === 'praise' && (
        <div className="space-y-4">
          {praises.map(praise => (
            <div
              key={praise.id}
              onClick={() => setSelectedPraise(praise)}
              className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2 cursor-pointer hover:border-blue-200 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-900">{praise.authorName}</span>
                <span className="text-[11px] text-gray-400">{praise.createdAt}</span>
              </div>
              <h3 className="font-bold text-sm text-gray-900">{praise.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{praise.content}</p>
              {praise.youtubeUrl ? (() => {
                const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
                const match = praise.youtubeUrl.match(regExp)
                const videoId = (match && match[2].length === 11) ? match[2] : null
                const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
                return (
                  <div className="relative rounded-xl overflow-hidden bg-slate-900 group/yt">
                    {thumbUrl ? (
                      <div className="h-36 relative">
                        <img src={thumbUrl} alt="YouTube thumbnail" className="w-full h-full object-cover opacity-90 group-hover/yt:scale-105 transition-all" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg"><Play size={18} className="ml-0.5" /></div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 text-white text-center flex items-center gap-2">
                        <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shrink-0"><Play size={14} className="ml-0.5" /></div>
                        <span className="text-xs font-semibold">유튜브 영상 – 클릭하여 재생</span>
                      </div>
                    )}
                  </div>
                )
              })() : (
                // 전체보기 텍스트 제거 — 클릭으로 상세 모달 오픈
                <div className="text-[11px] text-[#335f87] font-semibold flex items-center gap-1 opacity-60">탭하여 전체 내용 보기 →</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 행사사진 (그리드 좋아요 즉시 클릭) ── */}
      {subTab === 'photo' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <Filter size={14} className="text-gray-400 shrink-0" />
            {existingTags.map(tag => (
              <button key={tag} onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1 rounded-full shrink-0 transition-all text-xs ${selectedTag === tag ? 'bg-[#335f87] text-white font-bold' : 'bg-white text-gray-600 border border-gray-200'}`}>#{tag}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {filteredPhotos.map(photo => (
              <div
                key={photo.id}
                onClick={() => setActivePhotoModal(photo)}
                className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-2xs cursor-pointer group relative"
              >
                <div className="h-32 bg-gray-100 overflow-hidden relative">
                  <img src={photo.imageUrls?.[0]} alt={photo.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                  {photo.imageUrls && photo.imageUrls.length > 1 && (
                    <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">+{photo.imageUrls.length - 1}장</span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <h4 className="font-bold text-xs text-gray-800 line-clamp-1">{photo.title}</h4>
                  <div className="flex justify-between text-[10px] text-gray-400 items-center">
                    <span>{photo.createdAt}</span>
                    {/* 그리드에서 즉시 좋아요 클릭 */}
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

      {/* ── 찬양/묵상 상세 모달 (수정 버튼 포함) ── */}
      {selectedPraise && !editingPraise && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden max-h-[85vh] overflow-y-auto">
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{selectedPraise.title}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">{selectedPraise.authorName} · {selectedPraise.createdAt}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* 작성자/관리자: 수정 버튼 */}
                  {(selectedPraise.authorId === currentUser.id || isAdmin) && (
                    <button
                      onClick={() => {
                        setEditingPraise(selectedPraise)
                        setEditPraiseTitle(selectedPraise.title)
                        setEditPraiseContent(selectedPraise.content)
                      }}
                      className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                      title="수정"
                    ><Edit2 size={14} /></button>
                  )}
                  <button onClick={() => setSelectedPraise(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                </div>
              </div>
              {selectedPraise.youtubeUrl && (
                <div className="bg-black rounded-xl p-4 text-white text-center space-y-2">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center mx-auto"><Play size={20} className="ml-0.5" /></div>
                  <p className="text-xs">유튜브 영상 재생</p>
                  <a href={selectedPraise.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-300 underline flex items-center justify-center gap-1">
                    <ExternalLink size={11} /> 유튜브에서 열기
                  </a>
                </div>
              )}
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
              rows={5}
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

      {/* ── 행사사진 상세 모달 ── */}
      {activePhotoModal && (
        <PhotoDetailModal
          photo={activePhotoModal}
          onClose={() => setActivePhotoModal(null)}
          onLike={(id) => {
            setPhotos(prev => prev.map(p => p.id === id ? { ...p, likes: p.likes + 1 } : p))
            setActivePhotoModal(prev => prev ? { ...prev, likes: prev.likes + 1 } : null)
          }}
        />
      )}

      {/* ── 작성 모달 ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-900">
              {subTab === 'prayer' ? '🙏 기도제목 작성' : subTab === 'praise' ? '🎵 찬양/묵상나눔 작성' : '📸 사진 업로드하기'}
            </h3>
            <input type="text" placeholder="제목 입력" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none" />
            <textarea rows={3} placeholder="상세 내용 입력" value={newContent} onChange={e => setNewContent(e.target.value)} className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none" />
            {subTab === 'prayer' && <label className="flex items-center gap-2 text-xs text-gray-600 font-medium"><input type="checkbox" checked={isSecret} onChange={e => setIsSecret(e.target.checked)} /> 비밀글로 등록 (목회자/리더만 열람)</label>}
            {subTab === 'praise' && <input type="text" placeholder="유튜브 URL (선택사항)" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none" />}
            {subTab === 'photo' && (
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-center text-[#335f87]">📷 사진 선택 및 업로드</div>
                <div>
                  <p className="text-gray-600 font-semibold mb-1">기존 태그 선택</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {['부활절', '전교인수련회', '라브리행사'].map(tag => (
                      <button key={tag} type="button" onClick={() => setSelectedTagChip(tag)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${selectedTagChip === tag ? 'bg-[#335f87] text-white' : 'bg-gray-50 text-gray-600'}`}>#{tag}</button>
                    ))}
                  </div>
                </div>
                <input type="text" placeholder="직접 태그 입력 (예: 성탄절)" value={customTag} onChange={e => setCustomTag(e.target.value)} className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none" />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl">취소</button>
              <button onClick={handleCreate} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">등록하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoDetailModal({ photo, onClose, onLike }: { photo: PostItem; onClose: () => void; onLike: (id: string) => void }) {
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

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden space-y-3 p-4 shadow-2xl relative">
        {toastMsg && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[11px] px-3 py-1.5 rounded-full z-10 font-semibold">{toastMsg}</div>}
        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
          <h3 className="font-bold text-sm text-gray-900">{photo.title}</h3>
          <button onClick={onClose} className="text-gray-400 font-bold">✕</button>
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
