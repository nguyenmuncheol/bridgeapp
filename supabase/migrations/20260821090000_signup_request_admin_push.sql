-- 가입 승인 요청(PENDING) 발생 시 관리자 전원에게 앱 알림 + 푸시.
-- 새 가입(INSERT)과 거절 후 재신청(REJECTED -> PENDING) 둘 다 대상.

create or replace function public.notify_admins_of_signup_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.notifications (user_id, type, title, body, actor_name, post_category)
  select
    p.id,
    'SIGNUP_REQUEST',
    '새 가입 신청',
    coalesce(new.name, '새 신청자') || '님이 가입 승인을 요청했습니다.',
    coalesce(new.name, '새 신청자'),
    ''
  from public.profiles p
  where p.role = 'ADMIN';

  return new;
end;
$$;

-- INSERT와 UPDATE는 WHEN 절에서 OLD를 함께 참조할 수 없어(Postgres 42P17) 트리거를 나눕니다.
drop trigger if exists trg_profiles_notify_signup_request_insert on public.profiles;
create trigger trg_profiles_notify_signup_request_insert
  after insert on public.profiles
  for each row
  when (new.role = 'PENDING')
  execute function public.notify_admins_of_signup_request();

drop trigger if exists trg_profiles_notify_signup_request_update on public.profiles;
create trigger trg_profiles_notify_signup_request_update
  after update on public.profiles
  for each row
  when (new.role = 'PENDING' and old.role is distinct from 'PENDING')
  execute function public.notify_admins_of_signup_request();

-- 새 알림 타입도 푸시 발송 대상에 포함
drop trigger if exists trg_notifications_enqueue_push on public.notifications;
create trigger trg_notifications_enqueue_push
  after insert on public.notifications
  for each row
  when (new.type in ('MANUAL', 'MEAL', 'BULLETIN', 'ATTENDANCE', 'BIRTHDAY', 'NOTICE', 'SIGNUP_REQUEST'))
  execute function public.enqueue_push_job();
