-- 좋아요 알림 이름 표기 수정: "임혜영님님이 좋아요를…" → "임혜영 사모님이 좋아요를…"
--
-- 🐛 증상: 알림함에 "○○님님이 좋아요를 눌렀습니다" 처럼 '님'이 두 번 붙었습니다.
--    toggle_post_like 가 actor_name 을 '이름 || 님' 으로 저장하는데, 알림함 화면
--    (NotificationPanel)은 actor_name 뒤에 다시 '님이 …' 를 붙이기 때문입니다.
--    또 직분이 빠져서, 댓글 알림("임혜영 사모님이 댓글을…")과 호칭도 달랐습니다.
--
-- ✅ 수정: 댓글 작성자 이름(getUserDisplayName)과 똑같이 "이름 직분" 으로 저장하고
--    '님'은 화면에서만 붙입니다. 이미 저장된 '○○님' 도 끝의 '님'을 떼어 정리합니다.

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid, p_user_id text)
 RETURNS TABLE(likes integer, liked_user_ids text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_liked     text[];
  v_new       text[];
  v_likes     integer;
  v_secret    boolean;
  v_author    uuid;
  v_category  text;
  v_title     text;
  v_added     boolean;
  v_actor     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION '본인 계정으로만 누를 수 있습니다.';
  END IF;

  SELECT COALESCE(p.liked_user_ids, '{}'::text[]),
         COALESCE(p.is_secret, false),
         p.author_id,
         COALESCE(p.category, ''),
         COALESCE(NULLIF(p.title, ''), '게시글')
    INTO v_liked, v_secret, v_author, v_category, v_title
    FROM public.posts p
   WHERE p.id = p_post_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '게시글을 찾을 수 없습니다.';
  END IF;

  IF v_secret AND v_author IS DISTINCT FROM auth.uid() AND NOT public.can_view_secret_posts() THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;

  IF p_user_id = ANY (v_liked) THEN
    v_new := array_remove(v_liked, p_user_id);
    v_added := false;
  ELSE
    v_new := array_append(v_liked, p_user_id);
    v_added := true;
  END IF;

  v_likes := COALESCE(array_length(v_new, 1), 0);

  UPDATE public.posts
     SET liked_user_ids = v_new,
         likes          = v_likes
   WHERE id = p_post_id;

  -- 누른 경우에만, 그리고 남의 글일 때만 알립니다.
  IF v_added AND v_author IS NOT NULL AND v_author <> auth.uid() THEN
    -- "이름 직분" (직분이 없으면 이름만). '님'은 알림함 화면에서 붙입니다.
    SELECT COALESCE(NULLIF(btrim(pr.name), ''), '성도')
           || CASE WHEN COALESCE(pr.role, '') <> 'PENDING' AND NULLIF(btrim(pr.duty), '') IS NOT NULL
                   THEN ' ' || btrim(pr.duty) ELSE '' END
      INTO v_actor
      FROM public.profiles pr WHERE pr.id = auth.uid();

    INSERT INTO public.notifications (user_id, type, title, body, actor_name, post_id, post_category)
    VALUES (
      v_author, 'LIKE', v_title,
      CASE WHEN v_category = 'PRAYER' THEN '아멘을 눌렀습니다'
           WHEN v_category = 'MEMBER_NEWS' THEN '축하/응원을 눌렀습니다'
           ELSE '좋아요를 눌렀습니다' END,
      COALESCE(v_actor, '성도'), p_post_id, v_category
    );
  END IF;

  likes := v_likes;
  liked_user_ids := v_new;
  RETURN NEXT;
END;
$function$;

-- 이미 쌓인 알림 정리: 화면이 '님이'를 붙이는 종류에서 끝의 '님'을 뗍니다.
-- (예전 공지 알림의 "임진재 성도님" 도 같은 이유로 "성도님님이"로 보였습니다)
UPDATE public.notifications
   SET actor_name = regexp_replace(actor_name, '\s*님$', '')
 WHERE type IN ('LIKE', 'COMMENT', 'NOTICE')
   AND actor_name ~ '님$';
