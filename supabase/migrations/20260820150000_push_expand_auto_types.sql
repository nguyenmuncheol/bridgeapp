-- 푸시 확장 2단계: 식사 미응답 / 새 주보 / 출석 리마인더도 푸시로 내보냅니다.
-- (생일·공지는 보류 — Push plan.md §4 권장안)
drop trigger if exists trg_notifications_enqueue_push on public.notifications;
create trigger trg_notifications_enqueue_push
  after insert on public.notifications
  for each row
  when (new.type in ('MANUAL', 'MEAL', 'BULLETIN', 'ATTENDANCE'))
  execute function public.enqueue_push_job();
