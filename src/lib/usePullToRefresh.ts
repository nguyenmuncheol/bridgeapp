'use client'

import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 70
const MAX_PULL = 100
/** 새로 받는 일이 금방 끝나도 돌아가는 표시를 이만큼은 보여 줍니다(눌린 건지 알 수 있게). */
const MIN_SPIN_MS = 600

/**
 * 아이폰 홈 화면에 설치된 앱(PWA)에서는 사파리와 달리 화면을 아래로 당겨도
 * 새로고침이 안 됩니다. (그 동작은 사파리 주소창 UI에 딸린 기능이라, 설치된
 * 앱에는 원래 없습니다.) 그래서 직접 당김 동작을 감지해 새로고침합니다.
 *
 * 페이지 맨 위(scrollY = 0)에서 아래로 당길 때만 반응하고, 다른 곳에서
 * 스크롤할 때는 평소와 똑같이 동작합니다.
 *
 * 🐛 예전엔 당기면 window.location.reload() 로 **앱 전체를 다시 켰습니다.** 로그인 확인부터 다시 하고
 *    모든 화면 데이터를 처음부터 받느라 느렸고(베트남 모바일 데이터), 잠깐 흰 화면·로딩 표시가 떴습니다.
 * → onRefresh 를 넘기면 그 함수로 **데이터만** 새로 받습니다. 넘기지 않으면 예전처럼 다시 불러옵니다.
 */
export function usePullToRefresh(onRefresh?: () => Promise<unknown>) {
  const [pullPx, setPullPx] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)
  const pullRef = useRef(0)
  // 최신 onRefresh 를 가리킵니다(아래 이벤트 등록을 매번 다시 하지 않으려고).
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh })

  useEffect(() => {
    // 출석체크 등 내부 스크롤이 있는 모달은 열려 있는 동안 document.body.style.overflow를
    // 'hidden'으로 잠급니다(ImageViewerModal 등과 동일한 관례). 이 값이 'hidden'이면
    // 모달 내부를 스크롤하려는 손짓을 이 훅이 "당겨서 새로고침"으로 가로채면 안 됩니다.
    // 🐛 과거 버그: 이 검사가 없어서 모달이 열려 있어도(배경 페이지 scrollY가 0이면)
    // 모달 안에서 아래로 드래그할 때마다 새로고침이 시도되어 모달 안 스크롤 자체가 막혔습니다.
    const isScrollLockedByModal = () => document.body.style.overflow === 'hidden'

    const onTouchStart = (e: TouchEvent) => {
      if (isScrollLockedByModal()) {
        startYRef.current = null
        return
      }
      startYRef.current = window.scrollY <= 0 ? e.touches[0].clientY : null
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshing) return
      if (isScrollLockedByModal()) {
        startYRef.current = null
        if (pullRef.current !== 0) {
          pullRef.current = 0
          setPullPx(0)
        }
        return
      }
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
        const refresh = onRefreshRef.current
        if (!refresh) {
          window.location.reload()
          return
        }
        const minSpin = new Promise(resolve => setTimeout(resolve, MIN_SPIN_MS))
        Promise.allSettled([refresh(), minSpin]).then(() => {
          pullRef.current = 0
          setPullPx(0)
          setRefreshing(false)
        })
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
