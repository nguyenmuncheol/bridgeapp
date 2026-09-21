'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { RecentPostItem } from '../../lib/db'

interface RecentPostsCarouselProps {
  posts: RecentPostItem[]
  /** 카드를 누르면 해당 글이 있는 탭(+서브탭)으로 이동합니다. */
  onNavigate?: (tab: string, subTab?: string) => void
}

/** 글 카테고리 → 홈에서 보여줄 탭 이름과 이동할 위치. */
const CATEGORY_INFO: Record<string, { label: string; tab: string; subTab: string; chipClass: string }> = {
  MEMBER_NEWS: { label: '성도소식', tab: 'news', subTab: 'memberNews', chipClass: 'bg-blue-50 text-brand' },
  PRAYER: { label: '기도제목', tab: 'sharing', subTab: 'prayer', chipClass: 'bg-violet-50 text-violet-700' },
  PRAISE: { label: '찬양/묵상나눔', tab: 'sharing', subTab: 'praise', chipClass: 'bg-emerald-50 text-emerald-700' },
  PHOTO: { label: '행사사진', tab: 'sharing', subTab: 'photo', chipClass: 'bg-amber-50 text-amber-700' },
}

/** 'YYYY-MM-DD' → 'M월 D일' (홈에서는 연도까지 볼 필요가 없습니다) */
function formatShortDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  if (!m) return dateStr || ''
  return `${Number(m[2])}월 ${Number(m[3])}일`
}

/** 한 화면에 보여줄 글 수. */
const PAGE_SIZE = 2
const AUTO_SLIDE_MS = 4000
/** 직접 넘긴 직후에는 자동 전환을 잠시 멈춥니다(읽는 중에 화면이 바뀌면 불편합니다). */
const PAUSE_AFTER_MANUAL_MS = 10000

/**
 * 홈 화면 "최신 글" 띠.
 *
 * 공지사항이 한동안 없으면 홈이 주보 하나만 덩그러니 남습니다. 그래서 나눔·소식 탭에
 * 새 글이 올라온 걸 홈에서도 알 수 있도록, 최신 글을 두 개씩 묶어 자동으로 넘겨 보여줍니다.
 *
 * 어르신 성도가 많은 앱이라 다음을 지킵니다.
 *  - 자동 전환은 4초. 손가락을 올리고 있거나(읽는 중) 직접 넘긴 직후에는 멈춥니다.
 *  - 다른 앱을 보다 돌아왔을 때 몇 장이 훌쩍 지나가 있지 않도록, 화면이 안 보이면 멈춥니다.
 *  - "화면 움직임 줄이기"를 켠 분에게는 자동 전환을 아예 하지 않습니다(손으로만 넘김).
 *  - 점(dot)은 눈으로 보기엔 작아도 누르는 영역은 44px을 확보합니다.
 */
export default function RecentPostsCarousel({ posts, onNavigate }: RecentPostsCarouselProps) {
  // 글을 두 개씩 끊어 '한 장'으로 만듭니다. 마지막 장은 한 개만 있을 수 있습니다.
  const pages = useMemo(() => {
    const result: RecentPostItem[][] = []
    for (let i = 0; i < posts.length; i += PAGE_SIZE) result.push(posts.slice(i, i + PAGE_SIZE))
    return result
  }, [posts])
  const total = pages.length

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 글이 지워지는 등으로 장 수가 줄면 범위를 벗어날 수 있어 항상 보정합니다.
  const safeIndex = total === 0 ? 0 : Math.min(index, total - 1)

  // 직접 넘긴 뒤 일정 시간 자동 전환을 멈춥니다.
  const goManual = (next: number) => {
    if (total === 0) return
    setIndex(((next % total) + total) % total)
    setPaused(true)
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_MANUAL_MS)
  }

  useEffect(() => () => { if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current) }, [])

  // ── 자동 전환 ──
  useEffect(() => {
    if (total <= 1 || paused) return
    if (typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const timer = setInterval(() => {
      // 앱이 백그라운드에 있는 동안에는 넘기지 않습니다.
      if (typeof document !== 'undefined' && document.hidden) return
      setIndex(prev => (prev + 1) % total)
    }, AUTO_SLIDE_MS)
    return () => clearInterval(timer)
  }, [total, paused])

  // ── 손가락으로 밀어서 넘기기 (ImageSlider와 같은 조작감) ──
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const movedRef = useRef(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches?.[0]
    if (!t) return
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
    movedRef.current = false
    setPaused(true)
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current
    const startY = touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    if (startX === null || startY === null) { setPaused(false); return }
    const t = e.changedTouches?.[0]
    if (!t) { setPaused(false); return }
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    // 세로로 더 많이 움직였으면 화면 스크롤이므로 넘기지 않습니다.
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) { setPaused(false); return }
    movedRef.current = true
    goManual(safeIndex + (dx < 0 ? 1 : -1))
  }

  if (total === 0) return null

  const currentPage = pages[safeIndex]

  return (
    <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs space-y-3">
      <div className="flex items-center gap-2">
        <span className="p-2 bg-violet-50 text-violet-600 rounded-xl"><Sparkles size={18} /></span>
        <h2 className="font-bold text-gray-900 text-sm">최신 글</h2>
        {total > 1 && (
          <span className="ml-auto text-2xs text-gray-400 tabular-nums">{safeIndex + 1} / {total}</span>
        )}
      </div>

      <div
        className="space-y-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {currentPage.map(post => {
          const info = CATEGORY_INFO[post.category]
          return (
            <button
              key={post.id}
              type="button"
              onClick={() => { if (!movedRef.current && info) onNavigate?.(info.tab, info.subTab) }}
              // 제목이 한 줄인 카드와 두 줄인 카드가 섞여도 장을 넘길 때 높이가 덜 출렁이도록
              // 최소 높이를 잡아 둡니다.
              className="w-full min-h-[84px] text-left bg-gradient-to-br from-[#f7f9ff] to-white p-3.5 rounded-xl border border-blue-50 hover:border-blue-200 transition-all flex items-center gap-2"
            >
              <div className="min-w-0 grow space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-2xs font-bold px-2 py-0.5 rounded-md ${info?.chipClass || 'bg-gray-100 text-gray-600'}`}>
                    {info?.label || '글'}
                  </span>
                  <span className="text-2xs text-gray-400 shrink-0">{formatShortDate(post.createdAt)}</span>
                </div>
                <h3 className="font-bold text-xs text-gray-800 line-clamp-2 leading-relaxed">{post.title}</h3>
                <p className="text-2xs text-gray-400 line-clamp-1">{post.authorName}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
          )
        })}

        {/* 마지막 장에 글이 하나뿐일 때, 장을 넘겨도 카드 자리가 위아래로 흔들리지 않게 빈 자리를 둡니다. */}
        {currentPage.length < PAGE_SIZE && total > 1 && (
          <div className="min-h-[84px]" aria-hidden="true" />
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center">
          {pages.map((page, i) => (
            <button
              key={page[0].id}
              type="button"
              onClick={() => goManual(i)}
              aria-label={`${i + 1}번째 장 보기`}
              aria-current={i === safeIndex}
              className="w-11 h-11 flex items-center justify-center"
            >
              <span className={`block rounded-full transition-all ${i === safeIndex ? 'w-4 h-1.5 bg-brand' : 'w-1.5 h-1.5 bg-gray-300'}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
