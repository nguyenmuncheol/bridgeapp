-- notify_bulletin() 은 "알림 보낸 적 있나 / 날짜가 최근인가" 두 가지만 보고,
-- 주보에 실제 내용이 들어 있는지는 확인하지 않았습니다.
-- 그래서 비어 있는 주보 줄(제목·본문·설교자·요약 전부 빈 문자열, 이미지 0장)도
-- "📖 새 주보가 올라왔습니다 / 2026-09-20" 으로 전 성도에게 발송되고,
-- 발송과 동시에 notified_at 이 찍혀 나중에 올리는 진짜 주보는 알림이 삼켜집니다.
--
-- → 내용이 하나라도 채워졌을 때만 발송하도록 조건을 추가합니다.
--   빈 줄은 금·토 모두 조용히 건너뛰고, 진짜 주보를 올린 뒤
--   가장 먼저 오는 금/토 20시(베트남)에 정상 발송됩니다.

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
     AND date_str::date >= public.vn_today() - 7
     -- 내용이 하나라도 있어야 발송합니다 (빈 껍데기 줄 제외)
     AND (
          COALESCE(array_length(image_urls, 1), 0) > 0
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
