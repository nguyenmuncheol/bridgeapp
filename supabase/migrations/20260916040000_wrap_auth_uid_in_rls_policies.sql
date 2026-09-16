-- posts / post_comments / notifications / attendance_records / push_subscriptions /
-- user_access_logs 정책들이 auth.uid() 를 행마다 다시 계산합니다.
-- (select auth.uid()) 로 감싸면 한 번만 계산되어 큰 테이블에서 유리합니다.
--
-- 권한 로직은 그대로 두고 평가 시점만 바꾸는 것이라 정책 내용(조건)은 그대로
-- 옮겨 적었습니다. is_admin() / can_manage_attendance() / can_view_secret_posts() /
-- my_family_group_id() 같은 SECURITY DEFINER 판별 함수는 감싸지 않습니다 —
-- 이미 내부에서 RLS 를 안 타고, 건드리면 9/15 오전 재귀 장애(42P17)와 같은
-- 종류의 사고가 납니다. profiles / meal_registrations / meal_coupons /
-- meal_coupon_history 는 consolidate_rls_policies 에서 이미 감싸져 있어 대상이
-- 아닙니다.

alter policy attendance_select_policy on public.attendance_records
  using ((select auth.uid()) = user_id or can_manage_attendance());

alter policy notifications_delete on public.notifications
  using ((select auth.uid()) = user_id);

alter policy notifications_select on public.notifications
  using ((select auth.uid()) = user_id);

alter policy notifications_update on public.notifications
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy comments_delete_policy on public.post_comments
  using ((select auth.uid()) = author_id or is_admin());

alter policy comments_insert_policy on public.post_comments
  with check ((select auth.uid()) is not null);

alter policy comments_select_policy on public.post_comments
  using ((select auth.uid()) is not null);

alter policy comments_update_policy on public.post_comments
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

alter policy posts_delete_policy on public.posts
  using ((select auth.uid()) = author_id or is_admin());

alter policy posts_insert_policy on public.posts
  with check ((select auth.uid()) is not null);

alter policy posts_select_policy on public.posts
  using (
    category = 'NOTICE'
    or (
      (select auth.uid()) is not null
      and (
        coalesce(is_secret, false) = false
        or author_id = (select auth.uid())
        or can_view_secret_posts()
      )
    )
  );

alter policy posts_update_policy on public.posts
  using ((select auth.uid()) = author_id or is_admin())
  with check ((select auth.uid()) = author_id or is_admin());

alter policy "본인 구독만 등록" on public.push_subscriptions
  with check ((select auth.uid()) = user_id);

alter policy "본인 구독만 삭제" on public.push_subscriptions
  using ((select auth.uid()) = user_id);

alter policy "본인 구독만 조회" on public.push_subscriptions
  using ((select auth.uid()) = user_id);

alter policy "관리자 접속 로그 조회" on public.user_access_logs
  using (
    exists (
      select 1 from public.profiles
       where profiles.id = (select auth.uid())
         and profiles.role = 'ADMIN'
    )
  );

alter policy "모든 로그인 사용자 접속 로그 등록" on public.user_access_logs
  with check ((select auth.uid()) = user_id);
