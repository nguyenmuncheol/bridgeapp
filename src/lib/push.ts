/**
 * 휴대폰 푸시 알림 구독 관리 (1단계: 관리자 직접알림만)
 * 설계 문서: docs/superpowers/specs/2026-08-20-push-notifications-design.md
 *
 * 권한 창은 사용자가 스위치를 누를 때만 뜹니다 — 절대 자동으로 묻지 않습니다.
 */

export type PushUiState = 'unsupported' | 'ios-not-installed' | 'off' | 'on' | 'denied'

function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

/** 지금 상태를 보고 스위치/문구를 어떻게 보여줄지 판단합니다. */
export async function getPushUiState(): Promise<PushUiState> {
  if (!isPushSupported()) return 'unsupported'
  if (isIos() && !isStandalone()) return 'ios-not-installed'
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied'

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

function deviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone'
  if (/android/i.test(ua)) return 'Android'
  return 'PC'
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

/** 스위치를 켤 때 호출 — 이 순간에만 브라우저 권한 창이 뜹니다. */
export async function subscribeToPush(): Promise<PushSubscriptionJSON> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  if (!vapidPublicKey) throw new Error('푸시 설정이 아직 준비되지 않았습니다.')

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  })
  return { ...sub.toJSON(), deviceLabel: deviceLabel() } as PushSubscriptionJSON & { deviceLabel: string }
}

/** 스위치를 끌 때 호출. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}
