-- 푸시 확장 3단계: 생일 축하(BIRTHDAY), 새 공지(NOTICE)도 푸시로 내보냅니다.
drop trigger if exists trg_notifications_enqueue_push on public.notifications;
create trigger trg_notifications_enqueue_push
  after insert on public.notifications
  for each row
  when (new.type in ('MANUAL', 'MEAL', 'BULLETIN', 'ATTENDANCE', 'BIRTHDAY', 'NOTICE'))
  execute function public.enqueue_push_job();
