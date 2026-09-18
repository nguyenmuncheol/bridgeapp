-- ============================================================================
-- 계정통합(미가입 성도 ↔ 가입 계정) 시 가입자가 입력한 정보가 사라지던 문제
--
-- 🐛 사고 (2026-09-18, 박휘정님)
--   9/14 에 미가입 명단에 오른 분이 9/18 에 직접 가입해 이름·연락처·주소·생년월일을
--   입력하고 승인까지 마쳤는데, 관리자가 [성도 관리] > "계정 연결"을 누르는 순간
--   그 정보가 전부 빈칸이 됐습니다. 4일 전 명단에 등록될 때의 빈 값이 남았습니다.
--   본인이 입력한 값은 어디에도 사본이 없어 복구하지 못했습니다.
--
-- 원인
--   claim_unregistered_member 는 명단 행(㉠)을 남기고 가입 행(㉡)을 통째로 DELETE
--   하는데, ㉡에서 ㉠으로 옮기는 값이 email 과 avatar_url **둘뿐**이었습니다.
--   본인이 입력한 나머지는 행과 함께 사라집니다.
--   (2026-09-13 자녀 정보 사고, 가입 거절 시 행 삭제 사고와 같은 계열입니다)
--
-- 이 마이그레이션이 하는 일
--   ① 사람이 입력한 정보는 **가입자 값이 우선**, 가입자 쪽이 비어 있을 때만 명단 값.
--   ② ㉡에 붙어 있던 기록도 **전부 ㉠으로 옮긴 뒤** 지웁니다.
--      지금은 푸시 구독·알림·게시글·댓글이 ㉡과 함께 CASCADE 로 사라집니다.
--   ③ 통합 UPDATE 때문에 "새 가입 신청" 알림이 다시 나가지 않게 막습니다.
--   ④ attendance_records.recorded_by 의 ON UPDATE CASCADE 를 되살립니다.
-- ============================================================================


-- ── ④ 출석 입력자 FK 의 ON UPDATE CASCADE 복구 ────────────────────────────
-- 20260914000000_unregistered_members.sql 이 걸어 둔 ON UPDATE CASCADE 를
-- 20260916010000_attendance_recorded_by_set_null.sql 이 ON DELETE SET NULL 을
-- 추가하면서 **같이 지워** NO ACTION 으로 돌아가 있었습니다.
-- 그래서 출석을 한 번이라도 입력한 사람이 통합 대상이 되면
-- "UPDATE profiles SET id = ..." 가 외래키 오류로 실패합니다. 둘 다 겁니다.
alter table public.attendance_records
  drop constraint if exists attendance_records_recorded_by_fkey,
  add constraint attendance_records_recorded_by_fkey
    foreign key (recorded_by) references public.profiles(id)
    on delete set null on update cascade;


-- ── family_info 안의 자녀 수 세기 ─────────────────────────────────────────
-- family_info 는 JSON 문자열(text)이지만 예전 방식의 일반 메모가 들어 있을 수도
-- 있어서, 파싱에 실패하면 0 으로 봅니다(예외로 통합 전체가 실패하면 안 됩니다).
create or replace function public.family_info_child_count(info text)
returns integer
language plpgsql
immutable
set search_path to 'public'
as $function$
DECLARE
  v jsonb;
BEGIN
  IF info IS NULL OR btrim(info) = '' THEN RETURN 0; END IF;
  BEGIN
    v := info::jsonb;
  EXCEPTION WHEN others THEN
    RETURN 0;
  END;
  IF jsonb_typeof(v -> 'children') <> 'array' THEN RETURN 0; END IF;
  RETURN jsonb_array_length(v -> 'children');
END;
$function$;

comment on function public.family_info_child_count(text) is
  'family_info JSON 에 들어 있는 자녀 수. 값이 비었거나 JSON 이 아니면 0.';


-- ── ③ 계정통합 중에는 가입 신청 알림을 내지 않습니다 ──────────────────────
-- 통합은 signup_requested_at 을 명단 행으로 옮기는데, 그 UPDATE 가
-- trg_profiles_notify_signup_request 를 건드립니다. 그대로 두면 이미 승인까지
-- 끝난 분에 대해 "○○님이 가입 승인을 요청했습니다" 푸시가 관리자 전원에게
-- 다시 나갑니다. 2026-09-15 에 고친 "신청하지도 않았는데 오는 알림" 과 같은 증상입니다.
--
-- 트리거의 WHEN 조건은 그대로 두고, 통합 트랜잭션 동안에만 함수가 조용히
-- 지나가게 합니다. set_config(..., true) 라서 트랜잭션이 끝나면 저절로 풀립니다.
create or replace function public.notify_admins_of_signup_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF coalesce(current_setting('app.claim_in_progress', true), '') = '1' THEN
    RETURN new;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, actor_name, post_category)
  SELECT
    p.id,
    'SIGNUP_REQUEST',
    '새 가입 신청',
    coalesce(new.name, '새 신청자') || '님이 가입 승인을 요청했습니다.',
    coalesce(new.name, '새 신청자'),
    ''
  FROM public.profiles p
  WHERE p.role = 'ADMIN';

  RETURN new;
END;
$function$;


-- ── ①② 통합 함수 ─────────────────────────────────────────────────────────
create or replace function public.claim_unregistered_member(
  placeholder_id uuid,
  new_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_placeholder public.profiles%ROWTYPE;
  v_new         public.profiles%ROWTYPE;
  -- 승인 화면을 거쳤는지. 거치기 전이라면 ㉡의 role/duty 는 가입하는 순간
  -- handle_new_user 가 넣은 기본값('PENDING'/'성도')이라 사람이 정한 값이 아닙니다.
  v_approved    boolean;
  -- 본인이 "가입 완료 및 승인 신청" 폼을 실제로 제출했는지.
  -- 제출 전이라면 ㉡의 이름은 카카오/구글이 준 표기("Han Ho jin 한호진" 같은)라
  -- 관리자가 명단에 적어 둔 이름을 덮어쓰면 안 됩니다.
  v_submitted   boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 미가입 성도를 가입 계정과 연결할 수 있습니다.';
  END IF;

  IF placeholder_id = new_user_id THEN
    RAISE EXCEPTION '같은 계정끼리는 연결할 수 없습니다.';
  END IF;

  -- 두 행을 잠급니다. 통합 도중 본인이 마이페이지에서 프로필을 고치면
  -- 여기서 읽어 둔 값으로 덮어써서 그 수정이 사라집니다.
  SELECT * INTO v_placeholder FROM public.profiles WHERE id = placeholder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '명단에서 대상을 찾지 못했습니다.';
  END IF;
  IF NOT COALESCE(v_placeholder.is_unregistered, false) THEN
    RAISE EXCEPTION '이미 가입한 계정은 연결 대상이 아닙니다.';
  END IF;

  SELECT * INTO v_new FROM public.profiles WHERE id = new_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '가입한 계정을 찾지 못했습니다.';
  END IF;
  IF COALESCE(v_new.is_unregistered, false) THEN
    RAISE EXCEPTION '미가입 성도끼리는 연결할 수 없습니다.';
  END IF;

  v_approved  := COALESCE(v_new.role, 'PENDING') <> 'PENDING';
  v_submitted := v_new.signup_requested_at IS NOT NULL;

  -- ── ㉡에 붙은 기록을 ㉠으로 옮깁니다 ────────────────────────────────────
  -- ㉡을 지우면 CASCADE 로 함께 사라지므로, 지우기 **전에** 모두 옮겨야 합니다.
  -- (예전에는 user_access_logs 하나만 옮기고 푸시 구독·알림·게시글은 잃었습니다.
  --  가입하자마자 푸시를 켠 분은 통합 후 알림이 오지 않게 됩니다)

  -- 같은 주일에 양쪽 모두 출석 기록이 있으면 UNIQUE(user_id, date_str) 에 걸립니다.
  -- 미가입 시절 기록(㉠)을 남기고 새 계정 쪽(㉡) 중복만 지웁니다.
  DELETE FROM public.attendance_records a
   WHERE a.user_id = new_user_id
     AND EXISTS (
       SELECT 1 FROM public.attendance_records b
        WHERE b.user_id = placeholder_id AND b.date_str = a.date_str
     );
  UPDATE public.attendance_records       SET user_id               = placeholder_id WHERE user_id               = new_user_id;
  UPDATE public.attendance_records       SET recorded_by           = placeholder_id WHERE recorded_by           = new_user_id;
  UPDATE public.child_attendance_records SET recorded_by           = placeholder_id WHERE recorded_by           = new_user_id;
  UPDATE public.visitor_records          SET recorded_by           = placeholder_id WHERE recorded_by           = new_user_id;
  UPDATE public.meal_registrations       SET registered_by_user_id = placeholder_id WHERE registered_by_user_id = new_user_id;
  UPDATE public.notifications            SET user_id               = placeholder_id WHERE user_id               = new_user_id;
  UPDATE public.posts                    SET author_id             = placeholder_id WHERE author_id             = new_user_id;
  UPDATE public.post_comments            SET author_id             = placeholder_id WHERE author_id             = new_user_id;
  UPDATE public.push_jobs                SET user_id               = placeholder_id WHERE user_id               = new_user_id;
  UPDATE public.push_subscriptions       SET user_id               = placeholder_id WHERE user_id               = new_user_id;
  UPDATE public.user_access_logs         SET user_id               = placeholder_id WHERE user_id               = new_user_id;

  -- push_digest_state 는 user_id 가 기본키라 양쪽에 있으면 옮길 수 없습니다.
  -- 묶음 알림의 "마지막 발송 지점"일 뿐이라, 겹치면 ㉠ 것을 남깁니다.
  DELETE FROM public.push_digest_state d
   WHERE d.user_id = new_user_id
     AND EXISTS (SELECT 1 FROM public.push_digest_state e WHERE e.user_id = placeholder_id);
  UPDATE public.push_digest_state SET user_id = placeholder_id WHERE user_id = new_user_id;

  -- ── ㉡ 삭제 후 ㉠의 번호를 auth 계정 번호로 교체 ───────────────────────
  -- 남은 FK 는 ON UPDATE CASCADE 라 방금 옮긴 기록이 새 번호를 따라옵니다.
  DELETE FROM public.profiles WHERE id = new_user_id;

  -- 이 트랜잭션 동안 가입 신청 알림을 막습니다(위 ③).
  PERFORM set_config('app.claim_in_progress', '1', true);

  UPDATE public.profiles SET
    id              = new_user_id,
    is_unregistered = false,

    -- ── 본인이 입력·소유한 정보: 가입자 우선, 비어 있을 때만 명단 값 ──
    -- (SET 오른쪽의 맨 이름은 명단 행의 기존 값입니다)
    name = CASE
             WHEN v_submitted THEN COALESCE(NULLIF(btrim(v_new.name), ''), name)
             ELSE name
           END,
    email      = COALESCE(NULLIF(btrim(v_new.email),      ''), email),
    phone      = COALESCE(NULLIF(btrim(v_new.phone),      ''), phone),
    address    = COALESCE(NULLIF(btrim(v_new.address),    ''), address),
    birthday   = COALESCE(NULLIF(btrim(v_new.birthday),   ''), birthday),
    avatar_url = COALESCE(NULLIF(btrim(v_new.avatar_url), ''), avatar_url),

    -- ── 관리자가 정하는 소속·권한 ──────────────────────────────────────
    -- 승인 화면을 거친 값이면 그쪽이 최신입니다. 아직 PENDING 이면 승인 대기
    -- 상태를 그대로 넘겨받아 관리자가 승인 화면에서 마저 처리하게 둡니다.
    -- (여기서 명단 행의 'MEMBER' 를 남기면 승인을 건너뛰고 통과시키는 셈이 됩니다)
    role = COALESCE(v_new.role, role),
    duty = CASE
             WHEN v_approved THEN COALESCE(NULLIF(btrim(v_new.duty), ''), duty)
             ELSE duty   -- 아직 handle_new_user 의 기본값 '성도' 이므로 명단 값을 지킵니다
           END,
    -- 아래 넷은 가입 직후에는 비어 있어서, 승인 때 지정한 값이 있으면 그것을 씁니다.
    labri_id        = COALESCE(NULLIF(btrim(v_new.labri_id),        ''), labri_id),
    family_group_id = COALESCE(NULLIF(btrim(v_new.family_group_id), ''), family_group_id),
    family_role     = COALESCE(NULLIF(btrim(v_new.family_role),     ''), family_role),
    teach_group     = COALESCE(NULLIF(btrim(v_new.teach_group),     ''), teach_group),

    -- family_info 만은 "자녀가 더 많은 쪽"을 남깁니다.
    -- 승인 화면에서 자녀를 입력하지 않으면 children:[] 인 JSON 이 저장되는데,
    -- 그것이 명단 행의 자녀를 덮으면 2026-09-13 처럼 자녀 정보가 통째로 사라집니다.
    -- 한 번 사라지면 복구할 수 없어서, 이 필드만 "가입자 우선" 을 양보합니다.
    family_info = CASE
                    WHEN public.family_info_child_count(v_new.family_info)
                         >= public.family_info_child_count(v_placeholder.family_info)
                      THEN COALESCE(NULLIF(btrim(v_new.family_info), ''), family_info)
                    ELSE family_info
                  END,

    -- ── 계정 상태·기기 정보: 명단 행에는 있을 수 없는 값들입니다 ────────
    signup_requested_at = COALESCE(v_new.signup_requested_at, signup_requested_at),
    welcomed_at         = COALESCE(v_new.welcomed_at,         welcomed_at),
    last_active_at      = COALESCE(v_new.last_active_at,      last_active_at),
    is_pwa              = COALESCE(v_new.is_pwa,              is_pwa),
    device_platform     = COALESCE(NULLIF(btrim(v_new.device_platform), ''), device_platform),
    browser_name        = COALESCE(NULLIF(btrim(v_new.browser_name),    ''), browser_name)
    -- created_at 은 명단에 오른 날을 그대로 둡니다(그때부터 교회 명부에 있던 분입니다).
    -- previous_role / keep_app_access 는 명단 행의 탈퇴 이력이라 건드리지 않습니다.
  WHERE id = placeholder_id;
END;
$function$;

revoke all on function public.claim_unregistered_member(uuid, uuid) from public;
grant execute on function public.claim_unregistered_member(uuid, uuid) to authenticated;

comment on function public.claim_unregistered_member(uuid, uuid) is
  '미가입 성도 명단 행을 가입 계정에 이어 붙입니다(출석·식수·푸시 구독 승계). 이름·연락처·주소·생년월일은 가입자가 입력한 값이 우선이고, 비어 있을 때만 명단 값을 씁니다. 관리자만 호출 가능.';
