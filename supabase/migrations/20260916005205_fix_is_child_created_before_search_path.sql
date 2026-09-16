-- Supabase 보안 린트: is_child_created_before() 가 search_path 를 지정하지 않고 있었습니다.
-- SECURITY DEFINER 가 아니라 실제 위험은 낮지만, 린트를 0으로 유지합니다.
--
-- 참고: 이 함수는 IMMUTABLE 로 선언돼 있는데 안에서 '... +07'::timestamptz 캐스팅을
-- 합니다. 오프셋을 명시했으니 지금은 결정적이라 문제없습니다. 다만 나중에 +07 을 빼고
-- 서버 타임존에 기대는 식으로 고치면 그때부터 조용히 틀려집니다. 건드릴 때 주의하세요.

alter function public.is_child_created_before(text, date) set search_path to 'public';
