'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useModalDismiss } from '../lib/useModalDismiss'

interface ProfileImageLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

/**
 * 프로필 사진을 인앱 라이트박스로 크게 보여줍니다.
 *
 * 🐛 기존 문제:
 * 1. 카드가 CSS transform(active:scale-[0.99])을 가질 때 내부에 렌더링되면 fixed 위치와 애니메이션이 왜곡되었습니다.
 * 2. 배경 터치/클릭 시 이벤트가 상위 카드(onClick => 게시글 상세 열기)로 전파(bubble)되어,
 *    라이트박스가 닫히는 대신 카드가 선택되며 확대/축소 깜빡임이 반복되는 버그가 발생했습니다.
 *
 * → createPortal로 document.body에 직접 부착하고, 모든 클릭 이벤트에 e.stopPropagation()을 적용하여
 *   부모 요소로의 이벤트 전파를 100% 차단합니다.
 */
export default function ProfileImageLightbox({ src, alt, onClose }: ProfileImageLightboxProps) {
  // createPortal 은 document 가 있어야 하므로 서버 렌더 단계에서는 아무것도 그리지 않습니다.
  // 🐛 예전엔 useState(false) + useEffect(setMounted(true)) 로 판별했는데, 그러면 화면이
  //    뜰 때마다 의미 없는 렌더가 한 번 더 돌았습니다.
  // → React 가 이 용도로 제공하는 useSyncExternalStore 를 씁니다. 구독할 외부 소스가 없어
  //   구독 함수는 빈 정리 함수만 돌려주고, 서버에서는 false·브라우저에서는 true 입니다.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  // 배경 스크롤/풀-투-리프레시 잠금은 useModalDismiss가 처리합니다.
  // 🐛 예전엔 여기서도 따로 잠갔습니다. 같은 document.body 속성을 두 효과가 각자
  // save/restore하면서 경쟁해, 닫은 뒤 메인 페이지 스크롤이 풀리지 않고 멈춘 것처럼
  // 보이는 사고가 있었습니다 — 잠금은 훅 하나에만 두는 게 맞습니다.
  useModalDismiss(true, onClose)

  // 키보드 ESC 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!mounted || typeof document === 'undefined') return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onClose()
  }

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6 select-none touch-none overscroll-contain"
      onClick={handleBackdropClick}
      onTouchEnd={(e) => {
        // 모바일 터치 이벤트 버블링도 차단
        if (e.target === e.currentTarget) {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onClose()
        }}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer z-10 active:scale-95"
        aria-label="닫기"
        title="닫기"
      >
        <X size={22} />
      </button>

      <div className="relative max-w-full max-h-full flex items-center justify-center">
        <img
          src={src}
          alt={alt}
          onClick={handleImageClick}
          className="max-w-[90vw] max-h-[85vh] rounded-2xl object-contain shadow-2xl animate-fade-in cursor-zoom-out"
          draggable={false}
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-2xs text-white/70 bg-black/60 px-3.5 py-1 rounded-full pointer-events-none whitespace-nowrap">
        화면을 터치하면 닫힙니다
      </div>
    </div>,
    document.body
  )
}
