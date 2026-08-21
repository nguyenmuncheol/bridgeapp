-- 10초 안전장치 cron이 Edge Function 무료 실행 한도(월 50만 회)의 절반 이상을
-- 대기 작업만으로 소모하고 있어서, 원래대로 1분 주기로 되돌립니다.
-- 즉시발송(트리거)이 대부분을 처리하고, 이 cron은 실패했을 때만 필요한 안전장치라
-- 1분이면 충분합니다.

select cron.unschedule('send-push-every-10-seconds');

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
