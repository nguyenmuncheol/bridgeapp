'use client'

import { useState } from 'react'
import { PostItem, UserProfile, getUserDisplayName } from '../../lib/mockData'
import { CHURCH_AUTHOR_ID, CHURCH_AUTHOR_NAME, CHURCH_AVATAR_URL } from '../../lib/churchIdentity'
import { getYouTubeVideoId } from './youtube'
import { dbCreatePost } from '../../lib/db'
import { uploadMultipleImagesToStorage, deleteImagesFromStorage } from '../../lib/storage'
import { useWriteModalGuard } from '../../lib/useModalDismiss'

interface AddPostModalProps {
  subTab: 'prayer' | 'photo' | 'praise'
  currentUser: UserProfile
  isAdmin?: boolean
  dynamicTags: string[]
  isOpen: boolean
  onClose: () => void
  onPrayerCreated: (item: PostItem) => void
  onPraiseCreated: (item: PostItem) => void
  onPhotoCreated: (item: PostItem) => void
}

// ── 나눔 작성 모달 (기도제목/찬양·묵상/행사사진 공용, 모달별 최적 비율 레이아웃 및 새로고침/이탈 완벽 방지) ──
export default function AddPostModal({
  subTab,
  currentUser,
  isAdmin = false,
  dynamicTags,
  isOpen,
  onClose,
  onPrayerCreated,
  onPraiseCreated,
  onPhotoCreated
}: AddPostModalProps) {
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [selectedTagChip, setSelectedTagChip] = useState('') // 자동 기본 선택 제거
  const [customTag, setCustomTag] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; isUploading: boolean } | null>(null)
  const [postAsChurch, setPostAsChurch] = useState(false) // 교회 이름으로 올리기

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const hasUnsaved = Boolean(newTitle.trim() || newContent.trim() || photoFiles.length > 0)

  const resetAndClose = () => {
    photoPreviews.forEach(url => { try { URL.revokeObjectURL(url) } catch { /* 무시 */ } })
    setNewTitle(''); setNewContent(''); setIsSecret(false); setYoutubeUrl(''); setSelectedTagChip(''); setCustomTag(''); setPhotoFiles([]); setPhotoPreviews([])
    setUploadProgress(null)
    setErrorMsg('')
    setPostAsChurch(false)
    onClose()
  }

  // 모바일 풀-투-리프레시 차단, 뒤로가기 안전 차단, 브라우저 새로고침 경고
  useWriteModalGuard(isOpen, hasUnsaved, resetAndClose)

  if (!isOpen) return null

  const handleCloseRequest = () => {
    if (hasUnsaved) {
      if (!confirm('작성 중인 내용이 있습니다. 정말 창을 닫으시겠습니까?\n작성 중인 내용은 저장되지 않습니다.')) {
        return
      }
    }
    resetAndClose()
  }

  // ── 교회 이름으로 올리기: 저자 정보 결정 (DB author_id는 UUID이므로 currentUser.id 유지) ──
  const resolvedAuthorId   = currentUser.id
  const resolvedAuthorName = postAsChurch ? CHURCH_AUTHOR_NAME : getUserDisplayName(currentUser)
  const resolvedAuthorAvatar = postAsChurch ? CHURCH_AVATAR_URL : undefined

  // ── 새 게시물 작성 (진행률 및 압축 지원) ──
  const handleCreate = async () => {
    if (isSubmitting) return
    setErrorMsg('')

    // 🐛 과거 버그: 제목/내용이 비면 그냥 `return` 해서 **아무 일도 안 일어났습니다.**
    // 오류 메시지도, 빨간 테두리도 없어서 사진 8장을 올린 어르신이 등록 버튼을
    // 계속 누르다 앱을 닫는 상황이 생겼습니다.
    if (!newTitle.trim()) {
      setErrorMsg('제목을 입력해 주세요.')
      return
    }
    if (subTab !== 'photo' && !newContent.trim()) {
      setErrorMsg('내용을 입력해 주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      if (subTab === 'prayer') {
        const res = await dbCreatePost({
          authorId: resolvedAuthorId,
          authorName: resolvedAuthorName,
          authorAvatar: resolvedAuthorAvatar,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: 'PRAYER',
          isSecret
        })
        // 🐛 과거 버그: 저장 실패 시 임시 id(`pr_...`)를 붙여 목록에 얹었습니다.
        // 성도는 등록된 줄 알고 앱을 닫지만 실제로는 아무도 못 보고, 새로고침하면 사라집니다.
        if (res.error || !res.data?.id) {
          setErrorMsg('등록하지 못했습니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요.')
          return
        }
        onPrayerCreated({
          id: res.data.id,
          authorId: resolvedAuthorId,
          authorName: resolvedAuthorName,
          authorAvatar: resolvedAuthorAvatar,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: 'PRAYER',
          createdAt: '방금 전',
          likes: 0,
          isSecret,
          isCompleted: false,
          comments: []
        })
      } else if (subTab === 'praise') {
        const res = await dbCreatePost({
          authorId: resolvedAuthorId,
          authorName: resolvedAuthorName,
          authorAvatar: resolvedAuthorAvatar,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: 'PRAISE',
          youtubeUrl: youtubeUrl.trim() || undefined
        })
        if (res.error || !res.data?.id) {
          setErrorMsg('등록하지 못했습니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요.')
          return
        }
        onPraiseCreated({
          id: res.data.id,
          authorId: resolvedAuthorId,
          authorName: resolvedAuthorName,
          authorAvatar: resolvedAuthorAvatar,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: 'PRAISE',
          youtubeUrl: youtubeUrl.trim() || undefined,
          createdAt: '방금 전',
          likes: 0
        })
      } else {
        // ── 행사사진 업로드 (진행률 및 자동 압축) ──
        const tag = customTag.trim() || selectedTagChip || '행사'
        let uploadedImageUrls: string[] = []

        if (photoFiles.length > 0) {
          setUploadProgress({ current: 0, total: photoFiles.length, isUploading: true })
          try {
            uploadedImageUrls = await uploadMultipleImagesToStorage(
              photoFiles,
              'photos',
              (completed, total) => setUploadProgress({ current: completed, total, isUploading: true })
            )
          } catch (err: unknown) {
            // 🐛 과거 버그: 업로드가 실패해도 조용히 base64 글자 덩어리를 넣어 저장했습니다.
            setUploadProgress(null)
            const msg = (err as { message?: string })?.message || '사진 업로드에 실패했습니다.'
            setErrorMsg(msg)
            return
          }
          setUploadProgress(null)
        }

        // 행사사진은 **유튜브 주소만** 받습니다.
        // (찬양/묵상은 아무 웹주소나 받지만, 여기서는 영상만 올리기로 정했습니다)
        const photoVideo = youtubeUrl.trim()
        if (photoVideo && !getYouTubeVideoId(photoVideo)) {
          setErrorMsg('유튜브 주소만 넣을 수 있습니다. 주소를 다시 확인해 주세요.')
          return
        }

        // 사진이 없어도 영상이 있으면 등록할 수 있습니다. 둘 다 없으면 올릴 게 없습니다.
        if (uploadedImageUrls.length === 0 && !photoVideo) {
          setErrorMsg('사진을 한 장 이상 고르거나, 유튜브 주소를 넣어 주세요.')
          return
        }

        const res = await dbCreatePost({
          authorId: resolvedAuthorId,
          authorName: resolvedAuthorName,
          authorAvatar: resolvedAuthorAvatar,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: 'PHOTO',
          imageUrls: uploadedImageUrls,
          youtubeUrl: photoVideo || undefined,
          tags: ['전체', tag]
        })
        if (res.error || !res.data?.id) {
          // 글 저장이 실패했으면 방금 올린 사진들은 아무도 참조하지 않는 쓰레기가 되므로 정리합니다.
          await deleteImagesFromStorage(uploadedImageUrls).catch(() => {})
          setErrorMsg('등록하지 못했습니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요.')
          return
        }
        onPhotoCreated({
          id: res.data.id,
          authorId: resolvedAuthorId,
          authorName: resolvedAuthorName,
          authorAvatar: resolvedAuthorAvatar,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: 'PHOTO',
          imageUrls: uploadedImageUrls,
          youtubeUrl: photoVideo || undefined,
          tags: ['전체', tag],
          createdAt: '방금 전',
          likes: 0,
          comments: []
        })
      }
      resetAndClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 overscroll-contain"
      onClick={e => e.stopPropagation()}
    >
      <div className={`bg-white rounded-3xl w-full flex flex-col shadow-2xl overflow-hidden overscroll-contain max-h-[85vh] ${
        subTab === 'photo' ? 'max-w-lg' : 'max-w-md'
      }`}>
        {/* 상단 고정 헤더 (제목 + 명시적 닫기 버튼) */}
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100 bg-gray-50/80 shrink-0">
          <h3 className="font-bold text-sm sm:text-base text-gray-900">
            {subTab === 'prayer' ? '🙏 기도제목 작성' : subTab === 'praise' ? '🎵 찬양/묵상나눔 작성' : '📸 사진 업로드하기'}
          </h3>
          <button
            type="button"
            onClick={handleCloseRequest}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-all font-bold text-base cursor-pointer"
            title="닫기"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* ── 관리자 전용: 교회 이름으로 올리기 토글 ── */}
        {isAdmin && (
          <div
            className={`px-5 py-2.5 flex items-center gap-3 cursor-pointer select-none border-b transition-colors ${
              postAsChurch
                ? 'bg-blue-50 border-blue-100'
                : 'bg-gray-50/60 border-gray-100'
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
            <label className="block text-2xs font-bold text-gray-500 mb-1">제목</label>
            <input
              type="text"
              placeholder={subTab === 'photo' ? '행사/사진 제목 입력' : '제목을 입력해 주세요'}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
            />
          </div>

          <div className="flex-1 flex flex-col">
            <label className="block text-2xs font-bold text-gray-500 mb-1">
              {subTab === 'photo' ? '상세 설명 (선택사항)' : '상세 내용'}
            </label>
            <textarea
              rows={subTab === 'photo' ? 4 : 7}
              placeholder={subTab === 'photo' ? '사진에 대한 이야기나 설명을 적어주세요...' : '내용을 자유롭고 편안하게 작성해 주세요...'}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              className={`w-full text-xs sm:text-sm p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] resize-y text-gray-900 font-medium leading-relaxed ${
                subTab === 'photo' ? 'min-h-[90px] max-h-[160px]' : 'min-h-[140px] max-h-[260px]'
              }`}
            />
          </div>

          {subTab === 'prayer' && (
            <label className="flex items-center gap-2 text-xs text-gray-600 font-medium bg-purple-50/50 p-2.5 rounded-xl border border-purple-100/50 cursor-pointer">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={e => setIsSecret(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <span>🔒 비밀글로 등록 (목회자/리더만 열람 가능)</span>
            </label>
          )}

          {subTab === 'praise' && (
            <div className="space-y-1 bg-gray-50/70 p-3 rounded-xl border border-gray-200/60">
              <label className="block text-2xs font-bold text-gray-600">영상 또는 웹페이지 주소 (선택)</label>
              <input
                type="text"
                placeholder="https://youtu.be/... 또는 웹페이지 URL"
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                className="w-full text-xs p-2.5 bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
              />
              <p className="text-2xs text-gray-400 leading-relaxed px-0.5">
                유튜브 주소를 넣으면 앱 안에서 바로 재생되고, 그 외 주소는 새 창에서 열립니다.
              </p>
            </div>
          )}

          {subTab === 'photo' && (
            <div className="space-y-3 text-xs">
              <div className="space-y-1 bg-gray-50/70 p-3 rounded-xl border border-gray-200/60">
                <label className="block text-gray-700 font-semibold">🎬 유튜브 영상 주소 (선택)</label>
                <input
                  type="text"
                  placeholder="https://youtu.be/..."
                  value={youtubeUrl}
                  onChange={e => setYoutubeUrl(e.target.value)}
                  className="w-full p-2.5 bg-white rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                />
                <p className="text-2xs text-gray-400 leading-relaxed px-0.5">
                  유튜브 주소만 됩니다. 사진 없이 영상만 올려도 괜찮습니다.
                </p>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">📸 사진 파일 선택 (최대 10장)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={e => {
                    const files = e.target.files
                    if (!files) return
                    const all = Array.from(files)
                    const arr = all.slice(0, 10)
                    if (all.length > 10) setErrorMsg('사진은 한 번에 최대 10장까지 올릴 수 있어 앞의 10장만 선택했습니다.')
                    photoPreviews.forEach(url => { try { URL.revokeObjectURL(url) } catch { /* 무시 */ } })
                    setPhotoFiles(arr)
                    setPhotoPreviews(arr.map(f => URL.createObjectURL(f)))
                  }}
                  className="w-full text-xs p-2 bg-gray-50 rounded-xl border border-gray-200"
                />
              </div>

              {photoPreviews.length > 0 && (
                <div className="flex gap-2 overflow-x-auto py-1">
                  {photoPreviews.map((src, i) => (
                    <div key={i} className="relative shrink-0">
                      <img src={src} alt="preview" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => {
                          try { URL.revokeObjectURL(src) } catch { /* 무시 */ }
                          setPhotoFiles(prev => prev.filter((_, idx) => idx !== i))
                          setPhotoPreviews(prev => prev.filter((_, idx) => idx !== i))
                        }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800/80 text-white rounded-full text-2xs font-bold flex items-center justify-center cursor-pointer"
                        aria-label="이 사진 빼기"
                      >✕</button>
                    </div>
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
                            className={`px-2.5 py-1 rounded-lg border text-2xs font-semibold transition-all ${
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
                  className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none text-gray-900 font-medium"
                />
                <p className="text-2xs text-gray-400 mt-0.5">추천 태그를 누르거나 직접 새 태그를 입력하세요.</p>
              </div>

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
                  <p className="text-2xs text-gray-500">고화질 사진을 최적 용량으로 자동 압축하고 있습니다.</p>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <p className="text-xs text-rose-700 font-semibold">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* 하단 고정 액션 버튼 영역 */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex gap-2 shrink-0">
          <button
            type="button"
            disabled={isSubmitting || uploadProgress?.isUploading}
            onClick={handleCloseRequest}
            className="flex-1 py-3 bg-gray-200/80 hover:bg-gray-300/80 text-gray-700 text-xs font-semibold rounded-xl disabled:opacity-50 transition-all cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isSubmitting || uploadProgress?.isUploading}
            onClick={handleCreate}
            className="flex-1 py-3 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            {uploadProgress?.isUploading ? '업로드 중...' : isSubmitting ? '등록 중...' : '등록하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
