-- ─────────────────────────────────────────────────────────────────────────────
-- 방문자 출석 기록 (visitor_records)
--
-- 1. 카운터 방식(이름 없음): name IS NULL, count >= 1
-- 2. 기명 방식(이름 있음): name IS NOT NULL, count = 1
-- 부서(category): '성인', '중고등부', '초등부', '유아유치부'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.visitor_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_str date NOT NULL,
  name text,
  category text NOT NULL CHECK (category IN ('성인', '학생', '중고등부', '초등부', '유아유치부')),
  count integer NOT NULL DEFAULT 1,
  note text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_visitor_records_date ON public.visitor_records(date_str);
CREATE INDEX IF NOT EXISTS idx_visitor_records_name ON public.visitor_records(name) WHERE name IS NOT NULL;

-- RLS 활성화
ALTER TABLE public.visitor_records ENABLE ROW LEVEL SECURITY;

-- 출석체크 권한이 있는 멤버(ADMIN, LEADER, TEACHER) 조회 및 작성 정책
CREATE POLICY "visitor_records_select_policy" ON public.visitor_records
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "visitor_records_insert_policy" ON public.visitor_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'LEADER', 'TEACHER')
    )
  );

CREATE POLICY "visitor_records_update_policy" ON public.visitor_records
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'LEADER', 'TEACHER')
    )
  );

CREATE POLICY "visitor_records_delete_policy" ON public.visitor_records
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'LEADER', 'TEACHER')
    )
  );

COMMENT ON TABLE public.visitor_records IS '주일 예배 방문자 출석 기록 (카운터 및 기명 방식)';
