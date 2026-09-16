-- 주보를 "스캔 이미지 묶음"에서 "구조화된 본문"으로 확장합니다.
--
-- 지금까지 주보는 image_urls 에 담긴 사진 2~4장이 전부였습니다. 목사님이 외부에서
-- 주보를 만들어 사진으로 찍어 올리는 방식입니다. 앞으로는 앱 안에서 직접 주보를
-- 작성하고, 같은 데이터로 (1) 성도용 웹 화면과 (2) A4 양면 인쇄본을 함께 만듭니다.
--
-- ── 왜 테이블을 쪼개지 않는가 ──────────────────────────────────────────
-- 예배순서·교회소식·성경절·섬김표는 모두 "개수가 정해지지 않은 목록"입니다.
-- 정규화하면 테이블이 6~7개로 늘고 sort_order 관리와 조인이 따라붙는데,
-- 주보는 주 1건이고 읽을 때는 언제나 통째로 읽습니다. 쪼개서 얻는 것이 없습니다.
-- → 본문 전체를 jsonb 한 칸(content)에 담습니다.
--
-- ── 기존 칼럼은 왜 그대로 두는가 ───────────────────────────────────────
-- title / preacher / passage / date_str 은 notify_bulletin() 트리거와 홈 화면
-- 미리보기가 이미 읽고 있습니다. 저장할 때 content 에서 뽑아 이 칼럼들에도 함께
-- 써 주면 알림·미리보기가 하나도 깨지지 않습니다.
-- image_urls 도 남겨 둡니다. 과거 스캔 주보가 그대로 보존되고, 앞으로도
-- 특별판처럼 외부에서 만든 주보는 이미지로 올릴 수 있습니다.

ALTER TABLE public.bulletins
  ADD COLUMN IF NOT EXISTS content jsonb,
  ADD COLUMN IF NOT EXISTS status  text NOT NULL DEFAULT 'published';

COMMENT ON COLUMN public.bulletins.content IS
  '구조화된 주보 본문 전체(예배순서·소식·성경말씀·섬김표·공지 등). BulletinContent 타입과 1:1.';

COMMENT ON COLUMN public.bulletins.status IS
  'draft = 작성 중(성도에게 안 보이고 알림도 안 감) / published = 발행됨';

-- status 는 두 값만 허용합니다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bulletins_status_check'
  ) THEN
    ALTER TABLE public.bulletins
      ADD CONSTRAINT bulletins_status_check CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

-- 기존 행은 모두 이미 성도에게 보이던 주보이므로 published 로 둡니다
-- (칼럼 기본값이 published 라 별도 UPDATE 는 필요 없지만, 명시적으로 남겨 둡니다).
UPDATE public.bulletins SET status = 'published' WHERE status IS NULL;

-- 인쇄 화면이 '?date=YYYY-MM-DD' 로 한 건을 바로 찾습니다.
-- date_str 에 UNIQUE 제약이 이미 있으면 그 인덱스를 쓰므로 중복 생성되지 않습니다.
CREATE INDEX IF NOT EXISTS bulletins_date_str_idx ON public.bulletins (date_str);

-- ── 알림 트리거도 함께 고칩니다 ────────────────────────────────────────
-- 관리자 주보 탭에는 [임시저장] 이 있습니다. 그런데 임시저장도 title 을 함께
-- 기록하므로, 트리거를 그대로 두면 **작성 중인 주보가 금/토 20시에 전 성도에게
-- 발송**됩니다. 그래서 두 조건을 추가합니다.
--   1) status = 'published' 인 것만 보냅니다 (임시저장은 건너뜁니다).
--   2) content 가 채워진 주보도 "내용 있음" 으로 인정합니다
--      (앱에서 작성한 주보는 이미지가 0장이라 기존 조건만으로는 걸러졌습니다).

CREATE OR REPLACE FUNCTION public.notify_bulletin()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b     record;
  v_count int := 0;
BEGIN
  SELECT * INTO v_b
    FROM public.bulletins
   WHERE notified_at IS NULL
     AND date_str ~ '^\d{4}-\d{2}-\d{2}$'
     AND date_str::date >= public.vn_today() - 7
     -- 작성 중(임시저장)인 주보는 보내지 않습니다
     AND COALESCE(status, 'published') = 'published'
     -- 내용이 하나라도 있어야 발송합니다 (빈 껍데기 줄 제외)
     AND (
          COALESCE(array_length(image_urls, 1), 0) > 0
       OR content IS NOT NULL
       OR COALESCE(btrim(title), '')    <> ''
       OR COALESCE(btrim(passage), '')  <> ''
       OR COALESCE(btrim(preacher), '') <> ''
       OR COALESCE(btrim(summary), '')  <> ''
     )
   ORDER BY date_str DESC
   LIMIT 1;

  IF v_b.id IS NULL THEN RETURN -1; END IF;   -- 보낼 주보 없음

  INSERT INTO public.notifications (user_id, type, title, body, actor_name)
  SELECT pr.id, 'BULLETIN',
         '📖 새 주보가 올라왔습니다',
         COALESCE(NULLIF(v_b.title,''), v_b.date_str)
           || CASE WHEN COALESCE(v_b.passage,'') <> '' THEN ' · ' || v_b.passage ELSE '' END,
         '더브릿지교회'
    FROM public.profiles pr
   WHERE pr.role IN ('MEMBER','LEADER','ADMIN','TEACHER');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.bulletins SET notified_at = now() WHERE id = v_b.id;
  RETURN v_count;
END; $function$;
