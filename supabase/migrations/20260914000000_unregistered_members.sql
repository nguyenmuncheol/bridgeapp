-- ============================================================================
-- 미가입 성도(앱에 가입하지 않았지만 명단·출석·식수에 포함되는 성인)
--
-- 배경
--   지금까지 profiles.id 는 auth.users(id) 를 참조해야만 했습니다. 그래서 "앱에
--   가입하지 않은 사람"은 명부에 행 자체를 만들 수 없었고, 자녀는 부모의
--   family_info JSON 안에, 배우자는 이름 텍스트로 끼워 넣어 왔습니다.
--   (그 취약함 때문에 2026-09-13 자녀 두 명의 정보가 통째로 지워지는 사고가 있었습니다)
--
-- 이 마이그레이션이 하는 일
--   ① profiles.id 의 auth.users 참조를 끊습니다.
--      → 가입자는 여전히 id = auth.uid() 이므로 **기존 RLS 정책은 그대로 동작**합니다.
--        미가입자는 auth.uid() 와 절대 일치하지 않아 자동으로 로그인이 차단됩니다.
--   ② 관리자가 남의 행을 만들 수 있게 INSERT 정책을 추가합니다.
--      (기존 정책은 auth.uid() = id 라서 본인 행만 만들 수 있었습니다)
--   ③ profiles.id 를 참조하는 FK 11개에 ON UPDATE CASCADE 를 겁니다.
--      → 나중에 본인이 가입하면 **profiles.id 를 새 계정 번호로 바꾸는 UPDATE 한 번**으로
--        출석·식수·게시글·알림이 전부 따라옵니다. 기록 이관 코드가 필요 없습니다.
--   ④ 승계(연결)를 한 트랜잭션으로 처리하는 함수를 만듭니다.
--
-- 되돌리기: 20260914000000_unregistered_members_rollback.sql
-- ============================================================================

-- ── ① auth.users 참조 해제 ────────────────────────────────────────────────
-- 주의: 이후로는 auth 계정을 지워도 profiles 행이 자동 삭제되지 않습니다.
-- 현재 앱에는 계정 삭제·탈퇴 경로가 없으므로(코드 확인 완료) 실질적 영향은 없습니다.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- ── 미가입 여부 표시 ──────────────────────────────────────────────────────
-- true  = 관리자가 명단에만 올린 사람 (앱 계정 없음)
-- false = 실제로 가입한 사람 (id = auth.users.id)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_unregistered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_unregistered IS
  '앱에 가입하지 않은 성도(관리자가 명단에만 등록). 주소록·생일에서는 숨기고 출석·식수 가정에는 포함합니다.';

-- ── ② 관리자만 미가입 성도 행을 만들 수 있게 ──────────────────────────────
DROP POLICY IF EXISTS profiles_admin_insert_policy ON public.profiles;
CREATE POLICY profiles_admin_insert_policy ON public.profiles
  FOR INSERT
  WITH CHECK (public.is_admin());

-- ── ③ profiles.id 참조 FK에 ON UPDATE CASCADE ────────────────────────────
-- 기존 ON DELETE 동작은 그대로 두고 ON UPDATE CASCADE 만 더합니다.

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_user_id_fkey,
  ADD CONSTRAINT attendance_records_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_recorded_by_fkey,
  ADD CONSTRAINT attendance_records_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON UPDATE CASCADE;

ALTER TABLE public.child_attendance_records
  DROP CONSTRAINT IF EXISTS child_attendance_records_recorded_by_fkey,
  ADD CONSTRAINT child_attendance_records_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.meal_registrations
  DROP CONSTRAINT IF EXISTS meal_registrations_registered_by_user_id_fkey,
  ADD CONSTRAINT meal_registrations_registered_by_user_id_fkey
    FOREIGN KEY (registered_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.post_comments
  DROP CONSTRAINT IF EXISTS post_comments_author_id_fkey,
  ADD CONSTRAINT post_comments_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_author_id_fkey,
  ADD CONSTRAINT posts_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.push_digest_state
  DROP CONSTRAINT IF EXISTS push_digest_state_user_id_fkey,
  ADD CONSTRAINT push_digest_state_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.push_jobs
  DROP CONSTRAINT IF EXISTS push_jobs_user_id_fkey,
  ADD CONSTRAINT push_jobs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey,
  ADD CONSTRAINT push_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.user_access_logs
  DROP CONSTRAINT IF EXISTS user_access_logs_user_id_fkey,
  ADD CONSTRAINT user_access_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ④ 가입자와 미가입 명단을 연결(승계)하는 함수 ──────────────────────────
--
-- 가입하면 auth.users 트리거(handle_new_user)가 PENDING 프로필을 먼저 만듭니다.
-- 그래서 이 시점에는 같은 사람을 가리키는 행이 둘입니다:
--   ㉠ 미가입 시절 명단 행 (출석·식수 기록이 붙어 있음)
--   ㉡ 방금 가입해 생긴 빈 행 (id = auth 계정 번호)
--
-- 이 함수는 ㉡을 지우고 ㉠의 id를 auth 계정 번호로 바꿉니다.
-- FK가 ON UPDATE CASCADE라 ㉠에 붙어 있던 기록이 전부 그대로 따라옵니다.
--
-- 자동 매칭은 하지 않습니다. 동명이인이 있으면 남의 기록이 엉뚱한 사람에게
-- 붙으므로, 관리자가 화면에서 확인하고 호출해야 합니다.
CREATE OR REPLACE FUNCTION public.claim_unregistered_member(
  placeholder_id uuid,
  new_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_placeholder public.profiles%ROWTYPE;
  v_new         public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 미가입 성도를 가입 계정과 연결할 수 있습니다.';
  END IF;

  IF placeholder_id = new_user_id THEN
    RAISE EXCEPTION '같은 계정끼리는 연결할 수 없습니다.';
  END IF;

  SELECT * INTO v_placeholder FROM public.profiles WHERE id = placeholder_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '명단에서 대상을 찾지 못했습니다.';
  END IF;
  IF NOT COALESCE(v_placeholder.is_unregistered, false) THEN
    RAISE EXCEPTION '이미 가입한 계정은 연결 대상이 아닙니다.';
  END IF;

  SELECT * INTO v_new FROM public.profiles WHERE id = new_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '가입한 계정을 찾지 못했습니다.';
  END IF;
  IF COALESCE(v_new.is_unregistered, false) THEN
    RAISE EXCEPTION '미가입 성도끼리는 연결할 수 없습니다.';
  END IF;

  -- 같은 주일에 양쪽 모두 출석 기록이 있으면 UNIQUE(user_id, date_str)에 걸립니다.
  -- 미가입 시절 기록(㉠)을 남기고 새 계정 쪽(㉡) 중복만 지웁니다.
  DELETE FROM public.attendance_records a
   WHERE a.user_id = new_user_id
     AND EXISTS (
       SELECT 1 FROM public.attendance_records b
        WHERE b.user_id = placeholder_id AND b.date_str = a.date_str
     );

  -- ㉡을 지우면 CASCADE로 접속 기록도 사라집니다. 먼저 ㉠으로 옮겨 보존합니다.
  UPDATE public.user_access_logs SET user_id = placeholder_id WHERE user_id = new_user_id;

  -- 가입하면서 받아온 정보(이메일·구글 프로필 사진)를 명단 행에 채웁니다.
  UPDATE public.profiles
     SET email      = COALESCE(NULLIF(v_new.email, ''), email),
         avatar_url = COALESCE(NULLIF(avatar_url, ''), v_new.avatar_url)
   WHERE id = placeholder_id;

  -- ㉡ 삭제 후 ㉠의 번호를 auth 계정 번호로 교체 (FK가 따라옵니다)
  DELETE FROM public.profiles WHERE id = new_user_id;

  UPDATE public.profiles
     SET id = new_user_id,
         is_unregistered = false
   WHERE id = placeholder_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_unregistered_member(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_unregistered_member(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.claim_unregistered_member(uuid, uuid) IS
  '미가입 성도 명단 행을 방금 가입한 계정에 이어 붙입니다(출석·식수 기록 승계). 관리자만 호출 가능.';
