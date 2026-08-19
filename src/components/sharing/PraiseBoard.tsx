'use client'

import { useState, Dispatch, SetStateAction } from 'react'
import { Play, Trash2, X, ExternalLink, Edit2 } from 'lucide-react'
import { PostItem, UserProfile } from '../../lib/mockData'
import { dbUpdatePost, dbDeletePost } from '../../lib/db'
import { getYouTubeVideoId } from './youtube'
import { SkeletonList } from '../SkeletonCard'

interface PraiseBoardProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  isAdmin: boolean
  praises: PostItem[]
  setPraises: Dispatch<SetStateAction<PostItem[]>>
  isLoading: boolean
  error?: unknown
}

// ── 찬양/묵상나눔 게시판 (유튜브 임베드 + 수정/삭제) ──
export default function PraiseBoard({ currentUser, allUsers, isAdmin, praises, setPraises, isLoading, error }: PraiseBoardProps) {
  const [selectedPraise, setSelectedPraise] = useState<PostItem | null>(null)
  const [editingPraise, setEditingPraise] = useState<PostItem | null>(null)
  const [editPraiseTitle, setEditPraiseTitle] = useState('')
  const [editPraiseContent, setEditPraiseContent] = useState('')

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
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-xs font-bold text-amber-800">목록을 불러오지 못했습니다</p>
          <p className="text-[11px] text-amber-700 mt-0.5">인터넷 상태를 확인한 뒤 다른 탭에 갔다가 돌아와 주세요.</p>
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
              {renderAvatar(praise.authorId, praise.authorName, 'w-6 h-6 text-[10px]')}
              <span className="font-bold text-gray-900">{praise.authorName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">{praise.createdAt}</span>
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

      {/* ── 찬양/묵상 상세 모달 (수정 & 삭제 버튼 포함) ── */}
      {selectedPraise && !editingPraise && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">✏️ 찬양/묵상 수정</h3>
              <button onClick={() => setEditingPraise(null)} className="text-gray-400"><X size={16} /></button>
            </div>
            <input
              type="text"
              value={editPraiseTitle}
              onChange={e => setEditPraiseTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium"
              placeholder="제목"
            />
            <textarea
              rows={4}
              value={editPraiseContent}
              onChange={e => setEditPraiseContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none text-gray-900 font-medium"
              placeholder="내용"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingPraise(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSavePraiseEdit} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
