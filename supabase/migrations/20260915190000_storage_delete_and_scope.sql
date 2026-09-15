-- ─────────────────────────────────────────────────────────────────────────────
-- 파일 저장소(church-assets) 정리 — 삭제가 되게, 목록은 안 새게
--
-- 🐛 문제 1: "사진 파일도 함께 삭제됩니다"가 사실이 아니었습니다.
--    storage.objects 에 INSERT·SELECT 정책만 있고 DELETE 정책이 없었습니다.
--    앱은 글을 지울 때 파일도 지우려 하지만(dbDeletePost → deleteImagesFromStorage)
--    정책이 없어 실패하고, 그 오류는 console.warn 으로만 남고 삼켜졌습니다.
--    실제로 전체 62개 중 50개(6.7MB, 용량의 69%)가 참조되지 않는 채 남아 있었고,
--    지웠다고 안내받은 사진이 주소만 알면 그대로 열렸습니다.
--
-- 🐛 문제 2: 비로그인(anon)이 업로드된 파일 전체를 목록으로 훑을 수 있었습니다.
--    SELECT 정책이 public 역할(=anon 포함)에게 열려 있어, anon 권한으로 조회하면
--    62개가 전부 나왔습니다. 그중 avatars 11개는 성도 프로필 사진입니다.
--
-- 🐛 문제 3: 버킷에 파일 크기·형식 제한이 없었습니다. 앱 화면은 올리기 전에
--    1600px·품질 0.82 JPEG 로 줄이지만, 로그인한 사람이 API 를 직접 부르면
--    어떤 형식이든 크기든 올릴 수 있었습니다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════
-- 1. 삭제가 실제로 되게 — 올린 본인 또는 관리자만
--
--    storage.objects.owner 에 올린 사람이 기록됩니다(62개 중 61개에 있습니다).
--    "아무 로그인 사용자나 아무 파일이나 지울 수 있음"은 너무 넓으므로 소유자로 좁힙니다.
--    관리자는 남의 글을 지울 권한이 이미 있으니(posts 정책) 그 글의 사진도 지울 수 있어야
--    앞뒤가 맞습니다.
--
--    owner 가 비어 있는 오래된 파일 1개는 이 정책으로 지워지지 않습니다.
--    그건 아래 고아 파일 정리에서 관리자가 직접 처리합니다.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "church_assets_delete" on storage.objects;
create policy "church_assets_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'church-assets'
    and (owner = (select auth.uid()) or public.is_admin())
  );

-- 사진을 교체할 때(예: 프로필 사진 변경) 같은 경로에 덮어쓰는 경우를 위해 UPDATE 도 같은 기준으로.
drop policy if exists "church_assets_update" on storage.objects;
create policy "church_assets_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'church-assets'
    and (owner = (select auth.uid()) or public.is_admin())
  )
  with check (bucket_id = 'church-assets');


-- ═══════════════════════════════════════════════════════════════
-- 2. 목록으로 훑는 것만 막기
--
--    ⚠️ 버킷은 public 으로 그대로 둡니다. /object/public/... 주소는 RLS 를 거치지 않으므로
--    이미 화면에 떠 있는 이미지와, 비로그인에게 열어 두기로 한 주보 이미지는 그대로 뜹니다.
--    이 정책이 막는 것은 **파일 목록을 나열해서 통째로 가져가는 것**입니다.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "read 1e3dv8p_0" on storage.objects;
drop policy if exists "church_assets_select" on storage.objects;
create policy "church_assets_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'church-assets');


-- ═══════════════════════════════════════════════════════════════
-- 3. 업로드 제한
--
--    앱이 압축해서 올리면 보통 수백 KB 이므로 10MB 는 넉넉합니다.
--    형식은 이미지로 한정합니다(프로필 사진·주보·행사사진이 전부 이미지입니다).
-- ═══════════════════════════════════════════════════════════════

update storage.buckets
set file_size_limit = 10485760,   -- 10MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
where id = 'church-assets';
