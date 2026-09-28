// ─────────────────────────────────────────────────────────────────────
// 더브릿지 교회 앱 서비스워커
//
// ⚠️ 화면·프로그램 파일은 **캐시하지 않습니다**(아래 이유). 예외는 딱 하나,
//    인터넷이 끊겼을 때 보여 줄 안내 화면(/offline.html)뿐입니다.
//    화면 요청은 언제나 네트워크로 먼저 나가고, **실패했을 때만** 안내 화면을 보여 줍니다.
//
// 왜 껐는지:
//   이전 버전은 저장해둔 화면을 먼저 보여주고 뒤에서 새 버전을 받아오는 방식이었는데,
//   두 가지 문제가 있었습니다.
//
//   1) 새 버전을 받아오는 작업을 브라우저에 정식으로 등록(event.waitUntil)하지 않아서,
//      아이폰이 그 작업을 중간에 꺼버렸습니다. 결과적으로 앱을 업데이트해도 어르신
//      휴대폰에는 영영 전달되지 않고, 앱을 지웠다 다시 깔기 전까지 옛 버전에 갇혔습니다.
//      (게다가 CACHE_NAME이 배포마다 바뀌지 않아서 activate 단계의 정리도 안 돌았습니다.)
//
//   2) 저장된 옛 화면은 옛 프로그램 파일(주소에 고유 번호가 붙어 있음)을 찾는데,
//      새로 배포하면 그 파일들이 서버에서 사라집니다. 그러면 영어로 "Application error"만
//      뜨거나 아예 하얀 화면이 됩니다. 어르신이 스스로 복구할 방법이 없습니다.
//
// 그런데 왜 파일 자체는 남겨두는지:
//   안드로이드에서 "홈 화면에 앱 추가" 설치 버튼이 뜨려면 서비스워커에 fetch 처리기가
//   **존재하기만 해도** 됩니다. 그래서 파일과 등록은 유지하되, 실제 응답에는 전혀
//   개입하지 않습니다(= 항상 평소처럼 네트워크로 나갑니다).
//
// 나중에 오프라인 기능을 켤 때 지켜야 할 것:
//   - 화면(navigate 요청)은 반드시 네트워크 우선. 캐시 우선으로 하면 위 2)가 재발합니다.
//   - 캐시해도 안전한 건 /_next/static/ 아래 파일뿐입니다(주소에 고유 번호가 붙어
//     내용이 바뀌면 주소도 바뀌므로).
//   - 배포할 때마다 CACHE_NAME이 바뀌어야 하고, 뒤에서 갱신하는 작업은
//     event.waitUntil()로 등록해야 합니다.
//   - Supabase API 요청과 /auth/ 경로는 절대 캐시하면 안 됩니다.
//   - 반드시 실제 안드로이드/아이폰에서 "배포 → 재실행" 테스트를 거친 뒤 켜세요.
// ─────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'bridge-church-shell-'
// 연결 끊김 안내 화면 전용 저장소. 안내 화면을 고치면 끝 번호를 올려 주세요.
const OFFLINE_CACHE = 'bridge-offline-v1'
const OFFLINE_URL = '/offline.html'
const OFFLINE_ASSETS = [OFFLINE_URL, '/logo-square.png']

// 설치되면 곧바로 활성화 (옛 서비스워커가 계속 남아있지 않도록)
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch(() => { /* 저장에 실패해도 설치는 계속합니다(끊겼을 때 브라우저 기본 화면이 나올 뿐) */ })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 예전 버전이 저장해둔 캐시를 전부 정리합니다.
      // (이미 옛 화면에 갇힌 분들을 풀어주는 역할도 합니다)
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) || (k.startsWith('bridge-offline-') && k !== OFFLINE_CACHE))
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// 화면(navigate) 요청만 다룹니다. 언제나 **네트워크 우선**이고, 네트워크가 실패했을 때만
// 저장해 둔 안내 화면을 보여 줍니다. 그 밖의 요청(프로그램 파일·사진·Supabase)은
// 일부러 event.respondWith()를 호출하지 않습니다 → 브라우저가 평소대로 처리합니다.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return cached || Response.error()
      })
    )
    return
  }
  // 안내 화면에 들어가는 교회 로고 — 이것도 네트워크가 먼저이고, 실패했을 때만 저장본을 씁니다.
  if (new URL(req.url).pathname === '/logo-square.png') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/logo-square.png')) || Response.error()))
  }
})

// ─────────────────────────────────────────────────────────────────────
// 푸시 알림 (2026-08-20 추가)
// ─────────────────────────────────────────────────────────────────────

const CHURCH_NAME = '더브릿지교회'

self.addEventListener('push', (event) => {
  let data = { title: CHURCH_NAME, body: '', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // payload가 JSON이 아니면 기본값 그대로 보여줍니다.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo-square.png',
      badge: '/logo-square.png',
      // tag 는 서버가 넣어 주는 알림 번호입니다(알림 1건짜리 발송일 때). 누르면 앱이 이 번호로
      // 알림함과 같은 규칙(destinationOf)을 찾아 그 글이 있는 탭·소메뉴까지 엽니다.
      data: { url: data.url || '/', notificationId: data.tag || '' },
      // 같은 알림이 혹시라도 두 번 전달돼도(드문 FCM 재전송 등) 기기에서 한 개로 합쳐지도록
      // 알림마다 고유한 tag를 붙입니다. tag가 없으면 매번 새 알림으로 쌓입니다.
      tag: data.tag || undefined,
    })
  )
})

// 알림을 눌렀을 때.
//
// 🐛 과거 문제
//  ① 앱이 이미 열려 있어도 client.navigate() 로 주소를 바꿔서, 주소가 조금만 달라도 앱이 통째로
//     다시 켜졌습니다(로그인 확인·데이터 다시 받기, 보던 화면·쓰던 글 사라짐).
//  ② 주소에는 큰 탭(#news)만 있어서, 알림함에서 누를 때와 달리 소메뉴(가족소식 등)나
//     관리자 대시보드의 탭(가입 승인·출석)까지는 가지 못했습니다.
//  ③ "확인 안 하신 댓글·좋아요가 N건" 요약 알림은 홈으로만 가서, 무엇이 왔는지 볼 수 없었습니다.
//
// → 열려 있는 앱에는 "이 알림을 열어 주세요"라고 **메시지만** 보냅니다(다시 켜지 않음).
//   앱(app/page.tsx)이 알림함과 같은 규칙으로 목적지를 찾고, 요약 알림이면 알림함을 열어 줍니다.
//   앱이 닫혀 있으면 주소에 알림 번호(?n=)를 붙여 열고, 앱이 켜진 뒤 같은 방식으로 찾아갑니다.
//   (메시지를 못 알아듣는 옛 화면이 떠 있으면 1.5초 뒤 예전처럼 주소를 바꿉니다)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const targetUrl = data.url || '/'
  const notificationId = data.notificationId || ''

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = clientsList.find((c) => c.url.startsWith(self.location.origin)) || clientsList[0]
      if (client) {
        try {
          if ('focus' in client) await client.focus()
        } catch {
          // 초점을 못 옮겨도 아래 안내는 계속합니다
        }
        const handled = await askAppToOpen(client, { url: targetUrl, notificationId })
        if (handled) return
        if ('navigate' in client) {
          try {
            await client.navigate(withNotificationParam(targetUrl, notificationId))
            return
          } catch {
            // 이 서비스워커가 관리하지 않는 창이면 navigate 가 실패합니다 → 새 창으로
          }
        }
      }
      return self.clients.openWindow(withNotificationParam(targetUrl, notificationId))
    })()
  )
})

/** '/#request' + 알림 번호 → '/?n=<번호>#request' */
function withNotificationParam(url, notificationId) {
  const u = new URL(url, self.location.origin)
  if (notificationId) u.searchParams.set('n', notificationId)
  return u.href
}

/** 열려 있는 앱에 알림을 열어 달라고 부탁합니다. 앱이 "받았다"고 답하면 true. */
function askAppToOpen(client, payload) {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), 1500)
    channel.port1.onmessage = () => {
      clearTimeout(timer)
      resolve(true)
    }
    try {
      client.postMessage({ type: 'bridge:open-notification', ...payload }, [channel.port2])
    } catch {
      clearTimeout(timer)
      resolve(false)
    }
  })
}
