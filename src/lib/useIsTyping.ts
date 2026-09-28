'use client'

import { useEffect, useState } from 'react'

const NON_TEXT_INPUTS = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image']

// 드롭다운(select)은 키보드가 아니라 선택 창이 뜨고, 고른 뒤에도 초점이 남아 있어서 넣지 않습니다.
function isTextField(el: EventTarget | null): boolean {
  return el instanceof HTMLTextAreaElement
    || (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(el.type))
}

/**
 * 지금 글자를 입력하는 중인지(= 휴대폰 키보드가 올라와 있을 가능성이 높은지).
 *
 * 화면 아래에 붙어 있는 것들(하단 메뉴, 나눔 탭의 + 버튼)은 키보드가 올라오면 입력칸이나
 * [등록] 버튼을 가립니다. 이 값이 true 인 동안 그런 것들을 숨깁니다.
 * (안드로이드는 layout.tsx 의 interactiveWidget 설정 때문에 키보드가 뜨면 화면이 키보드 위로
 *  줄어들어, 숨기지 않으면 하단 메뉴가 키보드 바로 위로 따라 올라옵니다)
 */
export function useIsTyping(): boolean {
  const [focused, setFocused] = useState(false)
  // 키보드가 실제로 떠 있는지. 입력칸에 초점만 남기고 키보드를 내린 경우(안드로이드 뒤로가기 등)
  // 하단 메뉴를 다시 보여 주려고 봅니다. 보이는 화면 높이(visualViewport)가 크게 줄었으면 키보드가 떠 있는 것.
  // 이 정보를 못 얻는 브라우저에서는 "입력칸에 초점 = 키보드 있음"으로 봅니다.
  const [keyboardOpen, setKeyboardOpen] = useState(() => typeof window === 'undefined' || !window.visualViewport)
  useEffect(() => {
    // 화면 키보드가 없는 PC(마우스)에서는 숨길 이유가 없습니다.
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    const onFocusIn = (e: FocusEvent) => { if (isTextField(e.target)) setFocused(true) }
    const onFocusOut = (e: FocusEvent) => { if (isTextField(e.target)) setFocused(false) }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)

    const vv = window.visualViewport
    let fullHeight = vv?.height ?? 0
    const onResize = () => {
      if (!vv) return
      fullHeight = Math.max(fullHeight, vv.height)
      setKeyboardOpen(vv.height < fullHeight - 120)
    }
    // 가로·세로를 돌리면 "키보드 없을 때 높이"가 달라지므로 다시 잽니다.
    const onOrientation = () => { fullHeight = 0; setTimeout(onResize, 300) }
    if (vv) {
      vv.addEventListener('resize', onResize)
      window.addEventListener('orientationchange', onOrientation)
    }
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onOrientation)
    }
  }, [])
  return focused && keyboardOpen
}
