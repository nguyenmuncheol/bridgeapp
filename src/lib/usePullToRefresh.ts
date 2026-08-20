'use client'

import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 70
const MAX_PULL = 100

/**
 * 아이폰 홈 화면에 설치된 앱(PWA)에서는 사파리와 달리 화면을 아래로 당겨도
 * 새로고침이 안 됩니다. (그 동작은 사파리 주소창 UI에 딸린 기능이라, 설치된
 * 앱에는 원래 없습니다.) 그래서 직접 당김 동작을 감지해 새로고침합니다.
 *
 * 페이지 맨 위(scrollY = 0)에서 아래로 당길 때만 반응하고, 다른 곳에서
 * 스크롤할 때는 평소와 똑같이 동작합니다.
 */
export function usePullToRefresh() {
  const [pullPx, setPullPx] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      startYRef.current = window.scrollY <= 0 ? e.touches[0].clientY : null
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshing) return
      const dy = e.touches[0].clientY - startYRef.current
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current !== 0) {
          pullRef.current = 0
          setPullPx(0)
        }
        return
      }
      const next = Math.min(dy * 0.5, MAX_PULL)
      pullRef.current = next
      setPullPx(next)
      // 우리가 직접 당김 표시를 그리는 동안은 브라우저의 통통 튀는(rubber-band)
      // 기본 동작이 겹쳐 보이지 않도록 막습니다.
      if (next > 4) e.preventDefault()
    }

    const onTouchEnd = () => {
      if (startYRef.current === null) return
      startYRef.current = null
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true)
        setPullPx(THRESHOLD)
        window.location.reload()
      } else {
        pullRef.current = 0
        setPullPx(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [refreshing])

  return { pullPx, refreshing, threshold: THRESHOLD }
}
