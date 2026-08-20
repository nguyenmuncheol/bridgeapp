'use client'

import { useEffect, useRef } from 'react'

/**
 * 팝업이 열려있는 동안 폰/브라우저 "뒤로가기"를 페이지 이동 대신 팝업 닫기로 가로챕니다.
 *
 * 🐛 과거 불편: 팝업이 떠 있을 때 뒤로가기를 누르면 팝업은 그대로 있고 페이지(탭)가
 * 바뀌어버렸습니다. 안드로이드 사용자는 뒤로가기를 습관적으로 눌러서 자주 겪는 문제였습니다.
 */
export function useModalDismiss(isOpen: boolean, onClose: () => void) {
  const closedByBackRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    closedByBackRef.current = false
    history.pushState({ modal: true }, '')

    const onPopState = () => {
      closedByBackRef.current = true
      onClose()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      // X 버튼 등 뒤로가기가 아닌 방식으로 닫혔으면, 아까 쌓아둔 히스토리 항목을 정리합니다.
      if (!closedByBackRef.current) history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
}

/** 팝업 바깥 배경(backdrop)을 눌렀을 때만 닫히는 클릭 핸들러 (안쪽 내용 클릭은 무시). */
export function backdropClose(onClose: () => void) {
  return (e: React.MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) onClose()
  }
}
