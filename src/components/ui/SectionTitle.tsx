'use client'

/**
 * 카드나 구역의 머리말.
 *
 * 같은 자리에 쓰이는 제목인데 화면마다 `font-bold text-sm text-gray-900`,
 * `font-bold text-xs text-gray-900`, `font-bold text-sm sm:text-base text-gray-900` 처럼
 * 조금씩 다르게 적혀 있었습니다. 크기를 고르는 것만 화면에 맡기고 나머지는 여기서 정합니다.
 *
 *   <SectionTitle>🗓️ 기간 출석률</SectionTitle>
 *   <SectionTitle size="lg">✏️ 기도제목 수정</SectionTitle>
 *   <SectionTitle size="sm" trailing={<span className="text-2xs text-gray-400">3명</span>}>방문자</SectionTitle>
 */

type TitleSize = 'sm' | 'md' | 'lg'

const SIZE: Record<TitleSize, string> = {
  sm: 'text-xs',              // 14px — 카드 안의 작은 구역
  md: 'text-sm',              // 16px — 일반적인 카드 머리말
  lg: 'text-sm sm:text-base', // 폰에서 16px, 넓은 화면에서 18px — 모달 제목
}

export interface SectionTitleProps {
  children: React.ReactNode
  size?: TitleSize
  /** 제목 오른쪽에 붙일 것(개수 뱃지, 버튼 등). 넘기면 좌우 양끝 배치가 됩니다. */
  trailing?: React.ReactNode
  className?: string
  id?: string
}

export default function SectionTitle({
  children, size = 'md', trailing, className = '', id
}: SectionTitleProps) {
  const heading = (
    <h3 id={id} className={`font-bold text-gray-900 ${SIZE[size]} ${trailing ? '' : className}`.trim()}>
      {children}
    </h3>
  )

  if (!trailing) return heading

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`.trim()}>
      {heading}
      {trailing}
    </div>
  )
}
