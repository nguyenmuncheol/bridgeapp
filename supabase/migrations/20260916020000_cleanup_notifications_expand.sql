-- cleanup_notifications() 이 알림(60일)과 작업기록(180일)만 지우고 있어
-- 두 가지가 계속 쌓입니다.
--   1) user_access_logs: 정리 주기가 아예 없었습니다. 관리자 분석 화면이
--      "7일 이내 접속" 을 보므로 60일보다 넉넉히 180일로 잡습니다.
--   2) 댓글·좋아요 묶음 푸시로 생긴 push_jobs: notification_id 가 null 이라
--      알림 60일 정리의 CASCADE 에 안 걸려 영원히 남습니다.

CREATE OR REPLACE FUNCTION public.cleanup_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_n int;
BEGIN
  DELETE FROM public.notifications WHERE created_at < now() - interval '60 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  DELETE FROM public.notification_jobs WHERE ran_at < now() - interval '180 days';

  -- 댓글·좋아요 묶음 푸시는 notification_id 가 null 이라 CASCADE 에 안 걸립니다
  DELETE FROM public.push_jobs
   WHERE notification_id IS NULL
     AND created_at < now() - interval '60 days';

  -- 접속 로그: 분석 화면이 최근 구간을 보므로 넉넉히 180일
  DELETE FROM public.user_access_logs
   WHERE accessed_at < now() - interval '180 days';

  RETURN v_n;
END; $function$;
