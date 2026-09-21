'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
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
  PRAISE: { label: '찬양/묵상', tab: 'sharing', subTab: 'praise', chipClass: 'bg-emerald-50 text-emerald-700' },
  PHOTO: { label: '행사사진', tab: 'sharing', subTab: 'photo', chipClass: 'bg-amber-50 text-amber-700' },
}

/** 'YYYY-MM-DD' → 'M월 D일' (홈에서는 연도까지 볼 필요가 없습니다) */
function formatShortDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  if (!m) return dateStr || ''
  return `${Number(m[2])}월 ${Number(m[3])}일`
}

/** 한 화면에 나란히 보여줄 글 수(가로 2칸). */
const PER_VIEW = 2
const AUTO_SLIDE_MS = 2000
/** 직접 넘긴 직후에는 자동 전환을 잠시 멈춥니다(읽는 중에 화면이 바뀌면 불편합니다). */
const PAUSE_AFTER_MANUAL_MS = 10000
/** 카드가 옆으로 미끄러지는 시간. 끝에서 처음으로 되돌릴 때 이만큼 기다렸다 자리를 맞춥니다. */
const SLIDE_MS = 400

/**
 * 홈 화면 "최신 글" 띠.
 *
 * 공지사항이 한동안 없으면 홈이 주보 하나만 덩그러니 남습니다. 그래서 나눔·소식 탭에
 * 새 글이 올라온 걸 홈에서도 알 수 있도록, 최신 글을 가로로 두 칸씩 보여주고
 * **한 칸씩** 옆으로 밀어 줍니다. 한 칸씩만 움직이므로 넘어가도 방금 보던 글 하나는
 * 화면에 그대로 남아 있어, 읽다가 놓치는 일이 줄어듭니다.
 *
 * 마지막 글 다음에 첫 글이 자연스럽게 이어지도록 앞쪽 카드를 뒤에 복제해 두고,
 * 복제 구간까지 밀면 애니메이션을 잠깐 끄고 조용히 맨 앞으로 돌아옵니다.
 *
 * 어르신 성도가 많은 앱이라 다음을 지킵니다.
 *  - 손가락을 올리고 있거나(읽는 중) 직접 넘긴 직후에는 자동 전환을 멈춥니다.
 *  - 다른 앱을 보다 돌아왔을 때 여러 칸이 훌쩍 지나가 있지 않도록, 화면이 안 보이면 멈춥니다.
 *  - "화면 움직임 줄이기"를 켠 분에게는 자동 전환을 아예 하지 않습니다(손으로만 넘김).
 *  - 점(dot)은 눈으로 보기엔 작아도 누르는 영역은 44px을 확보합니다.
 */
export default function RecentPostsCarousel({ posts, onNavigate }: RecentPostsCarouselProps) {
  const total = posts.length
  // 글이 2개 이하면 이미 전부 화면에 있으므로 굳이 밀지 않습니다.
  const canSlide = total > PER_VIEW
  const perView = Math.min(total, PER_VIEW) || 1

  // 마지막 칸에서 첫 글로 자연스럽게 이어지도록 앞쪽 카드를 뒤에 복제합니다.
  const items = useMemo(
    () => (canSlide ? [...posts, ...posts.slice(0, PER_VIEW)] : posts),
    [posts, canSlide]
  )

  // index는 "왼쪽 칸에 놓인 카드 번호". 0 ~ total 까지 가고, total(복제 구간)에 닿으면 0으로 되돌립니다.
  const [index, setIndex] = useState(0)
  const [animating, setAnimating] = useState(true)
  const [paused, setPaused] = useState(false)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pauseAwhile = () => {
    setPaused(true)
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    pauseTimerRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_MANUAL_MS)
  }
  useEffect(() => () => { if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current) }, [])

  // 글이 지워져 목록이 짧아지면 index가 범위를 벗어날 수 있어 그릴 때마다 보정합니다.
  const safeIndex = canSlide ? Math.min(index, total) : 0

  // 복제 구간까지 밀었으면, 미끄러짐이 끝난 뒤 애니메이션 없이 맨 앞으로 되돌립니다.
  // 복제 카드와 첫 카드가 같은 그림이라 되돌아온 것이 보이지 않습니다.
  useEffect(() => {
    if (!canSlide || safeIndex < total) return
    const timer = setTimeout(() => { setAnimating(false); setIndex(0) }, SLIDE_MS)
    return () => clearTimeout(timer)
  }, [safeIndex, total, canSlide])

  // 자리를 옮긴 것이 화면에 반영된 다음 프레임에 애니메이션을 다시 켭니다.
  // (같은 프레임에 켜면 되돌아오는 과정이 그대로 보입니다.)
  useEffect(() => {
    if (animating) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)))
    return () => cancelAnimationFrame(raf)
  }, [animating])

  // ── 자동 전환 ──
  useEffect(() => {
    if (!canSlide || paused || !animating) return
    if (typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const timer = setInterval(() => {
      // 앱이 백그라운드에 있는 동안에는 넘기지 않습니다.
      if (typeof document !== 'undefined' && document.hidden) return
      setIndex(prev => prev + 1)
    }, AUTO_SLIDE_MS)
    return () => clearInterval(timer)
  }, [canSlide, paused, animating])

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
    if (!canSlide) { setPaused(false); return }
    pauseAwhile()
    // 뒤로 밀 때는 맨 앞에서 멈춥니다(뒤로 감듯 되돌아가면 어지럽습니다).
    setIndex(prev => (dx < 0 ? prev + 1 : Math.max(prev - 1, 0)))
  }

  if (total === 0) return null

  // 지금 왼쪽 칸에 있는 글이 몇 번째인지 (복제 구간은 첫 글로 셉니다).
  const activeDot = safeIndex % total

  return (
    <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs space-y-3">
      <div className="flex items-center gap-2">
        <span className="p-2 bg-violet-50 text-violet-600 rounded-xl"><Sparkles size={18} /></span>
        <h2 className="font-bold text-gray-900 text-sm">최신 글</h2>
        {canSlide && (
          <span className="ml-auto text-2xs text-gray-400 tabular-nums">{activeDot + 1} / {total}</span>
        )}
      </div>

      {/* 가로로 미끄러지는 띠. 바깥은 잘라내고, 안쪽 줄만 한 칸씩 옆으로 움직입니다. */}
      <div
        className="overflow-hidden -mx-1"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="flex items-stretch"
          style={{
            width: `${(items.length * 100) / perView}%`,
            transform: `translateX(-${safeIndex * (100 / items.length)}%)`,
            transition: animating ? `transform ${SLIDE_MS}ms ease-out` : undefined,
          }}
        >
          {items.map((post, i) => {
            const info = CATEGORY_INFO[post.category]
            return (
              <div key={`${post.id}-${i}`} className="px-1" style={{ width: `${100 / items.length}%` }}>
                <button
                  type="button"
                  onClick={() => { if (!movedRef.current && info) onNavigate?.(info.tab, info.subTab) }}
                  className="w-full h-full text-left bg-gradient-to-br from-[#f7f9ff] to-white p-3 rounded-xl border border-blue-50 hover:border-blue-200 transition-colors flex flex-col gap-1"
                >
                  <span className={`self-start text-2xs font-bold px-2 py-0.5 rounded-md ${info?.chipClass || 'bg-gray-100 text-gray-600'}`}>
                    {info?.label || '글'}
                  </span>
                  <h3 className="font-bold text-xs text-gray-800 line-clamp-2 leading-relaxed grow">{post.title}</h3>
                  <div className="flex items-baseline gap-1 text-2xs text-gray-400">
                    <span className="truncate">{post.authorName}</span>
                    <span className="ml-auto shrink-0">{formatShortDate(post.createdAt)}</span>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {canSlide && (
        <div className="flex items-center justify-center">
          {posts.map((post, i) => (
            <button
              key={post.id}
              type="button"
              onClick={() => { setIndex(i); pauseAwhile() }}
              aria-label={`${i + 1}번째 글부터 보기`}
              aria-current={i === activeDot}
              className="w-11 h-11 flex items-center justify-center"
            >
              <span className={`block rounded-full transition-all ${i === activeDot ? 'w-4 h-1.5 bg-brand' : 'w-1.5 h-1.5 bg-gray-300'}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
