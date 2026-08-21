-- 가입 승인 알림이 "로그인 직후(추가정보 입력 전)"가 아니라
-- 실제로 "가입 완료 및 승인 신청" 버튼을 눌렀을 때만 발동하도록 바꿉니다.
--
-- 지금까지는 새 profiles 행이 role='PENDING'으로 INSERT되는 순간(=OAuth 로그인 직후,
-- 사용자가 폼을 채우기도 전) 관리자 알림/푸시가 나갔습니다. 신청 버튼을 누른 시점을
-- 별도 컬럼(signup_requested_at)으로 명확히 구분해, 그 값이 채워질 때만 알림을 보냅니다.

alter table public.profiles add column if not exists signup_requested_at timestamptz;

-- 이미 신청 대기 중인 기존 성도는 신청한 것으로 간주해 채워둡니다
-- (그렇지 않으면 이 마이그레이션 이후 기존 대기자가 "미신청"으로 보여 홈 탭만 보이게 됩니다).
update public.profiles
set signup_requested_at = created_at
where role = 'PENDING' and signup_requested_at is null;

-- INSERT 시점 알림은 더 이상 필요 없습니다 (신청 전이므로).
drop trigger if exists trg_profiles_notify_signup_request_insert on public.profiles;
drop trigger if exists trg_profiles_notify_signup_request_update on public.profiles;

create trigger trg_profiles_notify_signup_request
  after update on public.profiles
  for each row
  when (new.signup_requested_at is not null and new.signup_requested_at is distinct from old.signup_requested_at)
  execute function public.notify_admins_of_signup_request();
