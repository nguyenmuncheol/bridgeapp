-- ─────────────────────────────────────────────────────────────────────────────
-- 알림/작업 함수의 공개 실행 권한 회수
--
-- 🔒 과거 구멍: 아래 함수들은 SECURITY DEFINER(정의자 권한)로 도는데, 함수를 만들면
--    PostgreSQL이 기본으로 PUBLIC 에 EXECUTE 를 주기 때문에 PostgREST 를 통해
--    `/rest/v1/rpc/<함수명>` 으로 **로그인조차 하지 않은 사람이** 호출할 수 있었습니다.
--    함수 안에 권한 검사도 없어서, 다음이 가능했습니다.
--
--      · notify_* / run_comment_like_digest → 교회 전체에 푸시 알림을 몇 번이고 발송
--      · cleanup_notifications             → 알림 임의 삭제
--      · claim_push_jobs                   → 대기 중인 푸시의 제목·본문·수신자를 읽어가고
--                                            동시에 processing 으로 바꿔 실제 기기에는
--                                            영영 도착하지 않게 만듦
--
-- → 실제 호출자만 남깁니다. 확인한 결과 호출 경로는 두 가지뿐입니다.
--      · notify_* / cleanup_notifications / run_comment_like_digest
--          → pg_cron 이 `postgres` 역할로 실행 (cron.job 확인 완료)
--      · claim_push_jobs
--          → send-push Edge Function 이 service_role 키로 호출 (cron.job 명령 확인 완료)
--    앱 클라이언트는 이 중 어느 것도 호출하지 않습니다. 앱이 쓰는 5개 RPC
--    (toggle_post_like, send_manual_notification, run_notification_job,
--     claim_unregistered_member, adjust_meal_coupon)는 모두 내부에 권한 검사가 있어
--    그대로 둡니다.
--
-- 주의: PUBLIC 에서 회수하면 service_role 도 함께 잃으므로, 필요한 곳에 명시적으로
--       다시 부여합니다. postgres 는 소유자라 회수의 영향을 받지 않습니다.
--
-- RLS 정책 안에서 쓰이는 is_admin() / can_edit_child_attendance() 등의 판별 함수는
-- 일부러 건드리지 않았습니다. 정책을 평가하려면 조회하는 당사자에게 EXECUTE 가
-- 있어야 하므로, 회수하면 정상 조회까지 막힙니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) 푸시 큐 집기 — Edge Function(service_role) 전용
REVOKE EXECUTE ON FUNCTION public.claim_push_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_push_jobs(integer) TO service_role;

-- 2) 정기 발송/정리 작업 — pg_cron(postgres) 전용
REVOKE EXECUTE ON FUNCTION public.notify_attendance_pending(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_meal_pending(integer)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_birthday()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_bulletin()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_notifications()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_comment_like_digest()          FROM PUBLIC, anon, authenticated;

-- 관리자가 [알림] 탭에서 수동 실행하는 run_notification_job 은 내부에 is_admin() 가드가
-- 있고 이 작업들을 대신 호출해 주므로, 관리자 수동 발송 경로는 그대로 유지됩니다.
GRANT EXECUTE ON FUNCTION public.notify_attendance_pending(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_meal_pending(integer)       TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_birthday()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_bulletin()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_notifications()            TO service_role;
GRANT EXECUTE ON FUNCTION public.run_comment_like_digest()          TO service_role;

-- ── 추가: 관리자 전용 RPC 에서 anon 만 회수 ──
-- 아래 셋은 함수 안에 is_admin() 가드가 있어 비로그인 호출은 어차피 예외로 막힙니다.
-- 다만 "막힌다"와 "닿지도 않는다"는 다르고, 앱은 셋 다 로그인한 관리자 화면에서만
-- 호출하므로 anon 에게 열어 둘 이유가 없습니다. authenticated 는 그대로 둡니다
-- (가드가 역할을 확인하므로 일반 성도가 호출해도 거부됩니다).
REVOKE EXECUTE ON FUNCTION public.send_manual_notification(text, text, text, text, uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_notification_job(text, boolean)                            FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_unregistered_member(uuid, uuid)                          FROM anon;
