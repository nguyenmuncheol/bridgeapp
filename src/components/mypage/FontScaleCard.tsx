'use client'

import { useSyncExternalStore } from 'react'
import { ALargeSmall } from 'lucide-react'
import Card from '../ui/Card'
import SectionTitle from '../ui/SectionTitle'
import {
  DEFAULT_FONT_SCALE, FONT_SCALE_OPTIONS, readFontScale, setFontScale, subscribeFontScale,
} from '../../lib/fontScale'

// 버튼마다 "가" 를 그 단계 느낌으로 점점 크게 보여 줍니다(앱 전체 글씨가 커지면 이것도 함께 커집니다).
const GLYPH_SIZE = ['text-xs', 'text-sm', 'text-base', 'text-lg']

/**
 * 큰 글씨 모드 — 마이페이지의 "글씨 크기" 카드.
 * 누르면 그 자리에서 앱 전체 글씨가 바뀌고, 이 기기에 저장됩니다(src/lib/fontScale.ts).
 */
export default function FontScaleCard() {
  // 서버에서 그릴 때는 저장공간을 못 읽으니 기본값으로 그리고, 브라우저에서 저장된 값으로 맞춥니다.
  const current = useSyncExternalStore(subscribeFontScale, readFontScale, () => DEFAULT_FONT_SCALE)

  return (
    <Card as="section" className="space-y-3">
      <div className="flex items-center gap-2">
        <ALargeSmall size={16} className="text-brand" />
        <SectionTitle size="sm">글씨 크기</SectionTitle>
      </div>
      <div role="radiogroup" aria-label="글씨 크기" className="grid grid-cols-4 gap-1.5">
        {FONT_SCALE_OPTIONS.map(({ level, label }, i) => {
          const on = current === level
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFontScale(level)}
              className={`flex flex-col items-center justify-end gap-0.5 min-h-16 py-2 px-1 rounded-xl border transition-all ${
                on ? 'bg-brand text-white border-transparent shadow-xs' : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              <span className={`font-bold leading-none ${GLYPH_SIZE[i]}`}>가</span>
              <span className={`text-2xs font-bold whitespace-nowrap ${on ? 'text-white' : 'text-gray-500'}`}>{label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-2xs text-gray-500 leading-relaxed">
        누르시면 앱 전체 글씨가 바로 바뀝니다. 이 휴대폰에만 저장됩니다.
      </p>
    </Card>
  )
}
