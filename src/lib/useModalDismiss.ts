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

/**
 * 글 작성/수정 모달 전용 가드 훅.
 *
 * 1. 모바일 풀-투-리프레시(Pull to Refresh) 차단:
 *    모달이 열리면 document.body와 documentElement의 overscroll-behavior를 'none'으로 지정하고
 *    body overflow를 'hidden'으로 잠가, 모바일 화면을 위아래로 당겨도 페이지가 새로고침되지 않도록 방지합니다.
 * 2. 브라우저 새로고침/탭 닫기 경고 (beforeunload):
 *    작성 중인 내용이 있을 때 새로고침/이동 시도 시 브라우저 기본 경고창을 띄웁니다.
 * 3. 폰 뒤로가기 키(Android Back Button) 안전 차단:
 *    작성 중인 내용이 있을 때 뒤로가기를 누르면 바로 닫히지 않고 확인 창을 띄웁니다.
 */
export function useWriteModalGuard(
  isOpen: boolean,
  hasUnsavedChanges: boolean,
  onClose: () => void
) {
  const closedByBackRef = useRef(false)
  const hasUnsavedRef = useRef(hasUnsavedChanges)
  hasUnsavedRef.current = hasUnsavedChanges

  useEffect(() => {
    if (!isOpen) return

    // 1. 모바일 브라우저 풀-투-리프레시 및 배경 스크롤 차단
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY
    const prevDocOverscroll = document.documentElement.style.overscrollBehaviorY
    const prevBodyOverflow = document.body.style.overflow

    document.body.style.overscrollBehaviorY = 'none'
    document.documentElement.style.overscrollBehaviorY = 'none'
    document.body.style.overflow = 'hidden'

    // 2. 브라우저 새로고침 / 이탈 방지
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedRef.current) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // 3. 폰 뒤로가기 키 처리
    closedByBackRef.current = false
    history.pushState({ writeModal: true }, '')

    const onPopState = () => {
      if (hasUnsavedRef.current) {
        const leave = window.confirm('작성 중인 내용이 있습니다. 정말 창을 닫으시겠습니까?\n작성 중인 내용은 저장되지 않습니다.')
        if (!leave) {
          history.pushState({ writeModal: true }, '')
          return
        }
      }
      closedByBackRef.current = true
      onClose()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      document.body.style.overscrollBehaviorY = prevBodyOverscroll
      document.documentElement.style.overscrollBehaviorY = prevDocOverscroll
      document.body.style.overflow = prevBodyOverflow
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', onPopState)
      if (!closedByBackRef.current) {
        history.back()
      }
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

