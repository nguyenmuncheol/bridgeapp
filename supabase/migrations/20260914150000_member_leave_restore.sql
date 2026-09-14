-- ─────────────────────────────────────────────────────────────────────────────
-- 성도 탈퇴 처리 (관리자 전용) — 가입자·미가입 성도 공통
--
-- role을 'LEFT'로 바꿔 소프트 삭제합니다(가입 거절을 'REJECTED'로 처리하는 것과
-- 같은 방식). 다른 필드(라브리·직분·가족·자녀 등)는 전혀 건드리지 않으므로 "복구"는
-- role만 원래 값으로 되돌리면 됩니다. previous_role에 되돌릴 값을 저장해 둡니다.
--
-- profiles.role은 CHECK 제약이 없는 자유 텍스트라 별도 제약 변경은 필요 없습니다.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS previous_role text;

COMMENT ON COLUMN public.profiles.previous_role IS
  'role을 LEFT(탈퇴 처리)로 바꾸기 직전 값. 복구 시 이 값으로 되돌립니다.';
