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

/** 알림 타입별로 눌렀을 때 이동할 화면. 지금은 MANUAL(관리자 직접알림)만 다룹니다. */
function urlFor(type: string): string {
  if (type === 'MANUAL') return '/#home'
  return '/'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (QUIET_HOURS_ENABLED && isVietnamQuietHours()) {
    return Response.json({ skipped: 'quiet-hours' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: jobs, error: jobsError } = await supabase
    .from('push_jobs')
    .select('id, notification_id, notifications(user_id, type, title, body, actor_name)')
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
    if (!notif) {
      await supabase.from('push_jobs').update({ status: 'failed', processed_at: new Date().toISOString() }).eq('id', job.id)
      failed++
      continue
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', notif.user_id)

    const payload = JSON.stringify({
      title: notif.title || CHURCH_NAME,
      body: notif.body || '',
      url: urlFor(notif.type),
    })

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
