'use client'

/**
 * 화면 안의 작은 탭 메뉴(기도제목 | 행사사진 | 찬양, 식사 | 쿠폰 …).
 *
 * 예전에는 탭마다 모양이 달랐습니다(회색 바탕에 흰 칸, 흰 바탕에 남색 칸, 관리자 화면은 검정 칸).
 * → 모두 "흰 바탕 + 고른 칸은 남색 채움"으로 맞춥니다.
 *
 *   <SegmentedTabs value={tab} onChange={setTab} items={[{ id: 'a', label: '🙏 기도제목' }, …]} />
 *
 * 한 줄에 칸이 너무 많으면 글자가 뭉개지므로, maxCols 를 넘으면 여러 줄 격자로 접습니다.
 */
export interface SegmentedTabItem<T extends string> {
  id: T
  label: React.ReactNode
}

export default function SegmentedTabs<T extends string>({
  items, value, onChange, maxCols, className = '', ariaLabel,
}: {
  items: SegmentedTabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** 한 줄에 넣을 최대 칸 수 (넘으면 다음 줄로) */
  maxCols?: number
  className?: string
  ariaLabel?: string
}) {
  const cols = Math.min(maxCols ?? items.length, items.length)
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`grid gap-1 bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map(({ id, label }) => {
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`py-2 px-1.5 rounded-lg transition-all whitespace-nowrap ${
              active ? 'bg-brand text-white font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
