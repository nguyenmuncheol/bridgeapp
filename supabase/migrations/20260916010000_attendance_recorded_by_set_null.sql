-- attendance_records.recorded_by 만 NO ACTION 이라, 출석을 한 번이라도 입력한
-- 리더·선생님 계정을 삭제하면 외래키 오류로 막힙니다. 다른 세 테이블
-- (child_attendance_records / visitor_records / meal_registrations) 은 이미
-- SET NULL 이라 이 테이블만 규칙을 맞춥니다. 과거 출석 기록은 남고
-- "누가 입력했는지"만 비워집니다.

alter table public.attendance_records
  drop constraint attendance_records_recorded_by_fkey,
  add constraint attendance_records_recorded_by_fkey
    foreign key (recorded_by) references public.profiles(id) on delete set null;
