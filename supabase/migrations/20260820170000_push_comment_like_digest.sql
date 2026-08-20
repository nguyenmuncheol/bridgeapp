-- 댓글·좋아요는 개별 발송하지 않고, 안 읽은 게 있으면 하루 최대 2번(오전 11시·오후 9시,
-- 베트남 시각) 요약 푸시 1건으로만 알립니다. 앱에서 알림함을 열어 읽음 처리하면
-- (기존 dbMarkAllNotificationsRead) 다음 발송 대상에서 자동으로 빠집니다.

-- push_jobs가 "알림 1건 = 발송 1건"만 다루던 걸, 요약 발송(user_id + 직접 payload)도
-- 다룰 수 있게 확장합니다.
alter table public.push_jobs alter column notification_id drop not null;
alter table public.push_jobs add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.push_jobs add column if not exists payload jsonb;
alter table public.push_jobs add constraint push_jobs_source_check
  check (
    (notification_id is not null) or (user_id is not null and payload is not null)
  );

create or replace function public.run_comment_like_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_jobs (user_id, payload)
  select
    n.user_id,
    jsonb_build_object(
      'title', '새 댓글·좋아요 알림',
      'body', '확인 안 하신 댓글·좋아요가 ' || count(*) || '건 있어요',
      'url', '/#home'
    )
  from public.notifications n
  where n.type in ('COMMENT', 'LIKE')
    and n.is_read = false
  group by n.user_id;
end;
$$;

select cron.schedule('push-digest-comment-like-11am', '0 4 * * *', $$select public.run_comment_like_digest();$$);
select cron.schedule('push-digest-comment-like-9pm', '0 14 * * *', $$select public.run_comment_like_digest();$$);
