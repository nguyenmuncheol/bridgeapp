-- ── 가입자 이용 현황 및 활동 분석 (Analytics) 스키마 확장 ──

-- 1. profiles 테이블에 접속 및 환경 정보 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_pwa BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS device_platform TEXT,
  ADD COLUMN IF NOT EXISTS browser_name TEXT;

-- 2. 시간대별/요일별 이용 피크 분석을 위한 접속 로그 테이블
CREATE TABLE IF NOT EXISTS public.user_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  hour_of_day INT NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_pwa BOOLEAN DEFAULT FALSE,
  device_platform TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_access_logs_user_id_idx ON public.user_access_logs(user_id);
CREATE INDEX IF NOT EXISTS user_access_logs_hour_day_idx ON public.user_access_logs(hour_of_day, day_of_week);

ALTER TABLE public.user_access_logs ENABLE ROW LEVEL SECURITY;

-- 누구나 본인 로그인 계정으로 접속 로그 삽입 가능
DROP POLICY IF EXISTS "모든 로그인 사용자 접속 로그 등록" ON public.user_access_logs;
CREATE POLICY "모든 로그인 사용자 접속 로그 등록" ON public.user_access_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 관리자(ADMIN)만 전체 접속 통계 조회 가능
DROP POLICY IF EXISTS "관리자 접속 로그 조회" ON public.user_access_logs;
CREATE POLICY "관리자 접속 로그 조회" ON public.user_access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
    )
  );
