-- ─────────────────────────────────────────────────────────────────────────────
-- 식수 신청 알림에서 '출석 미적용' 성도 제외
--
-- 라브리 칸의 '출석 미적용'은 "출석체크 명단에서 빼 주세요"라는 표시입니다
-- (가끔만 나오시는 분, 일 때문에 장기간 쉬시는 분, 배우자로만 이름을 올린 분).
-- 출석체크 명단과 출석 리마인더 알림에서는 이미 빠지고 있었는데, 식수 신청 알림은
-- role만 보고 있어서 매주 "아직 신청하지 않으셨습니다" 푸시가 계속 갔습니다.
--
-- 이 알림은 **사람 단위**라, 부부 중 한 분만 '출석 미적용'이면 그분만 조용해지고
-- 남아 계신 배우자는 계속 알림을 받습니다(그 가정은 식사 신청을 해야 하므로 맞습니다).
-- 관리자 화면의 '미응답 가정' 목록도 같은 규칙입니다 — 가정 전원이 '출석 미적용'일
-- 때만 가정째로 빠집니다(src/lib/familyKey.ts).
--
-- 식수 신청 버튼 자체와 식권(쿠폰)은 그대로 둡니다. 오시는 주에는 본인이 직접
-- 신청할 수 있어야 하고, 식권은 가정 단위로 계속 쓰이기 때문입니다.
-- ─────────────────────────────────────────────────────────────────────────────

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
     AND COALESCE(pr.labri_id,'') <> '출석 미적용'
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

REVOKE EXECUTE ON FUNCTION public.notify_meal_pending(integer) FROM PUBLIC, anon, authenticated;
