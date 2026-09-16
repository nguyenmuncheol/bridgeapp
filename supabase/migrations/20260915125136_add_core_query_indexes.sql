-- 게시판 목록(카테고리별 최신순), 댓글 조회, 알림 정리(push_jobs → notification_id)에서
-- 시퀀셜 스캔이 나던 세 곳에 인덱스를 추가합니다.

create index if not exists posts_category_created_idx
  on public.posts (category, created_at desc);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at);

create index if not exists push_jobs_notification_idx
  on public.push_jobs (notification_id);
