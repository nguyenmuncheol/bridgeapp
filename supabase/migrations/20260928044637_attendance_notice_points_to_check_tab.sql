-- 출석체크 입력이 관리 화면의 "출첵" 탭으로 옮겨져, 미완료 알림 문구의 안내 위치도 바꿉니다.
-- (함수 본문은 그대로 두고 안내 문구만 바꿉니다)
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.notify_attendance_pending(integer)'::regprocedure);
  d := replace(d, '(관리 화면 > 출석)', '(관리 화면 > 출첵)');
  EXECUTE d;
END
$mig$;
