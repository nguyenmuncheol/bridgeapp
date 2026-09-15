'use client'

/**
 * 화면을 구성하는 기본 카드.
 *
 * 🐛 예전엔 `bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs` 라는 똑같은 껍데기가
 *    22곳에 복사돼 있었습니다. 하나를 고치려면 22곳을 고쳐야 했고, 실제로 이미 조금씩
 *    어긋나 있었습니다(어떤 곳은 p-3, 어떤 곳은 p-4).
 *
 * 안쪽 여백(padding)과 줄 간격(space-y)은 화면마다 다른 게 자연스러우므로 그대로 넘겨받습니다.
 * 이 컴포넌트가 책임지는 것은 **카드의 테두리·모서리·그림자·바탕색** 네 가지뿐입니다.
 */

type CardPadding = 'none' | 'sm' | 'md'

const PADDING: Record<CardPadding, string> = {
  // 안쪽에 머리말 줄이나 표가 통째로 들어가는 카드는 스스로 여백을 만듭니다.
  none: '',
  sm: 'p-3',
  md: 'p-4',
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 안쪽 여백. 기본 md(p-4). 안에서 직접 나눠 쓸 거면 none. */
  padding?: CardPadding
  /**
   * 그릴 태그. 기본 div.
   * 화면을 크게 나누는 구역이면 'section' 으로 해서 문서 구조를 남깁니다(화면 낭독기가 읽습니다).
   */
  as?: 'div' | 'section'
  children: React.ReactNode
}

export default function Card({ padding = 'md', as: Tag = 'div', className = '', children, ...rest }: CardProps) {
  return (
    <Tag
      className={`bg-white rounded-2xl border border-gray-100 shadow-2xs ${PADDING[padding]} ${className}`.replace(/\s+/g, ' ').trim()}
      {...rest}
    >
      {children}
    </Tag>
  )
}
