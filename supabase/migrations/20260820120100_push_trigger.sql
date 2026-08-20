-- 푸시 알림 도입 1단계: 발송 트리거 + 1분 주기 발송 스케줄
-- 설계 문서: docs/superpowers/specs/2026-08-20-push-notifications-design.md
--
-- ⚠️ send_manual_notification 함수는 이 레포에 정의가 없어(대시보드 관리 상태)
--    직접 고치지 않습니다. 대신 notifications 테이블에 관리자 직접알림
--    (type='MANUAL')이 새로 생기는 것을 감지하는 트리거만 붙입니다.

create or replace function public.enqueue_push_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_jobs (notification_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists trg_notifications_enqueue_push on public.notifications;
create trigger trg_notifications_enqueue_push
  after insert on public.notifications
  for each row
  when (new.type = 'MANUAL')
  execute function public.enqueue_push_job();

-- ── Edge Function(send-push)을 1분마다 호출 ──
-- pg_net으로 호출하며, 인증에는 Vault에 저장해 둔 service_role 키를 씁니다.
-- Vault 시크릿은 이 파일에 값이 들어가지 않도록 SQL 편집기에서 한 번만 직접 등록합니다:
--   select vault.create_secret('<Settings > API > service_role 키>', 'service_role_key');
-- (자세한 순서는 설계 문서 §10 배포 체크리스트 참고)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-push-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://isbwfpokewammwiicxqr.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
