-- ============================================================================
-- 계정통합 규칙 확정 — 무엇을 누가 입력했는지에 따라 남길 쪽을 정합니다
--
-- 배경
--   20260918120000 은 "가입자 값 우선"을 일괄 적용했습니다. 그런데 실제로
--   가입자가 입력할 수 있는 항목은 여섯 개뿐입니다:
--     이름 · 연락처 · 주소 · 생년월일 · 프로필사진 · family_info(자녀·배우자·메모)
--   나머지(role, labri_id, duty, family_group_id, family_role, teach_group)는
--   protect_sensitive_profile_fields 트리거가 관리자가 아닌 사람의 저장을 전부
--   OLD 값으로 되돌립니다. 즉 이 여섯 개는 **양쪽 다 관리자가 넣은 값**이고,
--   차이는 "명단 만들 때" 냐 "승인 화면에서" 냐 뿐입니다.
--
-- 확정된 규칙
--   ㉮ 본인이 입력하는 값(이름·연락처·주소·생년월일·사진·이메일)
--        → 가입자 우선, 가입자 쪽이 비었을 때만 명단 값
--   ㉯ 관리자가 정하는 소속(직분·라브리·가족그룹·가족역할·담당부서)
--        → 명단 우선, 명단이 비었을 때만 승인 화면 값
--        (명단에 적어 둔 소속이 통합으로 뒤집히지 않게)
--   ㉰ 등급(role) → 승인 화면 값
--        명단 행의 등급은 항상 'MEMBER' 입니다. 미가입 성도 추가 화면에 등급
--        선택란이 없어서 dbCreateUnregisteredMember 가 박아 넣는 기본값이라,
--        관리자가 고른 값이 아닙니다. 승인하며 고른 LEADER·TEACHER 가 이깁니다.
--   ㉱ 자녀 → 양쪽을 합칩니다
--        부부 자녀 동기화(buildFamilyInfoSyncUpdates)가 같은 family_group_id 인
--        상대 행에도 자녀 목록을 쓰기 때문에, 통합 전에 이미 가입 계정 쪽에도
--        자녀가 들어가 있을 수 있습니다. 어느 쪽도 버리지 않습니다.
--   ㉲ 승인 대기(PENDING) 계정과는 연결할 수 없습니다
--        순서를 "승인 → 통합" 하나로 고정합니다. 승인 전에 연결하면 등급·직분이
--        기본값인 채로 섞여서, 어느 값이 관리자의 뜻인지 알 수 없게 됩니다.
-- ============================================================================


-- ── family_info 파서 ──────────────────────────────────────────────────────
-- src/lib/familyInfo.ts 의 parseFamilyInfo 와 같은 규칙입니다:
--   JSON 이 아니거나 children 배열이 없으면 예전 방식의 자유 텍스트 메모로 보고
--   통째로 note 에 보존합니다. 이름 없는 자녀는 버립니다.
create or replace function public.parse_family_info(raw text)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $function$
DECLARE
  v jsonb;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN jsonb_build_object('note','','spouseName','','children','[]'::jsonb,'addressRequestedAt','');
  END IF;

  BEGIN
    v := raw::jsonb;
  EXCEPTION WHEN others THEN
    v := NULL;
  END;

  IF v IS NULL OR jsonb_typeof(v) <> 'object' OR jsonb_typeof(v -> 'children') <> 'array' THEN
    RETURN jsonb_build_object('note', raw, 'spouseName','', 'children','[]'::jsonb, 'addressRequestedAt','');
  END IF;

  RETURN jsonb_build_object(
    'note',       coalesce(v ->> 'note', ''),
    'spouseName', btrim(coalesce(v ->> 'spouseName', '')),
    'children',   coalesce((
                    SELECT jsonb_agg(c)
                      FROM jsonb_array_elements(v -> 'children') c
                     WHERE btrim(coalesce(c ->> 'name','')) <> ''
                  ), '[]'::jsonb),
    'addressRequestedAt', coalesce(v ->> 'addressRequestedAt', '')
  );
END;
$function$;

comment on function public.parse_family_info(text) is
  'family_info 문자열을 {note, spouseName, children, addressRequestedAt} 로 정규화합니다. src/lib/familyInfo.ts 의 parseFamilyInfo 와 같은 규칙.';


-- ── family_info 합치기 (자녀는 어느 쪽도 버리지 않습니다) ─────────────────
create or replace function public.merge_family_info(primary_info text, secondary_info text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
DECLARE
  p jsonb; s jsonb;
  p_note text; s_note text; v_note text;
  v_spouse text; v_addr text;
  v_children jsonb;
BEGIN
  p := public.parse_family_info(primary_info);
  s := public.parse_family_info(secondary_info);

  -- 메모는 둘 다 있으면 어느 쪽도 버리지 않고 이어 붙입니다.
  p_note := btrim(coalesce(p ->> 'note', ''));
  s_note := btrim(coalesce(s ->> 'note', ''));
  v_note := CASE
              WHEN p_note = ''                     THEN s_note
              WHEN s_note = '' OR s_note = p_note  THEN p_note
              ELSE p_note || E'\n' || s_note
            END;

  v_spouse := coalesce(NULLIF(btrim(coalesce(p ->> 'spouseName','')), ''),
                       btrim(coalesce(s ->> 'spouseName','')));
  v_addr   := coalesce(NULLIF(coalesce(p ->> 'addressRequestedAt',''), ''),
                       coalesce(s ->> 'addressRequestedAt',''));

  -- primary 자녀를 먼저 담고, secondary 에서 id 도 이름도 겹치지 않는 아이만 더합니다.
  -- 부부 동기화를 거쳤으면 id 가 같고, 양쪽에서 따로 입력했으면 이름에서 걸립니다.
  -- (id 로만 보면 같은 아이가 두 명으로 늘어나 출석 명단에 두 번 뜹니다)
  v_children := p -> 'children';
  v_children := v_children || coalesce((
      SELECT jsonb_agg(c)
        FROM jsonb_array_elements(s -> 'children') c
       WHERE NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(p -> 'children') pc
          WHERE (pc ->> 'id') = (c ->> 'id')
             OR btrim(coalesce(pc ->> 'name','')) = btrim(coalesce(c ->> 'name',''))
       )
    ), '[]'::jsonb);

  -- 전부 비었으면 빈 문자열 (serializeFamilyInfo 와 같은 동작)
  IF v_note = '' AND v_spouse = '' AND v_addr = '' AND jsonb_array_length(v_children) = 0 THEN
    RETURN '';
  END IF;

  RETURN jsonb_build_object(
    'note', v_note,
    'spouseName', v_spouse,
    'children', v_children,
    'addressRequestedAt', v_addr
  )::text;
END;
$function$;

comment on function public.merge_family_info(text, text) is
  '두 family_info 를 합칩니다. 자녀는 id·이름이 겹치지 않는 것만 더해 어느 쪽도 잃지 않고, 메모·배우자이름은 primary 를 우선합니다.';


-- 20260918120000 에서 만든 자녀 수 세기 함수는 merge_family_info 로 대체되어 쓰이지 않습니다.
drop function if exists public.family_info_child_count(text);


-- ── 통합 함수 ─────────────────────────────────────────────────────────────
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
  -- 본인이 "가입 완료 및 승인 신청" 폼을 실제로 제출했는지.
  -- 제출 전이면 ㉡의 이름은 카카오/구글이 준 표기("명문식(Myoung MoonSik)" 같은)라
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

  -- ㉲ 승인 전에는 연결하지 않습니다. 순서를 "승인 → 통합" 으로 고정합니다.
  IF COALESCE(v_new.role, 'PENDING') = 'PENDING' THEN
    RAISE EXCEPTION '아직 승인하지 않은 계정입니다. [가입 승인]에서 먼저 승인한 뒤 연결해 주세요.';
  END IF;
  IF v_new.role = 'REJECTED' THEN
    RAISE EXCEPTION '가입을 거절한 계정과는 연결할 수 없습니다.';
  END IF;

  v_submitted := v_new.signup_requested_at IS NOT NULL;

  -- ── ㉡에 붙은 기록을 ㉠으로 옮깁니다 ────────────────────────────────────
  -- ㉡을 지우면 CASCADE 로 함께 사라지므로, 지우기 전에 모두 옮겨야 합니다.

  -- 과거 출석은 명단 쪽(㉠)이 진짜입니다 — 출석체크하려고 만든 행이니까요.
  -- 같은 주일에 양쪽 다 기록이 있으면 UNIQUE(user_id, date_str) 에 걸리므로
  -- ㉠을 남기고 ㉡의 중복만 지웁니다.
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
  -- 푸시 구독을 안 옮기면 가입하자마자 알림을 켠 분이 통합 후 알림을 못 받습니다.
  UPDATE public.push_subscriptions       SET user_id               = placeholder_id WHERE user_id               = new_user_id;
  UPDATE public.user_access_logs         SET user_id               = placeholder_id WHERE user_id               = new_user_id;

  -- push_digest_state 는 user_id 가 기본키라 양쪽에 있으면 옮길 수 없습니다.
  -- 묶음 알림의 "마지막 발송 지점"일 뿐이라, 겹치면 ㉠ 것을 남깁니다.
  DELETE FROM public.push_digest_state d
   WHERE d.user_id = new_user_id
     AND EXISTS (SELECT 1 FROM public.push_digest_state e WHERE e.user_id = placeholder_id);
  UPDATE public.push_digest_state SET user_id = placeholder_id WHERE user_id = new_user_id;

  -- ── ㉡ 삭제 후 ㉠의 번호를 auth 계정 번호로 교체 ───────────────────────
  DELETE FROM public.profiles WHERE id = new_user_id;

  -- 이 트랜잭션 동안 "새 가입 신청" 알림을 막습니다(20260918120000 참고).
  PERFORM set_config('app.claim_in_progress', '1', true);

  UPDATE public.profiles SET
    id              = new_user_id,
    is_unregistered = false,

    -- ㉮ 본인이 입력하는 값 — 가입자 우선
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

    -- ㉰ 등급 — 승인 화면에서 고른 값
    role = COALESCE(v_new.role, role),

    -- ㉯ 관리자가 정하는 소속 — 명단 우선, 명단이 비었을 때만 승인 화면 값
    duty            = COALESCE(NULLIF(btrim(duty),            ''), v_new.duty),
    labri_id        = COALESCE(NULLIF(btrim(labri_id),        ''), v_new.labri_id),
    family_group_id = COALESCE(NULLIF(btrim(family_group_id), ''), v_new.family_group_id),
    family_role     = COALESCE(NULLIF(btrim(family_role),     ''), v_new.family_role),
    teach_group     = COALESCE(NULLIF(btrim(teach_group),     ''), v_new.teach_group),

    -- ㉱ 자녀·배우자·메모 — 양쪽을 합칩니다(명단이 primary)
    family_info = public.merge_family_info(family_info, v_new.family_info),

    -- 계정 상태·기기 정보 — 명단 행에는 있을 수 없는 값들입니다
    signup_requested_at = COALESCE(v_new.signup_requested_at, signup_requested_at),
    welcomed_at         = COALESCE(v_new.welcomed_at,         welcomed_at),
    last_active_at      = COALESCE(v_new.last_active_at,      last_active_at),
    is_pwa              = COALESCE(v_new.is_pwa,              is_pwa),
    device_platform     = COALESCE(NULLIF(btrim(v_new.device_platform), ''), device_platform),
    browser_name        = COALESCE(NULLIF(btrim(v_new.browser_name),    ''), browser_name)
    -- created_at 은 명단에 오른 날을 그대로 둡니다.
    -- previous_role / keep_app_access 는 명단 행의 탈퇴 이력이라 건드리지 않습니다.
  WHERE id = placeholder_id;
END;
$function$;

revoke all on function public.claim_unregistered_member(uuid, uuid) from public;
grant execute on function public.claim_unregistered_member(uuid, uuid) to authenticated;

comment on function public.claim_unregistered_member(uuid, uuid) is
  '미가입 성도 명단 행을 승인된 가입 계정에 이어 붙입니다. 이름·연락처·주소·생년월일·사진은 가입자 값 우선, 직분·라브리·가족은 명단 값 우선, 등급은 승인 화면 값, 자녀는 양쪽 합치기. 승인 대기 계정과는 연결할 수 없습니다. 관리자 전용.';
