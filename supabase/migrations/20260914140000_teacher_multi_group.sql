-- ─────────────────────────────────────────────────────────────────────────────
-- 선생님(TEACHER) 복수 부서 담당 지원
--
-- 이전에는 profiles.teach_group이 부서 하나만 담을 수 있었습니다(빈 값 = 전체 담당).
-- 앱에서 이제 "영아부,중고등부"처럼 콤마로 이어 붙여 저장합니다(DB 컬럼 자체는 그대로
-- text라 컬럼 마이그레이션은 필요 없습니다). notify_attendance_pending의 교사 매칭만
-- 정확히 일치(=) 대신 콤마로 나눈 목록 안에 있는지(ANY)로 바꿉니다.
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
    -- 2-1. 해당 부서를 담당하는(콤마로 여러 부서를 겸임할 수 있음) 교사에게만 해당 부서 알림 발송
    INSERT INTO public.notifications (user_id, type, title, body, actor_name)
    SELECT p.id, 'ATTENDANCE',
           '📋 ' || v_g.labri || ' 출석체크가 아직 안 끝났습니다',
           to_char(v_sunday, 'MM월 DD일') || ' 주일 · '
             || (v_g.head_count - v_g.done_count)::text || '명이 아직 표시되지 않았습니다. (관리 화면 > 출석)',
           '더브릿지교회'
      FROM public.profiles p
     WHERE p.role = 'TEACHER'
       AND COALESCE(p.teach_group,'') <> ''
       AND v_g.labri = ANY (string_to_array(p.teach_group, ','));
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
