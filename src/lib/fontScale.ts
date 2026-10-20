/**
 * 큰 글씨 모드 — 앱 전체 글씨 크기를 4단계로 고릅니다. (마이페이지 → 글씨 크기)
 *
 * 앱의 글자·여백·버튼은 전부 rem(= html 글씨 크기의 배수)으로 적혀 있습니다(globals.css "글자 크기 체계").
 * 그래서 html 에 단계 표시(data-font-scale)만 달면, CSS 가 html 글씨 크기를 바꿔 화면 전체가 **함께** 커집니다.
 *
 *   1 작게 90% · 2 보통 100%(기본값 = 큰 글씨 모드 이전의 화면) · 3 크게 112.5% · 4 아주 크게 125%
 *
 * 고른 단계는 **이 기기에만** 저장합니다(localStorage). 어르신은 대개 휴대폰 한 대만 쓰시고,
 * 로그인 전 화면에도 바로 적용되며, 서버(DB)를 바꿀 필요가 없습니다.
 * 기본값(2)은 따로 저장하지 않고 표시도 달지 않습니다 — 설정을 건드리지 않은 분의 화면은 예전과 똑같습니다.
 */

export type FontScale = 1 | 2 | 3 | 4

export const DEFAULT_FONT_SCALE: FontScale = 2

export const FONT_SCALE_OPTIONS: { level: FontScale; label: string }[] = [
  { level: 1, label: '작게' },
  { level: 2, label: '보통' },
  { level: 3, label: '크게' },
  { level: 4, label: '아주 크게' },
]

const KEY = 'bridge:fontScale'
const ATTR = 'data-font-scale'
const CHANGE_EVENT = 'bridge:fontscalechange'

/**
 * 화면이 그려지기 **전에** 저장된 단계를 html 에 다는 짧은 스크립트입니다(app/layout.tsx 의 <head>).
 * React 가 뜬 뒤에 적용하면 작은 글씨로 한 번 그려졌다가 커지는 깜빡임이 보입니다.
 * (Next 안내서 "Preventing Flash before hydration" 의 테마 예시와 같은 방식)
 */
export const FONT_SCALE_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(KEY)});if(s==="1"||s==="3"||s==="4")document.documentElement.setAttribute(${JSON.stringify(ATTR)},s)}catch(e){}})()`

function isFontScale(v: unknown): v is FontScale {
  return v === 1 || v === 2 || v === 3 || v === 4
}

/** 저장된 단계. 저장공간을 못 읽거나 값이 이상하면 기본값(2). */
export function readFontScale(): FontScale {
  try {
    const v = Number(localStorage.getItem(KEY))
    return isFontScale(v) ? v : DEFAULT_FONT_SCALE
  } catch {
    return DEFAULT_FONT_SCALE
  }
}

/** html 에 단계를 반영합니다. 기본값이면 표시를 뗍니다. */
export function applyFontScale(level: FontScale) {
  const html = document.documentElement
  if (level === DEFAULT_FONT_SCALE) html.removeAttribute(ATTR)
  else html.setAttribute(ATTR, String(level))
}

/** 단계를 바꿉니다 — 화면에 바로 반영하고 이 기기에 저장합니다. */
export function setFontScale(level: FontScale) {
  applyFontScale(level)
  try {
    if (level === DEFAULT_FONT_SCALE) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(level))
  } catch { /* 저장 못 해도 지금 화면에는 적용됩니다 */ }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** useSyncExternalStore 용 — 단계가 바뀌면(이 탭에서든 다른 탭에서든) 알려 줍니다. */
export function subscribeFontScale(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    applyFontScale(readFontScale())
    onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}
