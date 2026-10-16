-- 이미 지난 주보가 뒤늦게 알림으로 나가던 문제를 고칩니다.
--
-- notify_bulletin() 은 "date_str >= 오늘 - 7" 이면 보냈기 때문에, 토요일 20시 발송 이후에
-- 저장된 주보(알림 미발송)가 다음 금요일 크론에 예배일이 지난 채로 발송됐습니다
-- (2026-10-11 주보가 10-16 에 발송된 사례).
--
-- 1) 예배일(date_str)이 오늘 이후인 주보만 발송합니다. 지난 주보는 건너뜁니다.
-- 2) 토요일 20시를 놓친 경우를 위해 일요일 오전 9시(베트남, UTC 02:00)에 한 번 더 돕니다.
--    당일(일요일) 주보는 조건 1 을 통과하므로 예배 당일 아침에 발송됩니다.

CREATE OR REPLACE FUNCTION public.notify_bulletin()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b     record;
  v_count int := 0;
BEGIN
  SELECT * INTO v_b
    FROM public.bulletins
   WHERE notified_at IS NULL
     AND date_str ~ '^\d{4}-\d{2}-\d{2}$'
     -- 예배일이 지난 주보는 보내지 않습니다
     AND date_str::date >= public.vn_today()
     -- 작성 중(임시저장)인 주보는 보내지 않습니다
     AND COALESCE(status, 'published') = 'published'
     -- 내용이 하나라도 있어야 발송합니다 (빈 껍데기 줄 제외)
     AND (
          COALESCE(array_length(image_urls, 1), 0) > 0
       OR content IS NOT NULL
       OR COALESCE(btrim(title), '')    <> ''
       OR COALESCE(btrim(passage), '')  <> ''
       OR COALESCE(btrim(preacher), '') <> ''
       OR COALESCE(btrim(summary), '')  <> ''
     )
   ORDER BY date_str DESC
   LIMIT 1;

  IF v_b.id IS NULL THEN RETURN -1; END IF;   -- 보낼 주보 없음

  INSERT INTO public.notifications (user_id, type, title, body, actor_name)
  SELECT pr.id, 'BULLETIN',
         '📖 새 주보가 올라왔습니다',
         COALESCE(NULLIF(v_b.title,''), v_b.date_str)
           || CASE WHEN COALESCE(v_b.passage,'') <> '' THEN ' · ' || v_b.passage ELSE '' END,
         '더브릿지교회'
    FROM public.profiles pr
   WHERE pr.role IN ('MEMBER','LEADER','ADMIN','TEACHER');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.bulletins SET notified_at = now() WHERE id = v_b.id;
  RETURN v_count;
END; $function$;

-- CREATE OR REPLACE 는 기존 권한을 유지하지만, 명시적으로 다시 남겨 둡니다.
REVOKE EXECUTE ON FUNCTION public.notify_bulletin() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.notify_bulletin() TO service_role;

-- 일요일 오전 9시(베트남 = UTC 02:00). 같은 이름이 있으면 갱신됩니다.
SELECT cron.schedule('bridge-bulletin-sun', '0 2 * * 0', 'select public.notify_bulletin()');
