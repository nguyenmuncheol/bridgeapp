-- ─────────────────────────────────────────────────────────────────────────────
-- RLS 정책 통합 및 의도 명시
--
-- 같은 테이블·같은 동작에 허용(permissive) 정책이 두세 개씩 겹쳐 있었습니다.
-- 허용 정책은 OR 로 합쳐지므로 **가장 느슨한 것이 실제 규칙**이 됩니다. 지금까지는
-- 우연히 맞게 동작했지만, 나중에 권한을 조일 때 "분명 고쳤는데 안 막힌다"가 나오는
-- 전형적인 자리라 동작을 그대로 둔 채 하나로 합칩니다.
--
-- ⚠️ 이 마이그레이션은 **접근 권한을 바꾸지 않습니다.** 합치기 전후의 실효 권한이
--    같도록 OR 를 그대로 식에 옮겨 적었습니다. 각 테이블 위에 근거를 적어 두었습니다.
--
-- 덧붙여, 다시 쓰는 김에 정책 안의 auth.uid() 를 (select auth.uid()) 로 바꿉니다.
-- 그냥 두면 Postgres 가 **행마다** 이 함수를 다시 부르고, select 로 감싸면 한 번만
-- 계산해 재사용합니다. 의미는 완전히 같고 성능 경고 29건이 함께 사라집니다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════
-- 1. profiles
--    SELECT  : "Profiles viewable" 와 profiles_select_policy 가 식까지 완전히 동일 → 하나로
--    INSERT  : (auth.uid() = id)  OR  is_admin()            ← 두 정책의 OR 를 그대로
--    UPDATE  : (auth.uid() = id)  OR  is_admin()  OR  같은 가족
--              ("본인 프로필만 수정 가능" 은 profiles_update_policy 에 이미 포함된 부분집합)
--    DELETE  : 원래 하나뿐 → 손대지 않음
--
--    UPDATE 정책들에는 WITH CHECK 이 없었습니다. WITH CHECK 을 생략하면 Postgres 가
--    USING 식을 검사에도 그대로 쓰므로, 합친 정책에도 같은 식을 명시해 동작을 맞춥니다.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Profiles viewable"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy"   ON public.profiles;
DROP POLICY IF EXISTS "본인 프로필만 수정 가능"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_family_update"   ON public.profiles;

-- 로그인한 사람은 전체 명단을 봅니다(주소록이 이걸로 동작합니다).
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- 본인 가입 시점의 자기 행, 또는 관리자가 미가입 성도를 넣는 경우.
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = id
    OR public.is_admin()
  );

-- 본인 / 관리자 / 같은 가족(가족현황을 서로 채워 주기 위해).
-- 역할·라브리 같은 민감 항목은 protect_sensitive_profile_fields 트리거가 따로 막습니다.
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    (select auth.uid()) = id
    OR public.is_admin()
    OR (
      family_group_id IS NOT NULL
      AND family_group_id = (SELECT p.family_group_id FROM public.profiles p WHERE p.id = (select auth.uid()))
    )
  )
  WITH CHECK (
    (select auth.uid()) = id
    OR public.is_admin()
    OR (
      family_group_id IS NOT NULL
      AND family_group_id = (SELECT p.family_group_id FROM public.profiles p WHERE p.id = (select auth.uid()))
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- 2. meal_registrations
--    "Meal registrations policy" 가 cmd=ALL 이라 SELECT/INSERT/UPDATE/DELETE 를 전부
--    덮고 있었고, 조건도 나머지 세 정책과 똑같은 (auth.uid() IS NOT NULL) 이었습니다.
--    → 셋은 지우고 ALL 하나만 남깁니다. 실효 권한 변화 없음.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Meal registrations policy" ON public.meal_registrations;
DROP POLICY IF EXISTS "meal_reg_select_policy"    ON public.meal_registrations;
DROP POLICY IF EXISTS "meal_reg_insert_policy"    ON public.meal_registrations;
DROP POLICY IF EXISTS "meal_reg_update_policy"    ON public.meal_registrations;

-- 로그인한 사람은 가족 식사 신청을 보고 쓸 수 있습니다(가족끼리 대신 신청하는 구조).
CREATE POLICY "meal_reg_all_policy" ON public.meal_registrations
  FOR ALL TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);


-- ═══════════════════════════════════════════════════════════════
-- 3. meal_coupons / meal_coupon_history
--    여기는 중복이 아니라 **역할이 다른 두 정책이 SELECT 에서만 겹친** 경우입니다.
--      · *_all_policy   : ALL,    is_leader_or_admin()      ← 읽기까지 같이 덮음
--      · *_select_policy: SELECT, auth.uid() IS NOT NULL
--    실효: 읽기는 로그인한 모두, 쓰기는 리더·관리자.
--    → ALL 을 INSERT/UPDATE/DELETE 로 쪼개면 SELECT 에 정책이 하나만 남습니다.
--      실효 권한은 그대로입니다.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "coupons_all_policy"    ON public.meal_coupons;
DROP POLICY IF EXISTS "coupons_select_policy" ON public.meal_coupons;

CREATE POLICY "coupons_select_policy" ON public.meal_coupons
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "coupons_insert_policy" ON public.meal_coupons
  FOR INSERT TO authenticated WITH CHECK (public.is_leader_or_admin());

CREATE POLICY "coupons_update_policy" ON public.meal_coupons
  FOR UPDATE TO authenticated
  USING (public.is_leader_or_admin()) WITH CHECK (public.is_leader_or_admin());

CREATE POLICY "coupons_delete_policy" ON public.meal_coupons
  FOR DELETE TO authenticated USING (public.is_leader_or_admin());


DROP POLICY IF EXISTS "history_all_policy"    ON public.meal_coupon_history;
DROP POLICY IF EXISTS "history_select_policy" ON public.meal_coupon_history;

CREATE POLICY "history_select_policy" ON public.meal_coupon_history
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "history_insert_policy" ON public.meal_coupon_history
  FOR INSERT TO authenticated WITH CHECK (public.is_leader_or_admin());

CREATE POLICY "history_update_policy" ON public.meal_coupon_history
  FOR UPDATE TO authenticated
  USING (public.is_leader_or_admin()) WITH CHECK (public.is_leader_or_admin());

CREATE POLICY "history_delete_policy" ON public.meal_coupon_history
  FOR DELETE TO authenticated USING (public.is_leader_or_admin());


-- ═══════════════════════════════════════════════════════════════
-- 4. bulletins / church_events / event_forms
--    위와 같은 형태입니다(ALL=관리자 + SELECT=전체 공개).
--    ⚠️ 비로그인 공개는 전도·검색 노출을 위해 **의도한 설정**이므로 그대로 둡니다.
--       ALL 만 쓰기 동작으로 쪼개서 SELECT 의 정책 중복을 없앱니다.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "bulletins_admin"  ON public.bulletins;
DROP POLICY IF EXISTS "bulletins_select" ON public.bulletins;

-- 누구나(비로그인 포함) 주보를 봅니다 — 의도된 공개.
CREATE POLICY "bulletins_select_policy" ON public.bulletins
  FOR SELECT USING (true);
CREATE POLICY "bulletins_insert_policy" ON public.bulletins
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "bulletins_update_policy" ON public.bulletins
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bulletins_delete_policy" ON public.bulletins
  FOR DELETE TO authenticated USING (public.is_admin());


DROP POLICY IF EXISTS "events_admin"  ON public.church_events;
DROP POLICY IF EXISTS "events_select" ON public.church_events;

CREATE POLICY "events_select_policy" ON public.church_events
  FOR SELECT USING (true);
CREATE POLICY "events_insert_policy" ON public.church_events
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "events_update_policy" ON public.church_events
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "events_delete_policy" ON public.church_events
  FOR DELETE TO authenticated USING (public.is_admin());


DROP POLICY IF EXISTS "event_forms_admin"  ON public.event_forms;
DROP POLICY IF EXISTS "event_forms_select" ON public.event_forms;

CREATE POLICY "event_forms_select_policy" ON public.event_forms
  FOR SELECT USING (true);
CREATE POLICY "event_forms_insert_policy" ON public.event_forms
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "event_forms_update_policy" ON public.event_forms
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "event_forms_delete_policy" ON public.event_forms
  FOR DELETE TO authenticated USING (public.is_admin());


-- ═══════════════════════════════════════════════════════════════
-- 5. push_jobs / push_digest_state — "정책 없음"을 "일부러 닫아둠"으로
--
--    두 테이블은 RLS 가 켜져 있는데 정책이 하나도 없었습니다. 결과적으로는 안전한 쪽으로
--    닫혀 있지만(정책이 없으면 전부 거부), 그게 의도인지 빠뜨린 건지 코드만 봐서는
--    알 수 없었습니다. 몇 달 뒤에 보면 헷갈릴 자리입니다.
--    → 아무에게도 열지 않는 정책을 명시해 의도를 남깁니다. service_role 과 postgres 는
--      RLS 자체를 우회하므로 Edge Function 과 cron 의 동작은 달라지지 않습니다.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "push_jobs_no_client_access" ON public.push_jobs;
CREATE POLICY "push_jobs_no_client_access" ON public.push_jobs
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "push_digest_state_no_client_access" ON public.push_digest_state;
CREATE POLICY "push_digest_state_no_client_access" ON public.push_digest_state
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE public.push_jobs IS
  '푸시 발송 큐. send-push Edge Function(service_role)만 접근합니다. 클라이언트 접근은 정책으로 명시적으로 막혀 있습니다.';
COMMENT ON TABLE public.push_digest_state IS
  '댓글/좋아요 묶음 알림의 마지막 발송 지점. cron(postgres)만 갱신합니다. 클라이언트 접근은 정책으로 명시적으로 막혀 있습니다.';
