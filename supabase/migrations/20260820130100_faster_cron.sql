-- 안전장치 주기를 1분 → 10초로 단축 (즉시 발송이 실패해도 지연을 최소화)

select cron.unschedule('send-push-every-minute');

select cron.schedule(
  'send-push-every-10-seconds',
  '10 seconds',
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
