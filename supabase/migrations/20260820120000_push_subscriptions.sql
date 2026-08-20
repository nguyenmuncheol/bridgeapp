-- 푸시 알림 도입 1단계: 구독 저장소 + 발송 큐
-- 설계 문서: docs/superpowers/specs/2026-08-20-push-notifications-design.md

-- 성도가 "휴대폰 알림 받기"를 켜면 기기별로 한 줄씩 쌓입니다.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "본인 구독만 조회" on public.push_subscriptions;
create policy "본인 구독만 조회" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "본인 구독만 등록" on public.push_subscriptions;
create policy "본인 구독만 등록" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "본인 구독만 삭제" on public.push_subscriptions;
create policy "본인 구독만 삭제" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- 휴대폰으로 내보낼 알림 발송 큐. Edge Function(send-push)이 주기적으로 비웁니다.
create table if not exists public.push_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists push_jobs_pending_idx on public.push_jobs(created_at) where status = 'pending';

-- push_jobs는 앱(사용자)이 아니라 Edge Function(service role)만 다룹니다.
-- RLS만 켜두고 별도 정책은 만들지 않아 일반 사용자 접근을 기본 차단합니다.
alter table public.push_jobs enable row level security;
