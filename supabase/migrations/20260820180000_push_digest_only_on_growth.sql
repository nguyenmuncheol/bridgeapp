-- 댓글·좋아요 요약 푸시: 안 읽은 개수가 그대로면 반복 발송하지 않고,
-- 지난번 발송 이후 "새로" 안 읽은 게 생겼을 때만 다시 보냅니다.
-- (읽은 걸 다시 안 읽음으로 되돌리는 기능은 없으므로, "마지막으로 푸시를 보낸
--  시점 이후에 생긴 안 읽은 알림이 있는가"로 판단하면 늘었는지를 정확히 알 수 있습니다.)

create table if not exists public.push_digest_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_notified_at timestamptz not null default '-infinity'
);

alter table public.push_digest_state enable row level security;
-- 본인 데이터가 아니라 발송 커서일 뿐이라, 일반 사용자 접근 정책은 만들지 않습니다
-- (Edge Function/함수는 service role 또는 security definer라 RLS와 무관하게 동작).

create or replace function public.run_comment_like_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select
      n.user_id,
      count(*) as unread_count,
      max(n.created_at) as latest_created_at,
      coalesce(s.last_notified_at, '-infinity'::timestamptz) as cursor
    from public.notifications n
    left join public.push_digest_state s on s.user_id = n.user_id
    where n.type in ('COMMENT', 'LIKE')
      and n.is_read = false
    group by n.user_id, s.last_notified_at
  loop
    -- 지난 발송 이후 새로 생긴 안 읽은 알림이 없으면(=개수가 그대로면) 건너뜁니다.
    if r.latest_created_at <= r.cursor then
      continue;
    end if;

    insert into public.push_jobs (user_id, payload)
    values (
      r.user_id,
      jsonb_build_object(
        'title', '새 댓글·좋아요 알림',
        'body', '확인 안 하신 댓글·좋아요가 ' || r.unread_count || '건 있어요',
        'url', '/#home'
      )
    );

    insert into public.push_digest_state (user_id, last_notified_at)
    values (r.user_id, r.latest_created_at)
    on conflict (user_id) do update set last_notified_at = excluded.last_notified_at;
  end loop;
end;
$$;
