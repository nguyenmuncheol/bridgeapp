'use client'

import { X } from 'lucide-react'
import { useModalDismiss, backdropClose } from '../lib/useModalDismiss'

interface ProfileImageLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

/** 프로필 사진을 인앱 라이트박스로 크게 보여줍니다 (새 탭이 아닌 오버레이 모달). */
export default function ProfileImageLightbox({ src, alt, onClose }: ProfileImageLightboxProps) {
  useModalDismiss(true, onClose)

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[95] flex items-center justify-center p-6"
      onClick={backdropClose(onClose)}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all"
        aria-label="닫기"
      >
        <X size={22} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl animate-fade-in"
      />
    </div>
  )
}
