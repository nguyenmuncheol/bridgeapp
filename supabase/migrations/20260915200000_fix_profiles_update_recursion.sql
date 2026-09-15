-- ─────────────────────────────────────────────────────────────────────────────
-- 🔥 긴급: profiles UPDATE 가 전부 막혀 있던 문제
--
-- 증상: 신규 성도가 이름·연락처를 입력하고 "가입 신청"을 눌러도 저장되지 않습니다.
--       (화면은 닫히고 이름도 바뀐 것처럼 보이지만 DB 에는 아무것도 안 들어갑니다 —
--        앱이 update 의 error 를 확인하지 않고 있었기 때문입니다.)
--       마이페이지 정보 수정, 가족현황 입력도 같이 막혀 있었습니다.
--
-- 오류: ERROR 42P17: infinite recursion detected in policy for relation "profiles"
--
-- 원인: 2026-09-15 의 consolidate_rls_policies 마이그레이션에서 profiles 의 UPDATE 정책
--       세 개를 하나로 합치면서, "같은 가족이면 수정 가능" 조건 안의
--
--           family_group_id = (select p.family_group_id from public.profiles p
--                               where p.id = auth.uid())
--
--       를 **본인 수정 조건과 같은 식 안에** 넣었습니다. profiles 정책 안에서 profiles 를
--       다시 읽으니 그 안쪽 조회에도 같은 정책이 걸려 재귀합니다.
--
--       합치기 전에는 이 조건이 별도 정책(profiles_family_update)으로 떨어져 있었고,
--       본인 수정 정책이 먼저 통과하면 이 식까지 갈 일이 없어 드러나지 않았습니다.
--       하나로 합치는 순간 항상 평가되면서 터졌습니다.
--
-- → 자기 가족 번호를 SECURITY DEFINER 함수로 읽습니다. is_admin() 과 같은 방식으로,
--   함수 안의 조회는 RLS 를 거치지 않으므로 재귀가 생기지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- 지금 로그인한 사람의 가족 번호. RLS 를 우회해 읽으므로 정책 안에서 안전하게 쓸 수 있습니다.
create or replace function public.my_family_group_id()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select family_group_id from public.profiles where id = auth.uid()
$function$;

-- 정책 안에서만 쓰는 함수이므로 실행 권한은 로그인 사용자까지만 둡니다.
revoke execute on function public.my_family_group_id() from public;
grant execute on function public.my_family_group_id() to authenticated, service_role;

drop policy if exists "profiles_update_policy" on public.profiles;
create policy "profiles_update_policy" on public.profiles
  for update to authenticated
  using (
    (select auth.uid()) = id
    or public.is_admin()
    or (
      family_group_id is not null
      and family_group_id = public.my_family_group_id()
    )
  )
  with check (
    (select auth.uid()) = id
    or public.is_admin()
    or (
      family_group_id is not null
      and family_group_id = public.my_family_group_id()
    )
  );
