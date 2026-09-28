-- 사진 업로드는 승인된 성도만, 글·댓글은 본인 이름으로만 쓸 수 있게 합니다.
DROP POLICY IF EXISTS "write 1e3dv8p_0" ON storage.objects;
DROP POLICY IF EXISTS "church_assets_insert" ON storage.objects;
CREATE POLICY "church_assets_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'church-assets' AND (select public.is_approved_member()));

ALTER POLICY posts_insert_policy ON public.posts
  WITH CHECK ((select public.is_approved_member()) AND author_id = (select auth.uid()));
ALTER POLICY comments_insert_policy ON public.post_comments
  WITH CHECK ((select public.is_approved_member()) AND author_id = (select auth.uid()));

-- 푸시 발송 함수의 검색 경로 고정 (Supabase 보안 점검 권고)
ALTER FUNCTION public.dispatch_pending_push() SET search_path = public;
