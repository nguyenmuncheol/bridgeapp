'use client'

/**
 * 아이폰에서 입력칸을 누를 때 화면이 저절로 확대되는 것을 막습니다. (글씨 크기는 그대로)
 *
 * 🐛 문제: 아이폰(사파리·홈 화면 앱)은 글씨가 16px 보다 작은 입력칸을 누르면 화면을 저절로 확대하고,
 *    다 쓴 뒤에도 원래대로 돌아오지 않습니다. 이 앱의 입력칸은 대부분 12~14px 입니다.
 *    글씨를 16px 로 키우면 해결되지만 전체 배치가 흐트러져서 쓰지 않기로 했습니다.
 *
 * → 아이폰에만 화면 설정(viewport)에 maximum-scale=1 을 덧붙입니다.
 *    · 아이폰은 iOS 10 부터 이 값이 있어도 **두 손가락 확대는 막지 않고**(접근성 때문에 무시),
 *      입력칸을 눌렀을 때의 자동 확대만 멈춥니다.
 *    · 안드로이드는 이 값이 있으면 두 손가락 확대까지 막히므로 붙이지 않습니다
 *      (어르신 배려로 확대를 허용한 layout.tsx 의 결정을 지킵니다).
 */
export function preventIosInputAutoZoom() {
  if (typeof window === 'undefined') return
  const ua = navigator.userAgent
  // iPadOS 는 스스로를 Mac 이라고 소개하므로 터치 지원 여부로 한 번 더 봅니다.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!isIOS) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const content = meta.getAttribute('content') || ''
  if (/maximum-scale/.test(content)) return
  meta.setAttribute('content', `${content}, maximum-scale=1`)
}
