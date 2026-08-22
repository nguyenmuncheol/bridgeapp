'use client'

import { useEffect, useState, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useModalDismiss } from '../lib/useModalDismiss'
import { saveImage } from '../lib/download'

interface ImageViewerModalProps {
  isOpen: boolean
  images: string[]
  initialIndex?: number
  onClose: () => void
  alt?: string
}

/**
 * 인앱 전체화면 사진 뷰어 (라이트박스)
 *
 * 🐛 기존 문제: window.open 새 창으로 띄우고 창을 닫을 때,
 * 브라우저 탭/창이 닫히면서 클릭 좌표에 있던 뒷 배경의 버튼(좋아요, 저장, 수정, 네비게이션 등)이
 * 연쇄 클릭(ghost click/click bleeding)되는 현상이 발생했습니다.
 *
 * → 최상위 z-[100] 인앱 모달로 띄우고, 모든 클릭 이벤트에 e.stopPropagation()을 적용하여
 * 뒷 배경으로의 클릭 투과를 100% 원천 차단합니다.
 */
export default function ImageViewerModal({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
  alt = '사진 크게 보기'
}: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [toastMsg, setToastMsg] = useState('')
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const isSwipingRef = useRef(false)

  // 열릴 때 인덱스 동기화
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0)))
    }
  }, [isOpen, initialIndex, images.length])

  // 모바일 스크롤 및 풀-투-리프레시 잠금
  useEffect(() => {
    if (!isOpen) return
    const prevBodyOverflow = document.body.style.overflow
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehaviorY = 'none'

    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.body.style.overscrollBehaviorY = prevBodyOverscroll
    }
  }, [isOpen])

  // 키보드 조작 (ESC 닫기, 방향키 이동)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        setCurrentIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        setCurrentIndex(prev => Math.min(prev + 1, images.length - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, images.length, onClose])

  useModalDismiss(isOpen, onClose)

  if (!isOpen || images.length === 0) return null

  const currentImage = images[currentIndex] || images[0]
  const total = images.length

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setToastMsg('📷 저장 중...')
    const fileName = `bridge_image_${Date.now()}_${currentIndex + 1}.jpg`
    const ok = await saveImage(currentImage, fileName)
    setToastMsg(ok ? '📷 사진을 저장했습니다' : '⚠️ 저장하지 못했습니다')
    setTimeout(() => setToastMsg(''), 2200)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches?.[0]
    if (!t) return
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
    isSwipingRef.current = false
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current
    const startY = touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    if (startX === null || startY === null) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      isSwipingRef.current = true
      if (dx < 0 && currentIndex < total - 1) {
        setCurrentIndex(prev => prev + 1)
      } else if (dx > 0 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1)
      }
      setTimeout(() => { isSwipingRef.current = false }, 100)
    }
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!isSwipingRef.current) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center select-none overscroll-contain touch-none animate-fade-in"
      onClick={handleContainerClick}
    >
      {/* 상단 컨트롤 바 */}
      <div
        className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {total > 1 && (
            <span className="bg-white/20 backdrop-blur-md text-white text-xs font-mono px-3 py-1 rounded-full font-bold">
              {currentIndex + 1} / {total}
            </span>
          )}
          <span className="text-2xs text-white/70 hidden sm:inline-block">
            화면을 누르면 닫힙니다
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all cursor-pointer active:scale-95"
            title="현재 사진 저장"
            aria-label="현재 사진 저장"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onClose()
            }}
            className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all cursor-pointer active:scale-95"
            title="닫기"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-30 animate-fade-in whitespace-nowrap border border-white/10">
          {toastMsg}
        </div>
      )}

      {/* 중앙 사진 뷰어 */}
      <div
        className="relative w-full h-full flex items-center justify-center p-2 sm:p-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={currentImage}
          alt={`${alt} (${currentIndex + 1})`}
          className="max-w-full max-h-[85vh] object-contain shadow-2xl transition-transform duration-200 cursor-zoom-out"
          draggable={false}
          onClick={handleContainerClick}
        />

        {/* 이전 / 다음 내비게이션 버튼 (여러 장일 때) */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setCurrentIndex(prev => Math.max(prev - 1, 0))
              }}
              disabled={currentIndex === 0}
              className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-0 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 z-10"
              aria-label="이전 사진"
            >
              <ChevronLeft size={28} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setCurrentIndex(prev => Math.min(prev + 1, total - 1))
              }}
              disabled={currentIndex === total - 1}
              className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-0 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 z-10"
              aria-label="다음 사진"
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>

      {/* 하단 안내 문구 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-2xs text-white/60 bg-black/50 px-3.5 py-1 rounded-full pointer-events-none">
        {total > 1 ? '좌우로 넘겨보거나 화면을 터치하면 닫힙니다' : '화면을 터치하면 닫힙니다'}
      </div>
    </div>
  )
}
