'use client'

import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { backdropClose } from '../../lib/useModalDismiss'

// ─────────────────────────────────────────────────────────────────────────────
// 공통 팝업 틀
//
// 예전에는 팝업마다 배경·모서리·제목줄·닫기 버튼 모양이 조금씩 달랐고(✕ 글자, X 아이콘,
// 남색·검정 제목줄…), 닫기 버튼이 위에만 있어서 긴 내용을 끝까지 내린 뒤 다시 위로
// 올라가야 닫을 수 있었습니다.
//
// → 모든 팝업을 같은 틀로 맞춥니다.
//   · 맨 위 오른쪽: 닫기(X) — 제목줄은 스크롤해도 고정
//   · 맨 아래: 닫기 버튼 — 아래 버튼 줄도 고정. 글쓰기처럼 [취소][저장]이 있는 팝업은
//     그 [취소]가 아래 닫기 버튼 역할을 합니다(footer 로 넘기고 bottomClose={false}).
//   · 화면 낭독기가 팝업으로 알아듣도록 role="dialog" · aria-modal · 제목 연결
//
// 뒤로가기로 닫기(useModalDismiss)·작성 중 이탈 확인(useWriteModalGuard)은 지금처럼 각 팝업이
// 직접 부릅니다. 이 틀은 모양과 닫기 버튼만 책임집니다.
// ─────────────────────────────────────────────────────────────────────────────

type ModalSize = 'sm' | 'md' | 'lg'

const WIDTH: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export interface ModalProps {
  onClose: () => void
  /** 제목 (제목줄 왼쪽) */
  title: ReactNode
  /** 제목 아래 작은 설명 */
  subtitle?: ReactNode
  /** 제목 앞 아이콘 */
  icon?: ReactNode
  children: ReactNode
  /** 아래 고정 버튼 줄. 없으면 [닫기] 버튼 하나만 나옵니다. */
  footer?: ReactNode
  /** footer 옆에 [닫기] 버튼도 붙일지. footer 에 [취소]가 있으면 false 로 둡니다. (기본: footer 가 없을 때만) */
  bottomClose?: boolean
  size?: ModalSize
  /** 글쓰기처럼 내용이 길고 키보드가 올라오는 팝업은 높이를 화면에 꽉 채워 둡니다 */
  fullHeight?: boolean
  /** 바깥 어두운 곳을 눌러 닫을지 (작성 중인 글이 사라지면 안 되는 팝업은 false) */
  closeOnBackdrop?: boolean
  /** 겹쳐 뜨는 팝업의 층 (기본 z-[70]) */
  zIndex?: string
  /** 본문 여백 등 */
  bodyClassName?: string
  /** 제목줄 오른쪽, 닫기 버튼 앞에 둘 것(수정·삭제 버튼 등) */
  headerActions?: ReactNode
  /** 제목줄과 본문 사이에 고정해 둘 것(탭 메뉴 등) */
  subheader?: ReactNode
}

export default function Modal({
  onClose, title, subtitle, icon, children, footer, bottomClose,
  size = 'sm', fullHeight = false, closeOnBackdrop = true, zIndex = 'z-[70]',
  bodyClassName = 'p-5 space-y-4', headerActions, subheader,
}: ModalProps) {
  const titleId = useId()
  const showBottomClose = bottomClose ?? !footer

  return (
    <div
      className={`inset-vv bg-black/60 backdrop-blur-sm ${zIndex} flex items-center justify-center p-4 overscroll-contain`}
      onClick={closeOnBackdrop ? backdropClose(onClose) : e => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white rounded-2xl ${WIDTH[size]} w-full ${fullHeight ? 'h-vp-90' : ''} max-h-vp-90 flex flex-col shadow-2xl overflow-hidden animate-fade-in`}
      >
        {/* 맨 위: 제목 + 닫기 (고정) */}
        <div className="flex items-center justify-between gap-2 pl-5 pr-3 py-3 border-b border-gray-100 shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            {icon && <span className="shrink-0 text-brand">{icon}</span>}
            <div className="min-w-0">
              <h3 id={titleId} className="font-bold text-sm sm:text-base text-gray-900 line-clamp-2 break-keep">{title}</h3>
              {subtitle && <p className="text-2xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {headerActions}
            <ModalCloseButton onClick={onClose} />
          </div>
        </div>

        {subheader && <div className="shrink-0">{subheader}</div>}

        {/* 본문 (여기만 스크롤) */}
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y ${bodyClassName}`}>
          {children}
        </div>

        {/* 맨 아래: 버튼 줄 + 닫기 (고정) */}
        {(footer || showBottomClose) && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-2">
            {footer}
            {showBottomClose && <ModalBottomCloseButton onClick={onClose} />}
          </div>
        )}
      </div>
    </div>
  )
}

/** 팝업 맨 위 오른쪽 닫기(X) 버튼 — 공통 틀을 쓰지 않는 팝업(사진 크게 보기 등)에서도 씁니다. */
export function ModalCloseButton({ onClick, tone = 'light', className = '' }: { onClick: () => void; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="닫기"
      title="닫기"
      className={`tap-area relative w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
        tone === 'dark' ? 'text-white bg-white/15 hover:bg-white/25' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      } ${className}`}
    >
      <X size={20} />
    </button>
  )
}

/** 팝업 맨 아래 [닫기] 버튼 */
export function ModalBottomCloseButton({ onClick, label = '닫기', tone = 'light', className = '' }: { onClick: () => void; label?: string; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
        tone === 'dark' ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${className}`}
    >
      {label}
    </button>
  )
}
