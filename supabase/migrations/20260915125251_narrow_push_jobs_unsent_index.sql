-- 바로 앞 마이그레이션에서 만든 부분 인덱스가 push_jobs 전체 상태를 대상으로
-- 잡혀 있어 필요 이상으로 넓었습니다. dispatch_pending_push() 가 실제로 찾는
-- 범위(pending / processing)로 좁혀서 인덱스 크기와 유지비용을 줄입니다.

drop index if exists public.push_jobs_unsent_idx;

create index if not exists push_jobs_unsent_idx
  on public.push_jobs (status, processed_at)
  where status = any (array['pending'::text, 'processing'::text]);
