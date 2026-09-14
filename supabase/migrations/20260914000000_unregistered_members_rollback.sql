-- ============================================================================
-- 되돌리기: 20260914000000_unregistered_members.sql
--
-- ⚠️ 먼저 확인하세요
--   auth 계정 없는 행(미가입 성도)이 하나라도 남아 있으면 마지막 단계(auth.users
--   참조 복원)가 실패합니다. 아래 조회로 남은 행을 먼저 확인하고 처리하세요.
--
--     SELECT id, name, labri_id, family_group_id
--       FROM public.profiles
--      WHERE is_unregistered = true;
--
--   되돌리기 전에 이 사람들의 출석·식수 기록은 사라집니다(행을 지워야 하므로).
--   필요하면 먼저 따로 내보내 두세요.
-- ============================================================================

-- ── 승계 함수 제거 ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.claim_unregistered_member(uuid, uuid);

-- ── 관리자 INSERT 정책 제거 ───────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_admin_insert_policy ON public.profiles;

-- ── FK를 원래대로 (ON UPDATE 절 없음) ─────────────────────────────────────
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_user_id_fkey,
  ADD CONSTRAINT attendance_records_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_recorded_by_fkey,
  ADD CONSTRAINT attendance_records_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);

ALTER TABLE public.child_attendance_records
  DROP CONSTRAINT IF EXISTS child_attendance_records_recorded_by_fkey,
  ADD CONSTRAINT child_attendance_records_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.meal_registrations
  DROP CONSTRAINT IF EXISTS meal_registrations_registered_by_user_id_fkey,
  ADD CONSTRAINT meal_registrations_registered_by_user_id_fkey
    FOREIGN KEY (registered_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.post_comments
  DROP CONSTRAINT IF EXISTS post_comments_author_id_fkey,
  ADD CONSTRAINT post_comments_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_author_id_fkey,
  ADD CONSTRAINT posts_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.push_digest_state
  DROP CONSTRAINT IF EXISTS push_digest_state_user_id_fkey,
  ADD CONSTRAINT push_digest_state_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.push_jobs
  DROP CONSTRAINT IF EXISTS push_jobs_user_id_fkey,
  ADD CONSTRAINT push_jobs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey,
  ADD CONSTRAINT push_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.user_access_logs
  DROP CONSTRAINT IF EXISTS user_access_logs_user_id_fkey,
  ADD CONSTRAINT user_access_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── 미가입 표시 컬럼 제거 ─────────────────────────────────────────────────
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_unregistered;

-- ── auth.users 참조 복원 (미가입 행이 남아 있으면 여기서 실패합니다) ──────
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
