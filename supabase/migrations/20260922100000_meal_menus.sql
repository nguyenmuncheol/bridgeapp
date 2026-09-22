-- 주일 식사 신청 화면에 "이번 주 메뉴" 한 줄 안내를 추가합니다.
--
-- meal_registrations 와 마찬가지로 date_str('YYYY-MM-DD') 을 기준으로 주차별
-- 메뉴를 저장합니다. 신청자는 누구나 보고, 입력/수정은 리더·관리자만 합니다
-- (meal_coupons 와 같은 "읽기=로그인 전체 / 쓰기=리더·관리자" 형태).

CREATE TABLE IF NOT EXISTS public.meal_menus (
  date_str   text PRIMARY KEY,
  menu       text NOT NULL DEFAULT '',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meal_menus IS '주일 식사 신청 화면에 보여줄 주차별 메뉴 한 줄 안내';

ALTER TABLE public.meal_menus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_menus_select_policy" ON public.meal_menus
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "meal_menus_insert_policy" ON public.meal_menus
  FOR INSERT TO authenticated WITH CHECK (public.is_leader_or_admin());

CREATE POLICY "meal_menus_update_policy" ON public.meal_menus
  FOR UPDATE TO authenticated
  USING (public.is_leader_or_admin()) WITH CHECK (public.is_leader_or_admin());

CREATE POLICY "meal_menus_delete_policy" ON public.meal_menus
  FOR DELETE TO authenticated USING (public.is_leader_or_admin());
