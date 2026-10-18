'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ZoomIn, ZoomOut } from 'lucide-react'
import BulletinView, { PAGE_WIDTH_PX } from './BulletinView'
import { BulletinContent } from '../../lib/bulletinContent'
import { useModalDismiss } from '../../lib/useModalDismiss'
import { ModalBottomCloseButton, ModalCloseButton } from '../ui/Modal'

interface BulletinViewerModalProps {
  content: BulletinContent
  onClose: () => void
}

/**
 * 앱에서 작성한 주보(BulletinView)를 전체화면으로 크게 보여줍니다.
 *
 * 🐛 기존 문제: 사진으로 올린 주보는 탭하면 확대됐지만(ImageViewerModal), 앱에서 작성한 주보는
 * 확대할 방법이 없었습니다. 게다가 주보 팝업(max-w-sm) 폭에 맞춰 약 55%로 줄어 보이기 때문에
 * 섬김표·공지·헌금 계좌 글씨를 읽을 수 없었습니다.
 *
 * → 처음에는 한 화면 너비에 맞춰(화면 맞춤) 보여 주고, [실물 크기] 를 누르면 A5 한 쪽 실물
 *   크기(PAGE_WIDTH_PX)로 키워 상하좌우로 밀어서 봅니다.
 *   BulletinView 는 담는 칸의 너비를 재서 스스로 축소하므로, 칸 너비만 바꿔 주면 됩니다.
 *
 * createPortal 로 document.body 에 붙이는 이유는 ProfileImageLightbox 와 같습니다 —
 * 조상의 transform 에 fixed 위치가 휘둘리지 않게 하기 위함입니다.
 */
export default function BulletinViewerModal({ content, onClose }: BulletinViewerModalProps) {
  // 처음에는 화면 너비에 맞춰 한 쪽 전체가 보이게 하고, 더 키우려면 [실물 크기]를 누릅니다.
  const [actualSize, setActualSize] = useState(false)

  // 배경 스크롤 잠금 · 뒤로가기로 닫기. 아래 주보 팝업과 겹쳐도 서로 간섭하지 않습니다.
  useModalDismiss(true, onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="주보 크게 보기"
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col animate-fade-in"
      onClick={e => e.stopPropagation()}
    >
      {/* 맨 위: 크기 전환 + 닫기 */}
      <div className="shrink-0 flex items-center justify-between gap-2 pl-4 pr-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setActualSize(v => !v)}
          className="px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white text-xs font-bold rounded-full flex items-center gap-1.5 active:scale-95 transition-all"
        >
          {actualSize ? <><ZoomOut size={16} /> 화면 맞춤</> : <><ZoomIn size={16} /> 실물 크기</>}
        </button>
        <ModalCloseButton onClick={onClose} tone="dark" />
      </div>

      {/* 본문: 실물 크기일 때는 가로로도 밀어서 봅니다 */}
      <div className="flex-1 min-h-0 overflow-auto overscroll-contain touch-pan-x touch-pan-y touch-pinch-zoom">
        <div
          className="mx-auto py-2"
          style={actualSize ? { width: PAGE_WIDTH_PX } : { width: '100%', padding: '0.5rem' }}
        >
          <BulletinView content={content} mode="web" />
        </div>
      </div>

      {/* 맨 아래: 닫기 */}
      <div className="shrink-0 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex">
        <ModalBottomCloseButton tone="dark" onClick={onClose} />
      </div>
    </div>,
    document.body
  )
}
