'use client'

/**
 * 화면 안의 작은 탭 메뉴(기도제목 | 행사사진 | 찬양, 식사 | 쿠폰 …).
 *
 * 예전에는 탭마다 모양이 달랐습니다(회색 바탕에 흰 칸, 흰 바탕에 남색 칸, 관리자 화면은 검정 칸).
 * → 모두 "흰 바탕 + 고른 칸은 남색 채움"으로 맞춥니다.
 *
 *   <SegmentedTabs value={tab} onChange={setTab} items={[{ id: 'a', label: '🙏 기도제목' }, …]} />
 *
 * 한 줄에 칸이 너무 많으면 글자가 뭉개지므로, maxCols 를 넘으면 여러 줄로 접습니다.
 * 칸은 똑같은 폭으로 나누되, 큰 글씨 모드에서 이름이 칸보다 길어지면 그 칸만 넓어지고 넘치는 칸은
 * 다음 줄로 내려갑니다. (🐛 예전엔 고정 격자라 "🎵 찬양/묵상나눔"이 화면 밖으로 삐져나갔습니다)
 *
 * sticky: 탭 맨 위의 소메뉴는 목록을 아래로 내려도 헤더 바로 밑에 붙어 있게 합니다.
 *   (긴 목록을 보다가 다른 소메뉴로 가려고 맨 위까지 올라가지 않아도 되도록)
 *   뒤로 지나가는 글이 비치지 않도록 화면 폭 전체를 페이지 바탕색 띠로 덮습니다.
 *   ⚠️ 조상 요소에 overflow-hidden/auto 가 있으면 sticky 가 동작하지 않습니다.
 */
export interface SegmentedTabItem<T extends string> {
  id: T
  label: React.ReactNode
}

export default function SegmentedTabs<T extends string>({
  items, value, onChange, maxCols, className = '', ariaLabel, sticky = false,
}: {
  items: SegmentedTabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** 한 줄에 넣을 최대 칸 수 (넘으면 다음 줄로) */
  maxCols?: number
  className?: string
  ariaLabel?: string
  /** 스크롤해도 헤더 밑에 붙어 있게 (탭 맨 위 소메뉴) */
  sticky?: boolean
}) {
  const cols = Math.min(maxCols ?? items.length, items.length)
  // 한 줄짜리 탭은 줄이 넘쳐 접혔을 때 남은 칸이 줄을 꽉 채우게 늘립니다.
  // 처음부터 여러 줄인 탭(maxCols)은 늘리지 않습니다 — 마지막 줄의 칸들이 윗줄과 같은 폭으로 남게.
  const grow = items.length <= cols ? 'grow' : ''
  const tabs = (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold ${className}`}
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
            // 기본 폭 = 한 줄을 cols 칸으로 똑같이 나눈 폭(사이 간격 gap-1 = 0.25rem 을 빼고)
            style={{ flexBasis: `calc((100% - ${cols - 1} * 0.25rem) / ${cols})` }}
            className={`${grow} py-2 px-1.5 rounded-lg transition-all whitespace-nowrap ${
              active ? 'bg-brand text-white font-bold shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
  if (!sticky) return tabs
  return (
    <div className="sticky top-[var(--app-header-h)] z-30 -mx-4 -mt-2 px-4 py-2 bg-brand-50/95 backdrop-blur-sm">
      {tabs}
    </div>
  )
}
