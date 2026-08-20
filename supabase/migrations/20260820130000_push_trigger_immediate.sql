-- 푸시 발송 지연 개선: 알림이 생기자마자 즉시 발송을 시도합니다.
-- (기존 1분 주기 cron은 실패했을 때를 대비한 안전장치로 그대로 둡니다)

create or replace function public.enqueue_push_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_jobs (notification_id) values (new.id);

  perform net.http_post(
    url := 'https://isbwfpokewammwiicxqr.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );

  return new;
end;
$$;
