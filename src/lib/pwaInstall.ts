'use client'

// ─────────────────────────────────────────────────────────────────────
// "홈 화면에 앱 추가" 설치 신호 보관소
//
// 🐛 과거 버그: 설치 버튼(PwaInstallButton)이 브라우저의 설치 신호
// (beforeinstallprompt)를 직접 기다렸습니다. 그런데 이 신호는 **앱을 켜고 1~2초 뒤
// 딱 한 번** 발생하는데, 그 버튼은 [내정보 탭 → 아코디언 펼치기]를 해야 비로소
// 화면에 등장합니다. 신호는 이미 몇 분 전에 지나갔고 버튼은 뒤늦게 도착해서
// "아무 신호도 못 받았네" 하고 조용히 숨었습니다. → 버튼이 절대 안 뜨는 구조였습니다.
//
// → 신호를 앱 시작 시점(PwaRegister, 최상위 레이아웃에 항상 붙어 있음)에서 미리 받아
//   여기에 보관해두고, 버튼은 나중에 마운트되어 보관된 걸 꺼내 씁니다.
// ─────────────────────────────────────────────────────────────────────

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach(fn => fn())
}

/** 앱 시작 시 1회 호출. 브라우저 설치 신호를 가로채 보관합니다. */
export function startListeningForInstallPrompt(): () => void {
  if (typeof window === 'undefined') return () => {}

  const onBeforeInstall = (e: Event) => {
    // 브라우저 기본 설치 배너를 막고, 우리 버튼으로 유도합니다.
    e.preventDefault()
    deferredPrompt = e as InstallPromptEvent
    emit()
  }
  const onInstalled = () => {
    installed = true
    deferredPrompt = null
    emit()
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)

  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

export function subscribeInstallState(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 지금 "딸깍 설치" 버튼을 보여줄 수 있는 상태인지 */
export function canInstall(): boolean {
  return !installed && deferredPrompt !== null
}

/** 이미 홈 화면 앱으로 실행 중인지 (그렇다면 설치 안내 자체가 불필요) */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * 실제 설치 실행.
 * prompt()는 한 번 쓰면 재사용할 수 없으므로, 호출 후 보관값을 비웁니다.
 */
export async function triggerInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  const promptEvent = deferredPrompt
  deferredPrompt = null
  emit()
  try {
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}
