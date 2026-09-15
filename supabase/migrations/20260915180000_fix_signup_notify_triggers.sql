-- ─────────────────────────────────────────────────────────────────────────────
-- 가입 신청 알림이 "신청하지도 않았는데" 나가던 문제
--
-- 🐛 증상: 관리자 폰에 "○○님이 가입 승인을 요청했습니다" 푸시가 오는데,
--    관리 화면 > 승인 대기 목록을 열어 보면 **아무도 없습니다.**
--
-- 원인: profiles 에 가입 알림 트리거가 **세 개** 붙어 있었습니다.
--
--   trg_profiles_notify_signup_request         (올바른 것)
--     → signup_requested_at 이 채워질 때. 즉 성도가 이름·연락처를 입력하고
--       "가입 신청" 버튼을 실제로 눌렀을 때만 발동합니다.
--
--   trg_profiles_notify_signup_request_insert  (지워졌어야 할 것)
--     → role='PENDING' 행이 INSERT 될 때. 그건 **카카오/구글 로그인을 마친 순간**이라
--       아직 폼을 열어 보지도 않은 시점입니다. 여기서 알림이 나갔습니다.
--
--   trg_profiles_notify_signup_request_update  (지워졌어야 할 것)
--     → role 이 PENDING 으로 바뀔 때. 거절된 분이 다시 신청하는 경로에서
--       올바른 트리거와 **겹쳐서 알림이 두 번** 나갔습니다.
--
-- 뒤의 두 개는 2026-08-21 의 마이그레이션(signup_request_only_on_submit)이 이미
-- 지우도록 되어 있었는데, 그보다 앞선 마이그레이션(signup_request_admin_push)이
-- 나중에 다시 실행되면서 되살아난 것으로 보입니다. 실제 DB 에는 셋 다 살아 있었습니다.
--
-- 승인 대기 목록은 role='PENDING' **이면서** signup_requested_at 이 있는 사람만 보여 줍니다
-- (로그인만 하고 신청은 안 한 사람을 관리자에게 들이밀지 않으려는 의도적 설계입니다).
-- 그래서 INSERT 알림만 나가고 목록은 비어 있는, 딱 지금의 증상이 됩니다.
--
-- → 되살아난 두 개를 다시 지웁니다. 올바른 트리거 하나만 남습니다.
--
-- 확인: role 이 PENDING 으로 바뀌는 정상 경로는 모두 같은 UPDATE 안에서
--       signup_requested_at 도 함께 채웁니다(dbReapplyUser). 따라서 남는 트리거
--       하나로 모든 실제 신청이 빠짐없이 알림을 냅니다.
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists trg_profiles_notify_signup_request_insert on public.profiles;
drop trigger if exists trg_profiles_notify_signup_request_update on public.profiles;

-- 올바른 트리거가 혹시 없어졌을 경우를 대비해 다시 보장합니다(있으면 그대로 유지).
drop trigger if exists trg_profiles_notify_signup_request on public.profiles;
create trigger trg_profiles_notify_signup_request
  after update on public.profiles
  for each row
  when (new.signup_requested_at is not null
        and new.signup_requested_at is distinct from old.signup_requested_at)
  execute function public.notify_admins_of_signup_request();
