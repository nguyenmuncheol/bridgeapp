-- ─────────────────────────────────────────────────────────────────────────────
-- 부부 계정 간 자녀 목록 동기화 + 출석 대상 자녀 판정 규칙 통일
--
-- 문제: 자녀는 부모 각자의 profiles.family_info(JSON) 안에 복사본으로 들어 있습니다.
-- 한쪽만 저장되면(저장 실패 등) 같은 자녀의 부서 값이 부부 사이에 달라지고,
-- 화면(출석 명단)은 한쪽 값을, 서버(출석 미완료 알림)는 다른 쪽 값을 읽어
-- "명단엔 없는데 미체크 1명 알림"이 왔습니다(정현우 사례).
--
-- 1) 트리거: 한쪽의 자녀 목록이 바뀌면 같은 family_group_id의 다른 계정에도 같은 목록을 씁니다.
--    (메모·배우자 이름·주소 보완요청은 각자 그대로 둡니다.)
-- 2) assigned_children(): 같은 자녀 id의 값이 다르면 한 값으로 정합니다.
--    ⚠️ 화면의 buildAllDependentEntries(src/lib/familyInfo.ts)와 같은 규칙이어야 합니다:
--       ① 어느 한쪽이라도 '출석 미적용'이면 미적용  ② 아니면 부서가 있는 값 중 계정 id가 가장 작은 쪽
--    탈퇴(LEFT) 등 대상 등급이 아닌 계정의 값은 보지 않습니다(기존과 동일).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_family_children()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new jsonb;
  v_old jsonb;
BEGIN
  -- 이 트리거가 일으킨 업데이트(배우자 쪽)에서는 다시 전파하지 않습니다.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF COALESCE(NEW.family_group_id, '') = '' THEN RETURN NEW; END IF;

  v_new := CASE WHEN COALESCE(NEW.family_info, '') ~ '^\s*\{' THEN NEW.family_info::jsonb -> 'children' END;
  v_old := CASE WHEN COALESCE(OLD.family_info, '') ~ '^\s*\{' THEN OLD.family_info::jsonb -> 'children' END;
  IF v_new IS NULL OR jsonb_typeof(v_new) <> 'array' THEN RETURN NEW; END IF;
  -- 자녀 목록이 실제로 바뀐 저장만 전파합니다(주소 보완요청 토글 등은 제외).
  IF v_new IS NOT DISTINCT FROM COALESCE(v_old, '[]'::jsonb) THEN RETURN NEW; END IF;

  UPDATE public.profiles p
     SET family_info = jsonb_set(
           CASE
             WHEN COALESCE(p.family_info, '') ~ '^\s*\{' THEN p.family_info::jsonb
             ELSE jsonb_build_object('note', COALESCE(p.family_info, ''), 'spouseName', '', 'addressRequestedAt', '')
           END,
           '{children}', v_new)::text
   WHERE p.family_group_id = NEW.family_group_id
     AND p.id <> NEW.id
     AND (CASE WHEN COALESCE(p.family_info, '') ~ '^\s*\{' THEN p.family_info::jsonb -> 'children' END)
         IS DISTINCT FROM v_new;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_family_children ON public.profiles;
CREATE TRIGGER trg_sync_family_children
  AFTER UPDATE OF family_info ON public.profiles
  FOR EACH ROW
  WHEN (OLD.family_info IS DISTINCT FROM NEW.family_info)
  EXECUTE FUNCTION public.sync_family_children();

REVOKE EXECUTE ON FUNCTION public.sync_family_children() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assigned_children()
 RETURNS TABLE(dependent_id text, child_name text, family_group_id text, labri_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH kids AS (
    SELECT c->>'id'                   AS id,
           c->>'name'                 AS name,
           p.family_group_id          AS fgid,
           COALESCE(c->>'labriId','') AS labri,
           p.id::text                 AS owner
      FROM public.profiles p,
           LATERAL jsonb_array_elements(
             COALESCE(
               CASE WHEN COALESCE(p.family_info,'') ~ '^\s*\{' THEN (p.family_info::jsonb -> 'children') END,
               '[]'::jsonb)
           ) AS c
     WHERE p.role IN ('MEMBER','LEADER','ADMIN','TEACHER')
       AND COALESCE(c->>'name','') <> ''
  )
  SELECT DISTINCT ON (k.id)
         k.id, k.name, k.fgid, k.labri
    FROM kids k
   WHERE k.labri <> ''
     AND k.labri <> '출석 미적용'
     -- 다른 계정에 같은 자녀가 '출석 미적용'으로 저장돼 있으면 미적용이 우선
     AND NOT EXISTS (SELECT 1 FROM kids x WHERE x.id = k.id AND x.labri = '출석 미적용')
   ORDER BY k.id, k.owner COLLATE "C"
$function$;
