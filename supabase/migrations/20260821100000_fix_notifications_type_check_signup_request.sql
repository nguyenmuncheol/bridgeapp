-- 긴급 수정: SIGNUP_REQUEST 알림 타입이 notifications_type_check CHECK 제약에 빠져 있어
-- 신규 가입(auth.users -> profiles 자동생성 -> 가입알림 트리거) 전체 트랜잭션이 실패하고 있었음
-- (증상: OAuth 로그인 후 "Database error saving new user"로 계속 튕김. 기존 회원 로그인은
-- profiles가 이미 있어 트리거가 안 붙어서 영향 없었음 — 신규 가입자만 100% 실패).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['COMMENT', 'LIKE', 'NOTICE', 'MEAL', 'ATTENDANCE', 'BIRTHDAY', 'BULLETIN', 'MANUAL', 'SIGNUP_REQUEST']));
