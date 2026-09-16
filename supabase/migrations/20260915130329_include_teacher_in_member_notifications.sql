-- 공지·주보·식사·생일 알림 대상 조회가 role IN ('MEMBER','LEADER','ADMIN') 로만
-- 걸려 있어 TEACHER 등급 성도 2명이 계속 알림에서 빠지고 있었습니다.
-- 네 함수 모두 TEACHER 를 포함하도록 조건을 맞춥니다.

CREATE OR REPLACE FUNCTION public.notify_on_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.category, '') <> 'NOTICE' THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, actor_name, post_id, post_category)
  SELECT pr.id, 'NOTICE',
         COALESCE(NULLIF(NEW.title, ''), '새 공지사항'),
         left(COALESCE(NEW.content, ''), 60),
         COALESCE(NEW.author_name, '교회'),
         NEW.id, 'NOTICE'
    FROM public.profiles pr
   WHERE pr.role IN ('MEMBER', 'LEADER', 'ADMIN', 'TEACHER')  -- 대기·거절·업무용 계정 제외
     AND pr.id IS DISTINCT FROM NEW.author_id;                -- 올린 본인은 제외
  RETURN NEW;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.notify_meal_pending(p_round integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sunday date := public.vn_upcoming_sunday();
  v_key    text := 'meal:' || v_sunday::text || ':' || p_round::text;
  v_count  int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.notification_jobs WHERE job_key = v_key) THEN
    RETURN -1;   -- 이미 보냄
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, actor_name)
  SELECT pr.id, 'MEAL',
         '🍚 ' || to_char(v_sunday, 'MM월 DD일') || ' 주일 식사 신청',
         CASE WHEN p_round = 1
              THEN '아직 신청하지 않으셨습니다. 토요일 오후 2시까지 신청해 주세요.'
              ELSE '오늘 오후 2시에 마감됩니다. 아직 신청하지 않으셨습니다.' END,
         '더브릿지교회'
    FROM public.profiles pr
   WHERE pr.role IN ('MEMBER','LEADER','ADMIN','TEACHER')
     AND NOT EXISTS (
       SELECT 1
         FROM public.meal_registrations mr
        WHERE mr.date_str = v_sunday
          AND (
            mr.family_group_id = COALESCE(NULLIF(pr.family_group_id,''), 'fam_single_' || pr.id::text)
            OR mr.registered_by_user_id IN (
                 SELECT p2.id FROM public.profiles p2
                  WHERE COALESCE(NULLIF(p2.family_group_id,''), 'fam_single_' || p2.id::text)
                      = COALESCE(NULLIF(pr.family_group_id,''), 'fam_single_' || pr.id::text)
               )
          )
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.notification_jobs(job_key, detail) VALUES (v_key, v_count::text || '명에게 발송');
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.notify_birthday()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := public.vn_today();
  v_key   text := 'birthday:' || v_today::text;
  v_names text;
  v_count int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.notification_jobs WHERE job_key = v_key) THEN
    RETURN -1;
  END IF;

  SELECT string_agg(pr.name, ' · ' ORDER BY pr.name) INTO v_names
    FROM public.profiles pr
   WHERE pr.role IN ('MEMBER','LEADER','ADMIN','TEACHER')
     AND pr.birthday ~ '^\d{4}-\d{2}-\d{2}$'
     AND substr(pr.birthday, 6, 5) = to_char(v_today, 'MM-DD');

  IF v_names IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, actor_name)
    SELECT pr.id, 'BIRTHDAY', '🎂 생일을 축하합니다!',
           pr.name || '님, 더브릿지교회가 생일을 축하합니다. 오늘 하루 하나님의 은혜가 가득하시길 기도합니다.',
           '더브릿지교회'
      FROM public.profiles pr
     WHERE pr.role IN ('MEMBER','LEADER','ADMIN','TEACHER')
       AND pr.birthday ~ '^\d{4}-\d{2}-\d{2}$'
       AND substr(pr.birthday, 6, 5) = to_char(v_today, 'MM-DD');
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO public.posts (title, content, author_name, category, author_id)
    VALUES ('🎂 오늘은 ' || v_names || ' 성도님의 생일입니다',
            v_names || ' 성도님, 생일을 진심으로 축하드립니다!' || chr(10) ||
            '한 해 동안 하나님의 은혜와 평안이 늘 함께하시기를 기도합니다.' || chr(10) || chr(10) ||
            '함께 축하의 마음을 나누어 주세요. 🎉',
            '더브릿지교회', 'MEMBER_NEWS', NULL);
  END IF;

  INSERT INTO public.notification_jobs(job_key, detail) VALUES (v_key, COALESCE(v_names, '생일자 없음'));
  RETURN v_count;
END; $function$;
