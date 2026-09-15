-- ─────────────────────────────────────────────────────────────────────────────
-- visitor_records RLS 조이기
--
-- 🔒 과거 구멍: SELECT 정책이 USING (true) 여서, 로그인만 되어 있으면 누구나
--    (승인 대기자·쿠폰 계정 포함) 방문자의 실명과 특이사항(인도자, 기도제목, 메모)을
--    그대로 읽을 수 있었습니다. 주소록 화면은 ADMIN/LEADER/TEACHER 에게만 보여 주지만
--    그건 화면단 가림막일 뿐이라 DB 직접 조회는 막지 못했습니다.
-- → 출석 기록 테이블과 같은 기준으로 맞춥니다. 방문자 명단을 실제로 다루는
--    ADMIN·LEADER·TEACHER 만 읽고 쓸 수 있습니다.
--
-- can_edit_child_attendance() = role IN ('ADMIN','LEADER','TEACHER')
-- SECURITY DEFINER 함수라 profiles 를 다시 RLS 로 훑지 않아 정책이 재귀하지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "visitor_records_select_policy" ON public.visitor_records;
DROP POLICY IF EXISTS "visitor_records_insert_policy" ON public.visitor_records;
DROP POLICY IF EXISTS "visitor_records_update_policy" ON public.visitor_records;
DROP POLICY IF EXISTS "visitor_records_delete_policy" ON public.visitor_records;

CREATE POLICY "visitor_records_select_policy" ON public.visitor_records
  FOR SELECT TO authenticated
  USING (public.can_edit_child_attendance());

CREATE POLICY "visitor_records_insert_policy" ON public.visitor_records
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_child_attendance());

-- UPDATE 는 USING 만 있으면 "고칠 자격"만 보고 "고친 결과"는 보지 않습니다.
-- WITH CHECK 을 같이 걸어야 권한 없는 행으로 바꿔치기하는 것까지 막힙니다.
CREATE POLICY "visitor_records_update_policy" ON public.visitor_records
  FOR UPDATE TO authenticated
  USING (public.can_edit_child_attendance())
  WITH CHECK (public.can_edit_child_attendance());

CREATE POLICY "visitor_records_delete_policy" ON public.visitor_records
  FOR DELETE TO authenticated
  USING (public.can_edit_child_attendance());
