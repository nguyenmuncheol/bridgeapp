-- 가입 승인 대기 화면이 폴링(15초) 없이도 즉시 반응하도록, profiles 테이블 변경을 실시간으로 받습니다.
-- (RLS는 그대로 적용되므로 노출 범위는 기존과 동일 — 실시간 구독 채널만 추가로 열어주는 것)
alter publication supabase_realtime add table public.profiles;
