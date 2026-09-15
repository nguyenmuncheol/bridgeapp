#!/usr/bin/env node
/**
 * 참조되지 않는 저장소 파일 정리 (일회성)
 *
 * 왜 필요한가:
 * 예전에 storage.objects 에 DELETE 정책이 없어서, 사진 글을 지울 때 파일 삭제가 조용히
 * 실패했습니다. 확인창은 "사진 파일도 함께 삭제됩니다"라고 안내했지만 실제로는 남아서,
 * 주소만 알면 계속 열 수 있었습니다. 정책은 고쳤지만(20260915190000) 그동안 쌓인
 * 파일은 남아 있어 한 번 치워야 합니다.
 *
 * 왜 SQL 로 못 지우나:
 * Supabase 가 storage 테이블 직접 삭제를 막아 뒀습니다. 행만 지우면 실제 파일이 S3 에
 * 고아로 남기 때문입니다. 반드시 Storage API 를 거쳐야 합니다.
 *
 * ── 실행 방법 ──────────────────────────────────────────────────────────────
 * 1) Supabase 대시보드 > Project Settings > API 에서 service_role 키를 복사합니다.
 *    (이 키는 모든 권한을 가지므로 코드나 저장소에 넣지 마세요. 아래처럼 한 번만 씁니다.)
 *
 * 2) 먼저 무엇이 지워질지만 확인합니다(기본값: 실제로 지우지 않음):
 *      SUPABASE_SERVICE_ROLE_KEY=<키> node scripts/cleanup-orphan-files.mjs
 *
 * 3) 목록이 맞으면 실제로 지웁니다:
 *      SUPABASE_SERVICE_ROLE_KEY=<키> node scripts/cleanup-orphan-files.mjs --apply
 * ───────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://isbwfpokewammwiicxqr.supabase.co'
const BUCKET = 'church-assets'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. 파일 상단의 실행 방법을 참고하세요.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

/** 버킷 안 모든 파일 경로를 모읍니다(폴더별로 나눠 담겨 있습니다). */
async function listAllFiles() {
  const out = []
  const { data: roots, error } = await db.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw error
  for (const entry of roots || []) {
    // id 가 없으면 폴더입니다.
    if (entry.id) { out.push(entry.name); continue }
    const { data: inner, error: e2 } = await db.storage.from(BUCKET).list(entry.name, { limit: 1000 })
    if (e2) throw e2
    for (const f of inner || []) out.push(`${entry.name}/${f.name}`)
  }
  return out
}

/**
 * 파일 주소가 등장할 수 있는 모든 곳을 한 덩어리 텍스트로 모읍니다.
 * 컬럼을 하나라도 빠뜨리면 **살아 있는 파일을 지우게 되므로** 넉넉히 훑습니다.
 * (실제로 profiles.family_info 안의 자녀 프로필 사진이 여기 걸려 살아남았습니다)
 */
async function collectReferencedText() {
  const chunks = []
  const push = (rows, ...cols) => {
    for (const r of rows || []) {
      for (const c of cols) {
        const v = r[c]
        if (!v) continue
        chunks.push(Array.isArray(v) ? v.join(' ') : String(v))
      }
    }
  }

  const grab = async (table, cols) => {
    const { data, error } = await db.from(table).select(cols.join(','))
    if (error) throw new Error(`${table}: ${error.message}`)
    push(data, ...cols)
  }

  await grab('posts', ['image_urls', 'content'])
  await grab('bulletins', ['image_urls', 'summary'])
  await grab('profiles', ['avatar_url', 'family_info'])
  await grab('event_forms', ['content', 'url'])
  await grab('post_comments', ['content'])

  return chunks.join(' ')
}

// 코드에 직접 박혀 있어 DB 검사로는 안 잡히는 파일들.
// 🐛 이걸 빠뜨렸다가 하마터면 식사쿠폰 구매 안내 이미지를 지울 뻔했습니다.
const KEEP_ALWAYS = new Set([
  'photos/meal_account.jpg', // CouponsTab 의 MEAL_QR_IMAGE_URL
])

const files = await listAllFiles()
const referenced = await collectReferencedText()

const orphans = files.filter(name => !KEEP_ALWAYS.has(name) && !referenced.includes(name))

console.log(`전체 파일        ${files.length}개`)
console.log(`코드에서 직접 참조 ${KEEP_ALWAYS.size}개 (항상 보존)`)
console.log(`지울 대상        ${orphans.length}개\n`)
orphans.forEach(n => console.log('  ' + n))

if (!orphans.length) {
  console.log('\n정리할 파일이 없습니다.')
  process.exit(0)
}

if (!APPLY) {
  console.log('\n확인만 했습니다. 실제로 지우려면 --apply 를 붙여 다시 실행하세요.')
  process.exit(0)
}

const { error } = await db.storage.from(BUCKET).remove(orphans)
if (error) {
  console.error('\n삭제 실패:', error.message)
  process.exit(1)
}
console.log(`\n${orphans.length}개를 지웠습니다.`)
