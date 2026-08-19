'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageSliderProps {
  images: string[]
  /** 현재 보고 있는 장 번호(0부터). 부모가 다운로드 등에 쓰기 위해 넘겨받습니다. */
  index: number
  onIndexChange: (idx: number) => void
  /** 사진을 탭했을 때 할 일 (예: 원본 새 창에서 열기). 없으면 탭해도 아무 일 없음 */
  onImageClick?: () => void
  alt?: string
  /** 이미지 높이 제한 (Tailwind 클래스). 주보는 좀 더 크게 봅니다. */
  maxHeightClass?: string
  /** 배경색 클래스 (사진은 검정, 주보는 흰색이 보기 좋습니다) */
  bgClass?: string
}

/**
 * 여러 장 이미지를 좌우로 넘겨 보는 공용 부품.
 *
 * 🐛 과거 불편: 행사사진과 주보 모두 "아래 작은 썸네일(또는 1면/2면 버튼)을 정확히 눌러야만"
 * 다음 장으로 넘어갔습니다. 썸네일은 40px이라 어르신에게 너무 작고, 휴대폰에서 사진을
 * 좌우로 미는 동작(누구나 아는 조작)은 아무 반응이 없었습니다.
 *
 * → 화살표 버튼(44px) + 손가락으로 밀기 + 키보드 좌우, 세 가지를 한 번에 지원합니다.
 *   행사사진과 주보가 같은 부품을 쓰므로 조작법이 항상 동일합니다.
 */
export default function ImageSlider({
  images,
  index,
  onIndexChange,
  onImageClick,
  alt = '이미지',
  maxHeightClass = 'max-h-[300px]',
  bgClass = 'bg-black',
}: ImageSliderProps) {
  const total = images.length
  // 사진이 삭제되는 등으로 장 수가 줄면 범위를 벗어날 수 있어 항상 보정합니다.
  const safeIndex = total === 0 ? 0 : Math.min(Math.max(index, 0), total - 1)

  const go = (next: number) => {
    if (total === 0) return
    onIndexChange(Math.min(Math.max(next, 0), total - 1))
  }

  // ── 손가락으로 밀어서 넘기기 ──
  // 50px 이상 옆으로 움직였을 때만 넘깁니다(살짝 흔들린 것과 구분).
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const [moved, setMoved] = useState(false)

  const handleTouchStart = (e: any) => {
    const t = e.touches?.[0]
    if (!t) return
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
    setMoved(false)
  }
  const handleTouchEnd = (e: any) => {
    const startX = touchStartX.current
    const startY = touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    if (startX === null || startY === null) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    // 세로로 더 많이 움직였으면 화면 스크롤이므로 넘기지 않습니다.
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
    setMoved(true)
    go(dx < 0 ? safeIndex + 1 : safeIndex - 1)
  }

  // ── 컴퓨터에서 키보드 좌우 ──
  useEffect(() => {
    if (total <= 1) return
    const onKey = (e: any) => {
      if (e.key === 'ArrowLeft') go(safeIndex - 1)
      else if (e.key === 'ArrowRight') go(safeIndex + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, total])

  if (total === 0) return null

  const atFirst = safeIndex === 0
  const atLast = safeIndex === total - 1

  return (
    <div className="space-y-2">
      <div
        className={`relative ${bgClass} rounded-xl overflow-hidden min-h-[200px] flex items-center justify-center select-none`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={images[safeIndex]}
          alt={`${alt} ${safeIndex + 1}`}
          onClick={() => { if (!moved) onImageClick?.() }}
          className={`w-full h-auto ${maxHeightClass} object-contain ${onImageClick ? 'cursor-zoom-in' : ''}`}
          draggable={false}
        />

        {total > 1 && (
          <>
            <button
              onClick={() => go(safeIndex - 1)}
              disabled={atFirst}
              aria-label="이전 사진"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center disabled:opacity-25 transition-all active:scale-95"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={() => go(safeIndex + 1)}
              disabled={atLast}
              aria-label="다음 사진"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center disabled:opacity-25 transition-all active:scale-95"
            >
              <ChevronRight size={22} />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
              {safeIndex + 1} / {total}
            </div>
          </>
        )}
      </div>

      {total > 1 && (
        <p className="text-[11px] text-center text-gray-400">
          좌우로 밀거나 화살표를 눌러 넘겨 보세요
        </p>
      )}
    </div>
  )
}
