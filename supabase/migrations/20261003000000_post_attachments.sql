-- ─────────────────────────────────────────────────────────────────────────────
-- 찬양/묵상나눔 첨부파일 (악보 PDF · 음원 · 문서)
--
-- 앱이 하는 제한 (src/lib/storage.ts):
--   · 파일당 5MB 이하, 글 하나에 최대 3개
--   · 사진은 올리기 전에 1600px JPEG 로 줄임
-- 서버가 하는 제한 (이 파일):
--   · 글 하나에 3개 초과 금지 (API 를 직접 불러도 못 넘음)
--   · 허용 형식 확장 — 지금까지는 사진 형식만 받아서 PDF·음원은 서버가 거절합니다.
--
-- ⚠️ 파일 크기 상한은 버킷 전체에 걸리므로 기존 10MB 를 그대로 둡니다
--    (사진 업로드가 같은 버킷을 씁니다). 5MB 는 앱에서 막습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. 글에 붙은 파일 목록: [{ "url", "name", "size", "type" }, ...]
--    파일 자체는 church-assets 버킷의 attachments/ 폴더에 있고, 여기엔 정보만 둡니다.
alter table public.posts
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.posts drop constraint if exists posts_attachments_limit;
alter table public.posts
  add constraint posts_attachments_limit
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 3);


-- 2. 저장소 허용 형식 확장
--    src/lib/storage.ts 의 ATTACHMENT_TYPES 와 같은 목록이어야 합니다.
--    (앞의 6개는 기존 사진 형식 — 프로필·주보·행사사진이 계속 쓰므로 그대로 둡니다)
update storage.buckets
set allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'application/pdf',
      'audio/mpeg',
      'audio/mp4',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/x-hwp',
      'application/hwp+zip'
    ]
where id = 'church-assets';
