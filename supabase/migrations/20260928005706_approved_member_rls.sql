-- ─────────────────────────────────────────────────────────────────────────────
-- 가입 승인을 서버에서도 확인합니다 (성도 명단·나눔 글·식사 신청)
--
-- 🔒 과거 구멍: 가입 승인은 **화면에서만** 막고 있었습니다. 서버(RLS) 규칙은
--    "로그인만 했으면 허용"이라, 구글·카카오로 로그인만 한 사람(승인 대기 PENDING,
--    거절 REJECTED, 탈퇴 LEFT 포함)이 공개 anon 키로 아래를 그대로 읽을 수 있었습니다.
--      · profiles           → 전 성도의 전화번호·주소·생일·가족정보·이메일
--      · posts / comments   → 기도제목·교우소식·행사사진·찬양나눔 (비밀글은 예외로 막혀 있었음)
--      · meal_*             → 가정별 식사 신청·식권 잔액·메뉴
--    실제로 app/page.tsx 는 승인 대기자의 브라우저에서도 성도 명단 전체를 내려받고
--    있었습니다(개발자도구 네트워크 탭에 그대로 보임).
--    식사 신청(meal_registrations)은 쓰기까지 열려 있어, 로그인한 아무나 다른 가정의
--    신청을 바꾸거나 지울 수 있었습니다.
--
-- ✅ 규칙
--   · "승인된 성도" = 화면의 isApprovedMember 와 같은 기준
--       MEMBER / LEADER / ADMIN / COUPON / TEACHER,
--       그리고 탈퇴(LEFT) 중 관리자가 '커뮤니티 접근 유지'를 켜 둔 분
--   · profiles  읽기 : 본인 행 + 승인된 성도만 전체
--                      (승인 대기자는 자기 행만 봐야 승인 여부 확인·가입 신청이 됩니다)
--   · posts     읽기 : 공지(NOTICE)는 지금처럼 누구나(비로그인 홈 화면),
--                      나머지는 승인된 성도만 (비밀글 규칙은 그대로)
--   · posts / post_comments 쓰기 : 승인된 성도만
--   · meal_registrations
--       읽기 : 승인된 성도
--       쓰기 : 우리 가정 키(옛 형식 키 포함)이거나, 대신 입력하는 관리자·리더
--   · meal_coupons / meal_coupon_history / meal_menus 읽기 : 승인된 성도
--
-- ✅ 함께 막는 것: keep_app_access(커뮤니티 접근 유지) 와 previous_role(탈퇴 전 등급)은
--    관리자만 정하는 값인데, 본인 행 수정(UPDATE) 이 허용돼 있어 스스로 바꿀 수 있었습니다.
--      · keep_app_access 를 켜면 탈퇴 계정이 위 "승인된 성도" 판정을 통과합니다.
--      · previous_role 을 'ADMIN' 으로 적어 두면, 관리자가 [복구]를 누르는 순간 관리자가 됩니다.
--    → protect_sensitive_profile_fields 트리거가 두 칸도 되돌리도록 합니다.
--
-- 판별 함수들은 기존 is_admin() 등과 같은 모양(SECURITY DEFINER + STABLE)입니다.
-- 정책 안에서는 (select 함수()) 로 감싸 행마다가 아니라 한 번만 계산합니다.
-- 정책을 평가하는 쪽(anon 포함)이 실행 권한을 가져야 하므로 EXECUTE 를 명시해 둡니다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════
-- 1. 판별 함수
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_approved_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND (
         role IN ('MEMBER', 'LEADER', 'ADMIN', 'COUPON', 'TEACHER')
         OR (role = 'LEFT' AND COALESCE(keep_app_access, false))
       )
  );
$function$;

-- 식사 신청 가정 키가 "내 가정"의 것인지.
-- 화면(src/lib/familyKey.ts)이 쓰는 키와 같은 기준입니다.
--   · 지금 키      : family_group_id, 가족이 없으면 'fam_single_<내 id>'
--   · 옛 형식 키   : 같은 가족 구성원의 'fam_single_<id>' 또는 이름
--                    (저장 후 staleFamilyKeys 로 지우는 대상 — 이걸 막으면 중복 집계가 남습니다)
CREATE OR REPLACE FUNCTION public.owns_meal_family_key(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles me
     WHERE me.id = auth.uid()
       AND (
         p_key = 'fam_single_' || me.id::text
         OR p_key = btrim(me.name)
         OR (
           NULLIF(btrim(me.family_group_id), '') IS NOT NULL
           AND (
             p_key = btrim(me.family_group_id)
             OR EXISTS (
               SELECT 1 FROM public.profiles m
                WHERE btrim(m.family_group_id) = btrim(me.family_group_id)
                  AND (p_key = 'fam_single_' || m.id::text OR p_key = btrim(m.name))
             )
           )
         )
       )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_approved_member()        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_meal_family_key(text)  TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════
-- 2. profiles — 본인 행 + 승인된 성도
-- ═══════════════════════════════════════════════════════════════

ALTER POLICY "profiles_select_policy" ON public.profiles
  USING (
    (select auth.uid()) = id
    OR (select public.is_approved_member())
  );


-- ═══════════════════════════════════════════════════════════════
-- 3. posts / post_comments
-- ═══════════════════════════════════════════════════════════════

ALTER POLICY posts_select_policy ON public.posts
  USING (
    category = 'NOTICE'
    OR (
      (select public.is_approved_member())
      AND (
        coalesce(is_secret, false) = false
        OR author_id = (select auth.uid())
        OR (select public.can_view_secret_posts())
      )
    )
  );

ALTER POLICY posts_insert_policy ON public.posts
  WITH CHECK ((select public.is_approved_member()));

ALTER POLICY comments_select_policy ON public.post_comments
  USING ((select public.is_approved_member()));

ALTER POLICY comments_insert_policy ON public.post_comments
  WITH CHECK ((select public.is_approved_member()));


-- ═══════════════════════════════════════════════════════════════
-- 4. meal_registrations — 하나로 뭉친 ALL 정책을 동작별로 나눕니다
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "meal_reg_all_policy" ON public.meal_registrations;

CREATE POLICY "meal_reg_select_policy" ON public.meal_registrations
  FOR SELECT TO authenticated
  USING ((select public.is_approved_member()));

-- 대신 입력(관리자 식사 탭)은 ADMIN·LEADER 만 합니다 — MealsTab 의 canProxyRegister 와 같은 기준.
CREATE POLICY "meal_reg_insert_policy" ON public.meal_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    (select public.is_approved_member())
    AND ((select public.can_manage_attendance()) OR public.owns_meal_family_key(family_group_id))
  );

CREATE POLICY "meal_reg_update_policy" ON public.meal_registrations
  FOR UPDATE TO authenticated
  USING (
    (select public.is_approved_member())
    AND ((select public.can_manage_attendance()) OR public.owns_meal_family_key(family_group_id))
  )
  WITH CHECK (
    (select public.is_approved_member())
    AND ((select public.can_manage_attendance()) OR public.owns_meal_family_key(family_group_id))
  );

CREATE POLICY "meal_reg_delete_policy" ON public.meal_registrations
  FOR DELETE TO authenticated
  USING (
    (select public.is_approved_member())
    AND ((select public.can_manage_attendance()) OR public.owns_meal_family_key(family_group_id))
  );


-- ═══════════════════════════════════════════════════════════════
-- 5. 식권 · 메뉴 읽기
-- ═══════════════════════════════════════════════════════════════

ALTER POLICY "coupons_select_policy" ON public.meal_coupons
  USING ((select public.is_approved_member()));

ALTER POLICY "history_select_policy" ON public.meal_coupon_history
  USING ((select public.is_approved_member()));

ALTER POLICY "meal_menus_select_policy" ON public.meal_menus
  USING ((select public.is_approved_member()));


-- ═══════════════════════════════════════════════════════════════
-- 6. 관리자 전용 칸 보호 — keep_app_access / previous_role 추가
--    (나머지는 운영 중인 함수 그대로입니다)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.id = auth.uid() AND OLD.role = 'REJECTED' AND NEW.role = 'PENDING' THEN
    NEW.labri_id        := OLD.labri_id;
    NEW.duty            := OLD.duty;
    NEW.family_group_id := OLD.family_group_id;
    NEW.family_role     := OLD.family_role;
    NEW.teach_group     := OLD.teach_group;
    NEW.keep_app_access := OLD.keep_app_access;
    NEW.previous_role   := OLD.previous_role;
    RETURN NEW;
  END IF;

  NEW.role            := OLD.role;
  NEW.labri_id        := OLD.labri_id;
  NEW.duty            := OLD.duty;
  NEW.family_group_id := OLD.family_group_id;
  NEW.family_role     := OLD.family_role;
  NEW.teach_group     := OLD.teach_group;
  NEW.keep_app_access := OLD.keep_app_access;
  NEW.previous_role   := OLD.previous_role;
  RETURN NEW;
END;
$function$;
