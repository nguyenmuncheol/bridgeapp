'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { PostItem, UserProfile } from '../../lib/mockData'
import { dbFetchPosts, dbFetchDistinctTags } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { usePaginatedPosts } from '../../lib/usePaginatedPosts'
import PrayerBoard, { sortPrayers } from './PrayerBoard'
import PraiseBoard from './PraiseBoard'
import PhotoGallery from './PhotoGallery'
import AddPostModal from './AddPostModal'

interface SharingTabProps {
  currentUser: UserProfile
  allUsers?: UserProfile[]
}

// ── 나눔 탭: 기도제목 | 행사사진 | 찬양/묵상나눔 3개 서브탭 + 작성 모달 ──
// 각 서브탭은 별도 컴포넌트(PrayerBoard/PhotoGallery/PraiseBoard)로 분리되어 있으며,
// 목록 데이터(prayers/praises/photos)는 작성 모달과 공유해야 하므로 이 오케스트레이터가 소유합니다.
// 탭 전환 시 입력 중이던 댓글 등 UI 상태가 유지되도록 언마운트 대신 CSS로 숨김 처리합니다.
//
// 기도제목/행사사진은 전체를 한 번에 불러오지 않고 "더보기" 버튼으로 20개씩 이어서 불러옵니다
// (usePaginatedPosts). 찬양/묵상나눔은 아직 게시물 수가 적어 기존 방식(useCachedQuery, 전체 조회)을
// 유지했습니다 — 나중에 필요해지면 같은 패턴으로 전환하면 됩니다.
export default function SharingTab({ currentUser, allUsers = [] }: SharingTabProps) {
  const [subTab, setSubTab] = useState<'prayer' | 'photo' | 'praise'>('prayer')
  const isAdmin = currentUser.role === 'ADMIN'

  const [praises, setPraises] = useState<PostItem[]>([])
  const [showAddModal, setShowAddModal] = useState(false)

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
  } = usePaginatedPosts('PHOTO')

  // ── 찬양/묵상나눔: 게시물이 적어 기존 전체 조회 캐시 방식 유지 ──
  const { data: praisePosts, isLoading: praisesLoading, error: praisesError } = useCachedQuery('posts:PRAISE', () => dbFetchPosts('PRAISE'))
  useEffect(() => {
    if (praisePosts && praisePosts.length > 0) setPraises(praisePosts)
  }, [praisePosts])

  // 태그 필터 칩은 photos(페이지네이션으로 일부만 로드됨)가 아니라 전체 태그를 별도로 가볍게 조회
  const { data: dynamicTagsData, refetch: refetchTags } = useCachedQuery('postTags:PHOTO', () => dbFetchDistinctTags('PHOTO'))
  const dynamicTags = useMemo(() => ['전체', ...(dynamicTagsData || [])], [dynamicTagsData])

  return (
    <div className="space-y-4 pb-6 relative">
      {/* 서브탭 */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold">
        <button onClick={() => setSubTab('prayer')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'prayer' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🙏 기도제목</button>
        <button onClick={() => setSubTab('photo')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'photo' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>📸 행사사진</button>
        <button onClick={() => setSubTab('praise')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'praise' ? 'bg-[#335f87] text-white font-bold' : 'text-gray-500'}`}>🎵 찬양/묵상나눔</button>
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
        <PraiseBoard currentUser={currentUser} allUsers={allUsers} isAdmin={isAdmin} praises={praises} setPraises={setPraises} isLoading={praisesLoading && praises.length === 0} error={praisesError} />
      </div>
      <div className={subTab === 'photo' ? '' : 'hidden'}>
        <PhotoGallery
          currentUser={currentUser}
          allUsers={allUsers}
          isAdmin={isAdmin}
          photos={photos}
          setPhotos={setPhotos}
          dynamicTags={dynamicTags}
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
