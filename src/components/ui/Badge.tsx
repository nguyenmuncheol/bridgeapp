'use client'

/**
 * 이름 옆에 붙는 작은 라벨. 소속·상태·분류를 한 단어로 보여줍니다.
 *
 * 화면마다 손으로 적다 보니 같은 역할의 라벨이 모서리(rounded / rounded-md / rounded-full),
 * 글자 굵기(bold / semibold / medium), 색 조합까지 제각각이었습니다. 색은 **뜻**으로 고르고
 * 나머지 생김새는 여기서 하나로 정합니다.
 *
 *   <Badge>성인</Badge>                      브랜드색 — 분류·소속
 *   <Badge tone="success">출석</Badge>        좋은 상태
 *   <Badge tone="danger">결석</Badge>         나쁜 상태
 *   <Badge tone="neutral">미기록</Badge>      아직 값이 없음
 *   <Badge tone="warning">확인 필요</Badge>   주의해서 볼 것
 *
 * ⚠️ 누르는 것(버튼)에는 쓰지 않습니다. 이건 읽기만 하는 라벨입니다.
 */

type BadgeTone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral'

const TONE: Record<BadgeTone, string> = {
  brand: 'bg-brand/10 text-brand',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-rose-50 text-rose-700',
  warning: 'bg-amber-50 text-amber-800',
  neutral: 'bg-gray-100 text-gray-600',
}

export interface BadgeProps {
  children: React.ReactNode
  tone?: BadgeTone
  className?: string
}

export default function Badge({ children, tone = 'brand', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded text-3xs font-bold whitespace-nowrap ${TONE[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  )
}
