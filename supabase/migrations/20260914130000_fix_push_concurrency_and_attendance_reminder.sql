-- ─────────────────────────────────────────────────────────────────────────────
-- 푸시 중복 발송(동시성 Race Condition) 해결 및 출석체크 신규 등록자 예외 처리
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. push_jobs 상태에 'processing' 추가
ALTER TABLE public.push_jobs DROP CONSTRAINT IF EXISTS push_jobs_status_check;
ALTER TABLE public.push_jobs ADD CONSTRAINT push_jobs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text]));

-- 2. 원자적 작업 점유 함수: claim_push_jobs
-- FOR UPDATE SKIP LOCKED를 사용하여 동시에 여러 Edge Function이 떠도
-- 동일한 푸시 작업을 중복 점유하지 못하도록 원천 차단합니다.
CREATE OR REPLACE FUNCTION public.claim_push_jobs(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  notification_id uuid,
  user_id uuid,
  payload jsonb,
  notif_id uuid,
  notif_user_id uuid,
  notif_type text,
  notif_title text,
  notif_body text,
  notif_actor_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH to_claim AS (
    SELECT pj.id
    FROM public.push_jobs pj
    WHERE pj.status = 'pending'
       OR (pj.status = 'processing' AND pj.processed_at < now() - interval '5 minutes')
    ORDER BY pj.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.push_jobs pj
    SET status = 'processing',
        processed_at = now()
    FROM to_claim tc
    WHERE pj.id = tc.id
    RETURNING pj.id, pj.notification_id, pj.user_id, pj.payload
  )
  SELECT
    c.id,
    c.notification_id,
    c.user_id,
    c.payload,
    n.id AS notif_id,
    n.user_id AS notif_user_id,
    n.type AS notif_type,
    n.title AS notif_title,
    n.body AS notif_body,
    n.actor_name AS notif_actor_name
  FROM claimed c
  LEFT JOIN public.notifications n ON n.id = c.notification_id;
END;
$$;

-- 3. 자녀 ID 타임스탬프 추출 헬퍼 함수
-- 자녀 ID 형식(child_1789316081960_5jokl)에서 생성 시각을 추출하여
-- 대상 주일(일요일 18:00 베트남 시각) 이전에 등록된 자녀인지 검사합니다.
-- 주일 예배/모임(18:00) 이후에 추가된 자녀는 해당 주일 출석체크 리마인더에서 제외합니다.
CREATE OR REPLACE FUNCTION public.is_child_created_before(p_child_id text, p_sunday date)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_ms_str text;
  v_epoch  double precision;
  v_cutoff timestamptz;
  v_created timestamptz;
BEGIN
  v_ms_str := substring(p_child_id from 'child_([0-9]+)');
  IF v_ms_str IS NULL OR v_ms_str = '' THEN
    RETURN true;
  END IF;
  v_epoch := v_ms_str::bigint / 1000.0;
  v_created := to_timestamp(v_epoch);
  -- 베트남 시각 기준 주일 18:00
  v_cutoff := (p_sunday::text || ' 18:00:00 +07')::timestamptz;
  RETURN v_created <= v_cutoff;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

-- 4. notify_attendance_pending 함수 재작성
-- - 주일 18:00 이후 새로 추가된 성도 및 자녀는 해당 주일 출석체크 대상에서 제외
-- - '출석 미적용' 성도 제외
-- - 담당 미지정 교사에게 부서별로 3~4개씩 보내지 않고 1건으로 통합 발송
CREATE OR REPLACE FUNCTION public.notify_attendance_pending(p_round integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sunday date := public.vn_last_sunday();
  v_cutoff timestamptz := (v_sunday::text || ' 18:00:00 +07')::timestamptz;
  v_key    text := 'attend:' || v_sunday::text || ':' || p_round::text;
  v_g      record;
  v_total  int := 0;
  v_n      int;
  v_unassigned_summary text := '';
  v_teacher record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.notification_jobs WHERE job_key = v_key) THEN
    RETURN -1;
  END IF;

  -- ── 1. 어른 라브리: 그 라브리 인원 중 기록이 없는 사람이 있으면 ──
  -- 예외처리: 주일 18:00 이후 등록된 성도(created_at > v_cutoff) 및 출석 미적용 제외
  FOR v_g IN
    SELECT pr.labri_id AS labri,
           count(*) AS head_count,
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.attendance_records ar
                WHERE ar.date_str = v_sunday AND ar.user_id = pr.id
             )
           ) AS done_count
      FROM public.profiles pr
     WHERE pr.role IN ('MEMBER','LEADER','ADMIN','TEACHER')
       AND COALESCE(pr.labri_id,'') <> ''
       AND pr.labri_id <> '출석 미적용'
       AND (pr.created_at IS NULL OR pr.created_at <= v_cutoff)
     GROUP BY pr.labri_id
    HAVING count(*) > count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.attendance_records ar
                WHERE ar.date_str = v_sunday AND ar.user_id = pr.id
             )
           )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, actor_name)
    SELECT DISTINCT t.id, 'ATTENDANCE',
           '📋 ' || v_g.labri || ' 출석체크가 아직 안 끝났습니다',
           to_char(v_sunday, 'MM월 DD일') || ' 주일 · '
             || (v_g.head_count - v_g.done_count)::text || '명이 아직 표시되지 않았습니다. (관리 화면 > 출석)',
           '더브릿지교회'
      FROM (
        SELECT p.id FROM public.profiles p WHERE p.labri_id = v_g.labri AND p.role = 'LEADER'
        UNION
        SELECT p.id FROM public.profiles p
         WHERE p.labri_id = v_g.labri AND p.role = 'ADMIN'
           AND NOT EXISTS (SELECT 1 FROM public.profiles l WHERE l.labri_id = v_g.labri AND l.role = 'LEADER')
        UNION
        SELECT p.id FROM public.profiles p
         WHERE p.role = 'ADMIN'
           AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.labri_id = v_g.labri AND x.role IN ('LEADER','ADMIN'))
      ) t;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;

  -- ── 2. 자녀 그룹 (교회학교): 지정된 자녀 중 기록이 없는 아이가 있으면 ──
  -- 예외처리: 주일 이후 등록된 자녀(is_child_created_before) 제외
  FOR v_g IN
    SELECT ac.labri_id AS labri,
           count(*) AS head_count,
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.child_attendance_records cr
                WHERE cr.date_str = v_sunday AND cr.dependent_id = ac.dependent_id
             )
           ) AS done_count
      FROM public.assigned_children() ac
     WHERE public.is_child_created_before(ac.dependent_id, v_sunday)
     GROUP BY ac.labri_id
    HAVING count(*) > count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM public.child_attendance_records cr
                WHERE cr.date_str = v_sunday AND cr.dependent_id = ac.dependent_id
             )
           )
  LOOP
    -- 2-1. 해당 부서를 명시적으로 맡은 담당 교사에게만 해당 부서 알림 발송
    INSERT INTO public.notifications (user_id, type, title, body, actor_name)
    SELECT p.id, 'ATTENDANCE',
           '📋 ' || v_g.labri || ' 출석체크가 아직 안 끝났습니다',
           to_char(v_sunday, 'MM월 DD일') || ' 주일 · '
             || (v_g.head_count - v_g.done_count)::text || '명이 아직 표시되지 않았습니다. (관리 화면 > 출석)',
           '더브릿지교회'
      FROM public.profiles p
     WHERE p.role = 'TEACHER' AND p.teach_group = v_g.labri;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    -- 담당 미지정 교사에게 보낼 요약 정보 누적
    IF v_unassigned_summary <> '' THEN
      v_unassigned_summary := v_unassigned_summary || ', ';
    END IF;
    v_unassigned_summary := v_unassigned_summary || v_g.labri || '(' || (v_g.head_count - v_g.done_count)::text || '명)';
  END LOOP;

  -- 2-2. 담당 부서가 미지정된 교사(또는 교사가 없을 때 관리자)에게는
  -- 미완료 부서가 여러 개 있어도 부서마다 따로 보내지 않고 딱 1건으로 모아서 발송
  IF v_unassigned_summary <> '' THEN
    FOR v_teacher IN
      SELECT p.id FROM public.profiles p
       WHERE p.role = 'TEACHER' AND COALESCE(p.teach_group,'') = ''
      UNION
      SELECT p.id FROM public.profiles p
       WHERE p.role = 'ADMIN'
         AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.role = 'TEACHER')
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, actor_name)
      VALUES (
        v_teacher.id,
        'ATTENDANCE',
        '📋 교회학교 출석체크가 아직 안 끝났습니다',
        to_char(v_sunday, 'MM월 DD일') || ' 주일 · ' || v_unassigned_summary || ' 미완료 (관리 화면 > 출석)',
        '더브릿지교회'
      );
      v_total := v_total + 1;
    END LOOP;
  END IF;

  INSERT INTO public.notification_jobs(job_key, detail) VALUES (v_key, v_total::text || '건 발송');
  RETURN v_total;
END;
$function$;
