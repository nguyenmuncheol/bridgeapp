-- 인덱스 없는 외래키 남은 9개. 전부 "성도를 삭제할 때만" 걸리는 경로라 급하지
-- 않지만, 위 attendance_recorded_by_set_null 작업과 같이 넣습니다.

create index if not exists attendance_records_recorded_by_idx
  on public.attendance_records (recorded_by);
create index if not exists child_attendance_records_recorded_by_idx
  on public.child_attendance_records (recorded_by);
create index if not exists visitor_records_recorded_by_idx
  on public.visitor_records (recorded_by);
create index if not exists meal_registrations_registered_by_idx
  on public.meal_registrations (registered_by_user_id);
create index if not exists meal_coupon_history_family_group_idx
  on public.meal_coupon_history (family_group_id);
create index if not exists post_comments_author_idx
  on public.post_comments (author_id);
create index if not exists posts_author_idx
  on public.posts (author_id);
create index if not exists push_jobs_user_idx
  on public.push_jobs (user_id);
create index if not exists user_access_logs_user_idx
  on public.user_access_logs (user_id);
