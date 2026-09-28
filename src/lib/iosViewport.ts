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
  if (!isIOS()) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const content = meta.getAttribute('content') || ''
  if (/maximum-scale/.test(content)) return
  meta.setAttribute('content', `${content}, maximum-scale=1`)
}

function isIOS() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 는 스스로를 Mac 이라고 소개하므로 터치 지원 여부로 한 번 더 봅니다.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * 아이폰에서 키보드가 올라와도 팝업이 보이는 영역 안에 들어오게 합니다. (globals.css 의 inset-vv 설명 참고)
 *
 * 🐛 문제: 안드로이드는 키보드가 올라오면 화면 높이(dvh) 자체가 줄어 팝업도 같이 줄어듭니다
 *    (layout.tsx 의 interactiveWidget: 'resizes-content'). 아이폰은 이 설정을 모르고 화면 높이도
 *    그대로라, 팝업 아래쪽 [저장]·[닫기] 버튼이 키보드 뒤에 가려졌습니다.
 * → 아이폰에서만 visualViewport(키보드를 뺀, 지금 보이는 영역)의 높이·위치를 CSS 변수로 넘깁니다.
 *    두 손가락으로 확대 중일 때는 값이 흔들리므로 건드리지 않습니다.
 *
 * 돌려주는 함수를 부르면 감시를 멈춥니다.
 */
export function trackIosVisualViewport(): () => void {
  if (!isIOS() || !window.visualViewport) return () => {}
  const vv = window.visualViewport
  const root = document.documentElement.style
  let frame = 0
  const apply = () => {
    frame = 0
    if (Math.abs(vv.scale - 1) > 0.01) return
    root.setProperty('--vv-height', `${vv.height}px`)
    root.setProperty('--vv-top', `${vv.offsetTop}px`)
    root.setProperty('--vv-unit', `${vv.height / 100}px`)
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(apply) }
  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  return () => {
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', schedule)
    if (frame) cancelAnimationFrame(frame)
    root.removeProperty('--vv-height')
    root.removeProperty('--vv-top')
    root.removeProperty('--vv-unit')
  }
}
