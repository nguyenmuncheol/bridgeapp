'use client'

// 데이터 로딩 중 "아직 없습니다" 같은 빈 상태 문구가 잠깐 잘못 노출되는 걸 막기 위한
// 공용 스켈레톤 카드. 실제 카드와 비슷한 크기의 회색 블록을 펄스 애니메이션으로 보여줍니다.
// Tailwind의 기본 `animate-pulse` 유틸(별도 설정 없이 동작)만 사용합니다.
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-gray-200" />
        <div className="h-3 w-20 bg-gray-200 rounded" />
      </div>
      <div className="h-3.5 w-3/4 bg-gray-200 rounded" />
      <div className="space-y-1.5">
        <div className="h-2.5 w-full bg-gray-100 rounded" />
        <div className="h-2.5 w-5/6 bg-gray-100 rounded" />
      </div>
    </div>
  )
}

// 사진 그리드용 스켈레톤(2열 그리드의 정사각형 카드 형태)
export function SkeletonPhotoCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-2xs animate-pulse">
      <div className="h-32 bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-2/3 bg-gray-200 rounded" />
        <div className="h-2.5 w-1/2 bg-gray-100 rounded" />
      </div>
    </div>
  )
}

interface SkeletonListProps {
  count?: number
  variant?: 'card' | 'photo'
}

// count개만큼 스켈레톤을 나열. 사진 그리드는 grid-cols-2와 함께 쓰도록 variant="photo" 지정.
export function SkeletonList({ count = 3, variant = 'card' }: SkeletonListProps) {
  const items = Array.from({ length: count })
  if (variant === 'photo') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {items.map((_, i) => <SkeletonPhotoCard key={i} />)}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {items.map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}
