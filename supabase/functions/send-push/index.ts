// 푸시 알림 발송 (1단계: 관리자 직접알림만)
// 설계 문서: docs/superpowers/specs/2026-08-20-push-notifications-design.md
//
// pg_cron이 1분마다 이 함수를 호출합니다. 매번 push_jobs의 미처리 항목을 찾아
// 대상자의 등록된 기기로 전송하고, 결과를 기록합니다.
// 실패해도 앱 안 알림함(notifications)에는 영향이 없습니다 — 완전히 분리되어 있습니다.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
// 조용한 시간대 스위치. 기본 꺼짐(테스트 기간용) — 전체 공개 전에 시크릿으로 켭니다.
const QUIET_HOURS_ENABLED = (Deno.env.get('PUSH_QUIET_HOURS_ENABLED') ?? 'false').toLowerCase() === 'true'

const CHURCH_NAME = '더브릿지교회'

webpush.setVapidDetails('mailto:admin@thebridgechurch.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

/** 지금이 베트남 시각 밤 10시~오전 8시인지 */
function isVietnamQuietHours(): boolean {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
  const hour = Number(hourStr === '24' ? '0' : hourStr)
  return hour >= 22 || hour < 8
}

/** 알림 타입별로 눌렀을 때 이동할 화면 (앱의 NotificationPanel destinationOf()와 동일한 규칙). */
function urlFor(type: string): string {
  if (type === 'MEAL') return '/#request'
  if (type === 'ATTENDANCE') return '/#mypage'
  if (type === 'BULLETIN') return '/#home'
  if (type === 'BIRTHDAY') return '/#news'
  if (type === 'NOTICE') return '/#home'
  if (type === 'MANUAL') return '/#home'
  if (type === 'SIGNUP_REQUEST') return '/#mypage'
  return '/'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // 조용한 시간대여도 가입 승인 요청만은 관리자가 바로 알아야 하므로 발송 대상에서 건너뛰지 않습니다
  // (아래 for 루프에서 알림 타입별로 판단합니다). 여기서는 그 사실만 기억해둡니다.
  const quietHoursNow = QUIET_HOURS_ENABLED && isVietnamQuietHours()

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: jobs, error: jobsError } = await supabase
    .from('push_jobs')
    .select('id, notification_id, user_id, payload, notifications(id, user_id, type, title, body, actor_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)

  if (jobsError) {
    return Response.json({ error: jobsError.message }, { status: 500 })
  }
  if (!jobs || jobs.length === 0) {
    return Response.json({ processed: 0 })
  }

  let sent = 0
  let failed = 0

  for (const job of jobs) {
    const notif = Array.isArray(job.notifications) ? job.notifications[0] : job.notifications
    // 알림 1건짜리 발송이면 그 알림에서, 요약(digest) 발송이면 push_jobs에 직접 담긴 값에서 가져옵니다.
    const targetUserId = notif?.user_id ?? job.user_id
    // tag: 같은 알림이 혹시라도 두 번 전달돼도 기기에서 하나로 합쳐지도록 알림/작업마다 고유값을 줍니다.
    const payloadSource = notif
      ? { title: notif.title || CHURCH_NAME, body: notif.body || '', url: urlFor(notif.type), tag: job.notification_id }
      : job.payload
        ? { title: job.payload.title || CHURCH_NAME, body: job.payload.body || '', url: job.payload.url || '/', tag: job.id }
        : null

    if (!targetUserId || !payloadSource) {
      await supabase.from('push_jobs').update({ status: 'failed', processed_at: new Date().toISOString() }).eq('id', job.id)
      failed++
      continue
    }

    // 조용한 시간대엔 가입 승인 요청 외에는 미뤄둡니다 (pending으로 남겨 다음 실행 때 다시 시도).
    if (quietHoursNow && notif?.type !== 'SIGNUP_REQUEST') {
      continue
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', targetUserId)

    const payload = JSON.stringify(payloadSource)

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          // 앱을 지웠거나 구독이 만료된 기기 — 죽은 구독을 정리합니다.
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }

    await supabase.from('push_jobs').update({ status: 'sent', processed_at: new Date().toISOString() }).eq('id', job.id)
    sent++
  }

  return Response.json({ processed: jobs.length, sent, failed })
})
