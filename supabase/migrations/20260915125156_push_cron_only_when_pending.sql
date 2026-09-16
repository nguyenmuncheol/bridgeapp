-- 1분마다 도는 send-push-every-minute cron 이 보낼 것이 없어도 매번
-- send-push Edge Function 을 깨워서(하루 1,444회 부팅, 대부분 즉시 shutdown)
-- 리소스를 낭비하고 있었습니다.
--
-- → 보낼 push_jobs 가 실제로 있을 때만(pending, 또는 5분 넘게 processing 에
--   멈춰있는 것) Edge Function 을 호출하는 dispatch_pending_push() 를 만들고
--   cron 이 이 함수를 부르도록 바꿉니다. cron 실행 기록 자체는 계속 1분마다
--   남지만, 실제 HTTP 호출은 조건부로만 나갑니다.

CREATE OR REPLACE FUNCTION public.dispatch_pending_push()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (
    select 1
      from public.push_jobs
     where status = 'pending'
        or (status = 'processing' and processed_at < now() - interval '5 minutes')
  ) then
    return;
  end if;

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
end;
$function$;

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'send-push-every-minute'),
  command => 'select public.dispatch_pending_push();'
);
