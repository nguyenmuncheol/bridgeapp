-- push_subscriptions 는 "본인 구독만 조회" 정책만 있어서, /analytics 페이지를 보는
-- ADMIN 도 자기 자신의 구독 행 하나만 볼 수 있고 다른 성도의 구독은 전혀
-- 조회하지 못했습니다. 그래서 실제로 푸시를 켜고 정상 작동 중인 성도가
-- analytics 화면의 "푸시 구독" 카운트/목록에서 통째로 빠졌습니다.
--
-- → 관리자는 전체를 볼 수 있는 SELECT 정책을 추가합니다. (기존 "본인 구독만"
--   정책과 OR 로 합쳐지므로 일반 사용자의 조회 범위는 그대로입니다)

create policy "관리자는 전체 구독 조회" on public.push_subscriptions
  for select
  using (is_admin());
