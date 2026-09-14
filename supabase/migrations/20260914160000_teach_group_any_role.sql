-- ─────────────────────────────────────────────────────────────────────────────
-- 담당 부서 알림을 role='TEACHER'로 제한하지 않고, teach_group을 명시한 사람이면
-- 누구나(관리자·리더 포함) 그 부서 알림을 받게 합니다.
--
-- 문제: 특정 부서(예: 중고등부)를 실제로는 관리자(ADMIN) 등급인 분이 맡고 계신데,
-- 담당 부서 지정 UI가 TEACHER에게만 보여서 그분은 부서를 지정할 방법이 없었습니다.
-- 그 결과 그 부서가 미완료여도 실제 담당자는 알림을 못 받고, 부서를 지정하지 않은
-- (= "전체 담당") 다른 선생님들에게만 뭉뚱그려 알림이 갔습니다.
--
-- "부서 미지정 = 전체 담당" 뭉치 알림은 여전히 TEACHER 등급에만 남겨둡니다.
-- (모든 관리자를 여기 포함시키면 아무것도 지정하지 않은 관리자까지 전체 교회학교
--  알림을 받게 되어 오히려 더 산만해집니다. 부서를 스스로 지정한 사람만 targeted.)
-- ─────────────────────────────────────────────────────────────────────────────

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
    -- 2-1. 이 부서를 명시적으로 담당한다고 지정한 사람에게만 (역할 무관: 선생님/리더/관리자
    -- 누구든 담당 부서를 지정했으면 대상입니다 — role='TEACHER' 제한을 없앴습니다)
    INSERT INTO public.notifications (user_id, type, title, body, actor_name)
    SELECT p.id, 'ATTENDANCE',
           '📋 ' || v_g.labri || ' 출석체크가 아직 안 끝났습니다',
           to_char(v_sunday, 'MM월 DD일') || ' 주일 · '
             || (v_g.head_count - v_g.done_count)::text || '명이 아직 표시되지 않았습니다. (관리 화면 > 출석)',
           '더브릿지교회'
      FROM public.profiles p
     WHERE p.role IN ('TEACHER','ADMIN','LEADER')
       AND COALESCE(p.teach_group,'') <> ''
       AND v_g.labri = ANY (string_to_array(p.teach_group, ','));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    IF v_unassigned_summary <> '' THEN
      v_unassigned_summary := v_unassigned_summary || ', ';
    END IF;
    v_unassigned_summary := v_unassigned_summary || v_g.labri || '(' || (v_g.head_count - v_g.done_count)::text || '명)';
  END LOOP;

  -- 2-2. 담당 부서가 미지정된 "선생님"(TEACHER)만 전체 요약을 받습니다.
  -- 관리자/리더는 부서를 스스로 지정하지 않는 한 이 뭉치 알림 대상이 아닙니다
  -- (안 그러면 아무 설정 없는 관리자도 매번 전체 교회학교 알림을 받게 됩니다).
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
