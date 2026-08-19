'use client'

import { useState, useMemo, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { PostItem, UserProfile } from '../../lib/mockData'
import { dbFetchDistinctTags } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { usePaginatedPosts } from '../../lib/usePaginatedPosts'
import PrayerBoard, { sortPrayers } from './PrayerBoard'
import PraiseBoard from './PraiseBoard'
import PhotoGallery from './PhotoGallery'
import AddPostModal from './AddPostModal'

interface SharingTabProps {
  currentUser: UserProfile
  allUsers?: UserProfile[]
  /** 알림을 눌러서 들어온 경우 열어야 할 서브탭 ('prayer' | 'photo' | 'praise') */
  openSubTab?: string
  /** 같은 서브탭을 연달아 요청해도 다시 열리도록 하는 번호표 */
  openToken?: number
}

// ── 나눔 탭: 기도제목 | 행사사진 | 찬양/묵상나눔 3개 서브탭 + 작성 모달 ──
// 각 서브탭은 별도 컴포넌트(PrayerBoard/PhotoGallery/PraiseBoard)로 분리되어 있으며,
// 목록 데이터(prayers/praises/photos)는 작성 모달과 공유해야 하므로 이 오케스트레이터가 소유합니다.
// 탭 전환 시 입력 중이던 댓글 등 UI 상태가 유지되도록 언마운트 대신 CSS로 숨김 처리합니다.
//
// 기도제목/행사사진은 전체를 한 번에 불러오지 않고 "더보기" 버튼으로 20개씩 이어서 불러옵니다
// (usePaginatedPosts). 찬양/묵상나눔도 댓글 기능이 들어가면서 같은 방식으로 전환했습니다.
//
// 행사사진의 태그 필터는 이 컴포넌트가 소유합니다 — 선택된 태그가 곧 서버 조회 조건이라
// (이미 불러온 사진 안에서 거르는 게 아니라) 여기서 관리해야 페이지네이션과 맞물립니다.
export default function SharingTab({ currentUser, allUsers = [], openSubTab = '', openToken = 0 }: SharingTabProps) {
  const [subTab, setSubTab] = useState<'prayer' | 'photo' | 'praise'>('prayer')

  // 서브탭을 바꿀 때도 화면 맨 위에서 시작합니다(큰 탭과 동일한 규칙).
  const goSubTab = (next: 'prayer' | 'photo' | 'praise') => {
    setSubTab(next)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' })
  }
  // 알림에서 들어온 경우 그 글이 있는 서브탭을 열어 줍니다.
  useEffect(() => {
    if (openSubTab === 'prayer' || openSubTab === 'photo' || openSubTab === 'praise') {
      goSubTab(openSubTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openToken, openSubTab])

  const isAdmin = currentUser.role === 'ADMIN'

  const [showAddModal, setShowAddModal] = useState(false)
  // 행사사진 태그 필터. 서버 조회 조건이 되므로 여기(오케스트레이터)가 소유합니다.
  const [selectedTag, setSelectedTag] = useState('전체')

  // ── 기도제목: 더보기 페이지네이션 ──
  const {
    items: rawPrayers,
    setItems: setPrayers,
    isLoading: prayersLoading,
    isLoadingMore: prayersLoadingMore,
    hasMore: prayersHasMore,
    error: prayersError,
    loadMore: loadMorePrayers,
    retry: retryPrayers
  } = usePaginatedPosts('PRAYER')
  // 고정글/기도중 우선 정렬은 항상 이 시점에 다시 계산 — setPrayers로 뭘 넣든 순서는 자동으로 맞음
  const prayers = useMemo(() => sortPrayers(rawPrayers), [rawPrayers])

  // ── 행사사진: 더보기 페이지네이션 ──
  const {
    items: photos,
    setItems: setPhotos,
    isLoading: photosLoading,
    isLoadingMore: photosLoadingMore,
    hasMore: photosHasMore,
    error: photosError,
    loadMore: loadMorePhotos,
    retry: retryPhotos
  } = usePaginatedPosts('PHOTO', { tag: selectedTag })

  // ── 찬양/묵상나눔: 댓글 기능이 들어가면서 다른 게시판과 동일한 "더보기" 방식으로 전환 ──
  // (예전에는 전체를 한 번에 불러왔습니다. 댓글까지 붙으면 글이 쌓일수록 느려집니다)
  const {
    items: praises,
    setItems: setPraises,
    isLoading: praisesLoading,
    isLoadingMore: praisesLoadingMore,
    hasMore: praisesHasMore,
    error: praisesError,
    loadMore: loadMorePraises,
    retry: retryPraises
  } = usePaginatedPosts('PRAISE')

  // 태그 필터 칩은 photos(페이지네이션으로 일부만 로드됨)가 아니라 전체 태그를 별도로 가볍게 조회
  const { data: dynamicTagsData, refetch: refetchTags } = useCachedQuery('postTags:PHOTO', () => dbFetchDistinctTags('PHOTO'))
  const dynamicTags = useMemo(() => ['전체', ...(dynamicTagsData || [])], [dynamicTagsData])

  return (
    <div className="space-y-4 pb-6 relative">
      {/* 서브탭 */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold">
        <button onClick={() => goSubTab('prayer')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'prayer' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🙏 기도제목</button>
        <button onClick={() => goSubTab('photo')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'photo' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>📸 행사사진</button>
        <button onClick={() => goSubTab('praise')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'praise' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🎵 찬양/묵상나눔</button>
      </div>

      <div className={subTab === 'prayer' ? '' : 'hidden'}>
        <PrayerBoard
          currentUser={currentUser}
          allUsers={allUsers}
          isAdmin={isAdmin}
          prayers={prayers}
          setPrayers={setPrayers}
          isLoading={prayersLoading}
          isLoadingMore={prayersLoadingMore}
          hasMore={prayersHasMore}
          onLoadMore={loadMorePrayers}
          error={prayersError}
          onRetry={retryPrayers}
        />
      </div>
      <div className={subTab === 'praise' ? '' : 'hidden'}>
        <PraiseBoard
          currentUser={currentUser}
          allUsers={allUsers}
          isAdmin={isAdmin}
          praises={praises}
          setPraises={setPraises}
          isLoading={praisesLoading}
          isLoadingMore={praisesLoadingMore}
          hasMore={praisesHasMore}
          onLoadMore={loadMorePraises}
          error={praisesError}
          onRetry={retryPraises}
        />
      </div>
      <div className={subTab === 'photo' ? '' : 'hidden'}>
        <PhotoGallery
          currentUser={currentUser}
          allUsers={allUsers}
          isAdmin={isAdmin}
          photos={photos}
          setPhotos={setPhotos}
          dynamicTags={dynamicTags}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          isLoading={photosLoading}
          isLoadingMore={photosLoadingMore}
          hasMore={photosHasMore}
          onLoadMore={loadMorePhotos}
          error={photosError}
          onRetry={retryPhotos}
        />
      </div>

      {/* 플로팅 + 버튼 */}
      <button onClick={() => setShowAddModal(true)} className="fixed bottom-20 right-6 sm:right-[calc(50%-200px)] bg-[#914c24] text-white p-3.5 rounded-full shadow-lg hover:bg-[#763710] z-40">
        <Plus size={22} />
      </button>

      {/* ── 작성 모달 (기도제목/찬양·묵상/행사사진 공용) ── */}
      <AddPostModal
        subTab={subTab}
        currentUser={currentUser}
        dynamicTags={dynamicTags}
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onPrayerCreated={(item) => setPrayers(prev => [item, ...prev])}
        onPraiseCreated={(item) => setPraises(prev => [item, ...prev])}
        onPhotoCreated={(item) => {
          setPhotos(prev => [item, ...prev])
          // 🐛 과거 버그: 새로 만든 태그가 필터 칩 목록에 바로 안 떴습니다.
          // (캐시를 stale로만 표시할 뿐, 이미 떠 있는 화면은 갱신하지 않기 때문)
          refetchTags().catch(() => {})
        }}
      />
    </div>
  )
}
