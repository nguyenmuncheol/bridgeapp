-- ─────────────────────────────────────────────────────────────────────────────
-- 탈퇴(role='LEFT') 중, 관계는 유지되는 경우(예: 한국 복귀 등 불가피한 사정) 커뮤니티
-- 기능 접근을 계속 허용하는 플래그.
--
-- role='LEFT'는 그대로 유지합니다 — 주소록·생일 달력·성도 수 집계·출석체크·식사신청
-- 참여는 role='LEFT'만으로 이미 전부 제외됩니다(isApprovedMember, notify_* 함수들의
-- role 허용목록이 모두 LEFT를 자동으로 걸러냅니다). keep_app_access는 오직 "로그인 후
-- 앱 화면 자체를 볼 수 있는지"만 앱(app/page.tsx)에서 판단할 때 씁니다.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS keep_app_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.keep_app_access IS
  'role=LEFT인 성도가 로그인 후 나눔·교우소식·일정 등 커뮤니티 기능을 계속 쓸 수 있는지. LEFT가 아니면 의미 없음. 주소록/생일/성도수/출석/식사신청 참여는 이 값과 무관하게 role=LEFT만으로 이미 제외됩니다.';
