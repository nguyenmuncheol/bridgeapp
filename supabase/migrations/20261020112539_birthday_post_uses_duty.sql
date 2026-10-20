-- 생일 축하 자동글에 "성도님" 대신 실제 직분을 씁니다.
--
-- 🐛 과거 불편: notify_birthday() 가 올리는 자동글이 직분과 상관없이 늘
--    "안세영 성도님의 생일입니다" 로 나갔습니다. 집사·자매·목사 등 profiles.duty 에
--    이미 입력된 직분이 있는데도 '성도'로 고정돼 있었기 때문입니다.
-- → 글 제목·본문에 "이름 직분님" (예: 안세영 집사님)으로 표기합니다.
--    직분이 비어 있으면 "이름님" 으로만 씁니다 (like_notification 의 이름표와 같은 규칙).
-- → 이미 올라간 자동글도 같은 형식으로 고칩니다. 글 id 는 그대로라 댓글·좋아요·알림 링크는 유지됩니다.
--
-- 알림함에 가는 개인 알림(BIRTHDAY)은 본인에게 보내는 글이라 "○○님," 그대로 둡니다.

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

  -- "안세영 집사님 · 장호정 자매님" (직분이 없으면 "이름님")
  SELECT string_agg(
           pr.name
             || CASE WHEN NULLIF(btrim(pr.duty), '') IS NOT NULL THEN ' ' || btrim(pr.duty) ELSE '' END
             || '님',
           ' · ' ORDER BY pr.name) INTO v_names
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
    VALUES ('🎂 오늘은 ' || v_names || '의 생일입니다',
            v_names || ', 생일을 진심으로 축하드립니다!' || chr(10) ||
            '한 해 동안 하나님의 은혜와 평안이 늘 함께하시기를 기도합니다.' || chr(10) || chr(10) ||
            '함께 축하의 마음을 나누어 주세요. 🎉',
            '더브릿지교회', 'MEMBER_NEWS', NULL);
  END IF;

  INSERT INTO public.notification_jobs(job_key, detail) VALUES (v_key, COALESCE(v_names, '생일자 없음'));
  RETURN v_count;
END; $function$;

-- ── 이미 올라간 자동글 고치기 ────────────────────────────────────────────────
-- 글에는 생일자 id 가 남아 있지 않아서, "글이 올라간 날(베트남 날짜)"과 같은 MM-DD 생일을 가진
-- 프로필 중 이름이 같은 사람을 찾아 현재 직분을 붙입니다.
-- 프로필을 못 찾으면(이름 변경 등) 그 사람은 예전 표기("성도님")를 그대로 둡니다.
-- 사람이 쓴 글은 author_id 가 있으므로 건드리지 않습니다.
WITH targets AS (
  SELECT p.id,
         (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d,
         regexp_replace(p.title, '^🎂 오늘은 (.+) 성도님의 생일입니다$', '\1') AS old_names
    FROM public.posts p
   WHERE p.author_id IS NULL
     AND p.category = 'MEMBER_NEWS'
     AND p.title ~ '^🎂 오늘은 .+ 성도님의 생일입니다$'
), labels AS (
  SELECT t.id, t.old_names,
         string_agg(
           n.nm
             || CASE WHEN m.name IS NULL THEN ' 성도'
                     WHEN m.duty IS NULL THEN ''
                     ELSE ' ' || m.duty END
             || '님',
           ' · ' ORDER BY n.ord) AS new_names
    FROM targets t
   CROSS JOIN LATERAL unnest(string_to_array(t.old_names, ' · ')) WITH ORDINALITY AS n(nm, ord)
    LEFT JOIN LATERAL (
      SELECT pr.name, NULLIF(btrim(pr.duty), '') AS duty
        FROM public.profiles pr
       WHERE pr.name = n.nm
         AND pr.birthday ~ '^\d{4}-\d{2}-\d{2}$'
         AND substr(pr.birthday, 6, 5) = to_char(t.d, 'MM-DD')
       ORDER BY (pr.role = 'LEFT'), pr.id
       LIMIT 1
    ) m ON true
   GROUP BY t.id, t.old_names
)
UPDATE public.posts p
   SET title   = replace(p.title,   l.old_names || ' 성도님의 생일입니다',          l.new_names || '의 생일입니다'),
       content = replace(p.content, l.old_names || ' 성도님, 생일을 진심으로',      l.new_names || ', 생일을 진심으로')
  FROM labels l
 WHERE p.id = l.id;
