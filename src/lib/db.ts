import { supabase } from './supabase'
import { UserProfile, PostItem, Role, MealCouponAccount } from './mockData'
import { invalidateCache } from './dataCache'
import { toLocalDateStr, bulletinDateToSortable } from './dateUtils'

// ────────────────────────────────────────────────────────────────
// 조회 실패 처리 원칙
//
// 🐛 과거 버그: 모든 조회 함수가 오류를 조용히 삼키고 빈 배열([])을 돌려줬습니다.
// 그래서 네트워크/권한 문제로 조회에 실패해도 화면에는 "승인 대기자 없음",
// "식사 신청자 없음", "잔여 0장" 처럼 **정상적인 빈 상태**로 보였고,
// 관리자가 그걸 사실로 믿고 판단을 내리는 위험이 있었습니다.
//
// → 이제 조회 함수는 실패하면 예외를 던집니다. useCachedQuery가 이를 받아
//   error 로 노출하고, 화면은 "불러오지 못했습니다 · 다시 시도"를 보여줍니다.
//   (빈 상태와 실패 상태를 반드시 구분해서 보여줘야 합니다.)
// ────────────────────────────────────────────────────────────────
function throwIfFetchFailed(error: any, what: string): void {
  if (error) {
    throw new Error(`[${what}] 데이터를 불러오지 못했습니다: ${error.message || error}`)
  }
}

// ==========================================
// 1. 성도 프로필 (profiles)
// ==========================================
export async function dbFetchProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  throwIfFetchFailed(error, '성도 명단')
  if (!data) return []
  return data.map((d: any) => ({
    id: d.id,
    name: d.name || '',
    email: d.email || '',
    phone: d.phone || '',
    address: d.address || '',
    role: (d.role || 'PENDING') as Role,
    labriId: d.labri_id,
    duty: d.duty || '',
    familyGroupId: d.family_group_id,
    familyRole: d.family_role,
    familyInfo: d.family_info,
    birthday: d.birthday,
    avatarUrl: d.avatar_url,
    createdAt: toLocalDateStr(d.created_at)
  }))
}

export async function dbUpdateProfile(userId: string, updates: Partial<{
  name: string
  phone: string
  address: string
  birthday: string
  avatarUrl: string
  labriId: string
  duty: string
  familyInfo: string
  familyRole: string
  role: Role
  familyGroupId: string
}>) {
  const payload: any = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.phone !== undefined) payload.phone = updates.phone
  if (updates.address !== undefined) payload.address = updates.address
  if (updates.birthday !== undefined) payload.birthday = updates.birthday
  if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl
  if (updates.labriId !== undefined) payload.labri_id = updates.labriId
  if (updates.duty !== undefined) payload.duty = updates.duty
  if (updates.familyInfo !== undefined) payload.family_info = updates.familyInfo
  if (updates.familyRole !== undefined) payload.family_role = updates.familyRole || null
  if (updates.role !== undefined) payload.role = updates.role
  if (updates.familyGroupId !== undefined) payload.family_group_id = updates.familyGroupId ? updates.familyGroupId : null

  const res = await supabase.from('profiles').update(payload).eq('id', userId)
  if (!res.error) invalidateCache('profiles', { exact: true })
  return res
}

/**
 * 내 승인 상태(등급)만 가볍게 확인합니다.
 * 승인 대기 화면에서 몇 초마다 호출하므로, 성도 전체 명단이 아니라 내 한 줄만 읽습니다.
 * 조회에 실패하면 null 을 돌려주고, 화면은 다음 차례에 다시 시도합니다.
 */
export async function dbFetchMyRole(userId: string): Promise<Role | null> {
  if (!userId || userId === 'guest') return null
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return (data.role || null) as Role | null
}

export async function dbApproveUser(userId: string, labriId: string, role: Role, duty: string, familyInfo: string, familyGroupId?: string, familyRole?: string) {
  const payload: any = {
    role,
    labri_id: labriId,
    duty,
    family_info: familyInfo,
    family_group_id: familyGroupId ? familyGroupId : null,
    family_role: familyRole || null
  }
  const res = await supabase.from('profiles').update(payload).eq('id', userId)
  if (!res.error) invalidateCache('profiles', { exact: true })
  return res
}

/**
 * 가입 거절.
 *
 * 🐛 과거 버그: profiles 행을 완전히 삭제(delete)했습니다. 그런데 로그인 계정 자체는
 * 남아있고, app/page.tsx는 "로그인은 했는데 프로필이 없는 사람"을 보면 PENDING 프로필을
 * 새로 만들어 줍니다. 결국 거절당한 분이 앱을 다시 열면 빈 프로필로 승인 대기 목록에
 * 다시 올라오고, 관리자는 같은 사람을 무한히 거절하게 됩니다.
 * (게다가 삭제는 되돌릴 수 없어서 그분이 입력한 연락처/주소가 그대로 사라졌습니다.)
 *
 * → 이제 role을 'REJECTED'로 바꿉니다. 목록에서는 안 보이지만 기록은 남고,
 *   다시 승인하고 싶으면 role만 되돌리면 됩니다.
 */
export async function dbRejectUser(userId: string) {
  const res = await supabase.from('profiles').update({ role: 'REJECTED' }).eq('id', userId)

  // ⚠️ profiles.role이 Postgres ENUM이거나 CHECK 제약이 걸려 있으면 'REJECTED'가 거부됩니다.
  // (기존 값: PENDING/MEMBER/LEADER/ADMIN/COUPON) 그 경우 관리자가 아무것도 못 하게 되므로,
  // 실패하면 "무엇을 해야 하는지" 알 수 있는 메시지로 바꿔서 돌려줍니다.
  // → SQL 파일의 【0단계】를 실행하면 'REJECTED'가 허용되고 이 경로는 사라집니다.
  if (res.error) {
    const msg = String(res.error.message || '')
    const looksLikeConstraint =
      msg.includes('invalid input value for enum') ||
      msg.includes('violates check constraint') ||
      msg.includes('_role_check')
    if (looksLikeConstraint) {
      return {
        ...res,
        error: {
          ...res.error,
          message: "가입 거절을 저장하지 못했습니다. Supabase에서 'REJECTED' 상태를 아직 허용하지 않습니다. (supabase_설정.sql 0단계를 먼저 실행해 주세요)"
        }
      }
    }
    return res
  }

  invalidateCache('profiles', { exact: true })
  return res
}

/**
 * 거절된 계정을 다시 "승인 대기(PENDING)" 상태로 되돌립니다.
 *
 * 두 곳에서 사용합니다.
 *  ① 거절당한 성도가 본인 화면에서 "다시 가입 신청하기"를 누를 때
 *  ② 관리자가 거절 목록에서 "승인 대기로 되돌리기"를 누를 때 (실수로 거절한 경우)
 *
 * 거절이 소프트 삭제(role='REJECTED')로 바뀌면서, 이 함수가 없으면 거절당한 분은
 * 영영 다시 신청할 수 없고 관리자 목록에도 안 보여서 복구가 불가능해집니다.
 */
export async function dbReapplyUser(userId: string) {
  const res = await supabase.from('profiles').update({ role: 'PENDING' }).eq('id', userId)
  if (!res.error) invalidateCache('profiles', { exact: true })
  return res
}

// ==========================================
// 2. 주보 (bulletins)
// ==========================================
export interface BulletinData {
  id?: string
  date: string
  title: string
  preacher: string
  passage: string
  summary: string
  imageUrls: string[]
}

/**
 * 가장 최근 주보 1건.
 *
 * 🐛 과거 버그: `.order('date_str', desc).limit(1)` 로 최신 주보를 골랐는데,
 * date_str에 "8/17(일)" 같은 표시용 문자열이 저장돼 있었습니다. 문자 정렬은
 * "9/28(일)" > "12/7(일)" > "10/5(일)" 순이라, **10월이 되면 홈 화면이 9월 주보에서
 * 멈추고 다음 해 9월까지 그대로**였습니다. 목사님 화면에는 저장 직후 바뀐 게 보이니
 * (로컬 상태만 갱신) 새로고침 전까지 알아챌 수도 없었습니다.
 *
 * → 이제 최근 행 몇 개를 받아와서 날짜를 정규화한 뒤 코드에서 직접 비교합니다.
 *   'YYYY-MM-DD'(신형)와 "8/17(일)"(구형)이 섞여 있어도 올바르게 최신을 고릅니다.
 *   같은 날짜 행이 여러 개면 가장 최근에 수정된 것을 씁니다.
 */
export async function dbFetchLatestBulletin(): Promise<BulletinData | null> {
  const { data, error } = await supabase
    .from('bulletins')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50)
  throwIfFetchFailed(error, '주보')
  if (!data || data.length === 0) return null

  // updated_at 내림차순으로 이미 정렬돼 있으므로, 날짜가 같으면 먼저 나온 행(더 최근 수정)이 이깁니다.
  let best: any = null
  let bestKey = ''
  for (const row of data) {
    const key = bulletinDateToSortable(row.date_str)
    if (!key) continue
    if (key > bestKey) {
      bestKey = key
      best = row
    }
  }
  if (!best) best = data[0]

  return {
    id: best.id,
    date: best.date_str,
    title: best.title,
    preacher: best.preacher,
    passage: best.passage,
    summary: best.summary || '',
    imageUrls: best.image_urls || []
  }
}

/**
 * 주보 저장.
 *
 * 🐛 과거 버그: id도 onConflict도 없이 upsert를 호출해서, 저장할 때마다 **새 행이 계속
 * 추가**됐습니다. 오타를 세 번 고치면 같은 날짜 주보가 4개 쌓입니다.
 * → date_str 기준으로 덮어쓰도록 onConflict를 지정합니다.
 *   (Supabase에서 bulletins.date_str에 UNIQUE 제약을 걸어야 동작합니다 — SQL 파일 참고.
 *    제약이 아직 없으면 실패하므로, 실패 시 기존 행 id로 update하는 경로를 함께 둡니다.)
 *
 * @param bulletin.date 'YYYY-MM-DD' 형식으로 넘겨주세요(화면 표시는 formatBulletinDisplay 사용).
 */
export async function dbUpsertBulletin(bulletin: BulletinData) {
  const payload = {
    date_str: bulletin.date,
    title: bulletin.title,
    preacher: bulletin.preacher,
    passage: bulletin.passage,
    summary: bulletin.summary,
    image_urls: bulletin.imageUrls,
    updated_at: new Date().toISOString()
  }

  let res = await supabase.from('bulletins').upsert(payload, { onConflict: 'date_str' })

  // UNIQUE 제약이 아직 없는 환경(SQL 미적용) 대비: 같은 날짜 행을 직접 찾아 update
  if (res.error) {
    const existing = await supabase.from('bulletins').select('id').eq('date_str', bulletin.date).limit(1)
    if (!existing.error && existing.data && existing.data.length > 0) {
      res = await supabase.from('bulletins').update(payload).eq('id', existing.data[0].id)
    } else if (bulletin.id) {
      res = await supabase.from('bulletins').update(payload).eq('id', bulletin.id)
    } else {
      res = await supabase.from('bulletins').insert(payload)
    }
  }

  if (!res.error) invalidateCache('bulletin:latest', { exact: true })
  return res
}

// ==========================================
// 3. 통합 게시판 (posts) & 댓글 (post_comments)
// ==========================================
// posts 테이블 한 행을 화면용 PostItem으로 변환하는 공용 매핑 함수.
// dbFetchPosts(전체 조회)와 dbFetchPostsPage(페이지 단위 조회)가 함께 재사용합니다.
function mapPostRow(d: any): PostItem {
  return {
    id: d.id,
    authorId: d.author_id,
    authorName: d.author_name || '익명',
    title: d.title,
    content: d.content,
    category: d.category,
    // toLocalDateStr: created_at는 세계표준시(UTC)라 .slice(0,10)로 자르면
    // 새벽에 쓴 글이 "어제" 날짜로 표시됩니다(한국 UTC+9 / 베트남 UTC+7).
    createdAt: toLocalDateStr(d.created_at),
    likes: d.likes || 0,
    likedUserIds: d.liked_user_ids || [],
    isSecret: d.is_secret,
    isCompleted: d.is_completed,
    isPinned: d.is_pinned,
    youtubeUrl: d.youtube_url,
    imageUrls: d.image_urls || [],
    tags: d.tags || [],
    // 댓글은 PostgREST가 순서를 보장하지 않으므로 작성순(오래된 것 → 최근)으로 직접 정렬합니다.
    // (정렬 후 날짜만 잘라야 하므로, 원본 타임스탬프로 정렬한 뒤 표시용으로 변환)
    comments: (d.post_comments || [])
      .slice()
      .sort((a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .map((c: any) => ({
        id: c.id,
        authorId: c.author_id,
        authorName: c.author_name,
        content: c.content,
        createdAt: toLocalDateStr(c.created_at)
      }))
  }
}

export async function dbFetchPosts(category?: string): Promise<PostItem[]> {
  let query = supabase.from('posts').select(`
    *,
    post_comments (*)
  `).order('created_at', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  throwIfFetchFailed(error, '게시글')
  if (!data) return []

  return data.map(mapPostRow)
}

export interface PostsPageResult {
  items: PostItem[]
  // 다음 페이지 요청 시 그대로 넘기면 되는 커서(마지막 글의 원본 created_at 타임스탬프).
  // 더 불러올 게 없으면 null.
  nextCursor: string | null
}

const POSTS_PAGE_SIZE = 20

/**
 * "더보기" 버튼용 페이지 단위 조회. dbFetchPosts처럼 카테고리 전체를 한 번에 불러오지 않고,
 * 최근 글부터 limit개씩 끊어서 불러옵니다. (게시글이 많이 쌓이는 화면의 초기 로딩 부담을 줄이기 위함)
 * cursor는 이전 페이지 마지막 글의 원본 created_at 값을 그대로 넘기면, 그보다 오래된 글만 가져옵니다.
 * 아직 이 함수를 실제 Supabase 프로젝트에 대고 테스트하지 못했으니, 화면에 연결한 뒤
 * "더보기"를 눌렀을 때 게시글이 정상적으로 이어지는지 꼭 한 번 확인해 주세요.
 */
export async function dbFetchPostsPage(
  category: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<PostsPageResult> {
  const limit = opts.limit ?? POSTS_PAGE_SIZE
  let query = supabase.from('posts').select(`
    *,
    post_comments (*)
  `)
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (opts.cursor) {
    query = query.lt('created_at', opts.cursor)
  }

  const { data, error } = await query
  throwIfFetchFailed(error, '게시글')
  if (!data) return { items: [], nextCursor: null }

  const items = data.map(mapPostRow)
  const lastRow: any = data[data.length - 1]
  // 이번에 받은 개수가 limit과 같으면 다음 페이지가 더 있을 가능성이 있다고 보고 커서를 내려줌
  const nextCursor = data.length === limit && lastRow?.created_at ? lastRow.created_at : null

  // 🐛 과거 버그: 고정(핀)된 기도제목이 최신 20개 밖으로 밀려나면 "더보기"를 누르기 전까지
  // 안 보였습니다. 고정글은 오래됐어도 항상 맨 위에 있어야 하므로, 첫 페이지에서는
  // 고정글만 따로 가볍게 조회해서 합칩니다. (고정글은 보통 한 자릿수라 부담이 없습니다.)
  if (!opts.cursor) {
    const pinnedRes = await supabase.from('posts').select(`
      *,
      post_comments (*)
    `)
      .eq('category', category)
      .eq('is_pinned', true)
      .order('created_at', { ascending: false })

    if (!pinnedRes.error && pinnedRes.data && pinnedRes.data.length > 0) {
      const alreadyLoaded = new Set(items.map(i => i.id))
      const missingPinned = pinnedRes.data
        .map(mapPostRow)
        .filter(p => !alreadyLoaded.has(p.id))
      if (missingPinned.length > 0) items.unshift(...missingPinned)
    }
  }

  return { items, nextCursor }
}

/**
 * 태그 필터 칩(예: 행사사진의 #부활절, #수련회)을 만들기 위한 용도.
 * dbFetchPostsPage로 목록을 페이지 단위로만 불러오면, 아직 안 불러온(더보기 전) 글의
 * 태그는 필터 목록에 안 뜨는 문제가 생깁니다. 그래서 태그만 따로, 가볍게 전체 조회합니다.
 * (사진/댓글 등 무거운 컬럼 없이 tags 컬럼만 가져오므로 dbFetchPosts보다 훨씬 가볍습니다.)
 */
export async function dbFetchDistinctTags(category: string): Promise<string[]> {
  const { data, error } = await supabase.from('posts').select('tags').eq('category', category)
  throwIfFetchFailed(error, '태그 목록')
  if (!data) return []
  const tagSet = new Set<string>()
  data.forEach((d: any) => {
    (d.tags || []).forEach((t: string) => {
      const clean = (t || '').trim()
      if (clean && clean !== '전체') tagSet.add(clean)
    })
  })
  return Array.from(tagSet)
}

export async function dbCreatePost(post: Partial<PostItem>) {
  const res = await supabase.from('posts').insert({
    author_id: post.authorId,
    author_name: post.authorName,
    title: post.title,
    content: post.content,
    category: post.category,
    youtube_url: post.youtubeUrl,
    image_urls: post.imageUrls || [],
    tags: post.tags || [],
    is_secret: post.isSecret || false,
    is_completed: post.isCompleted || false,
    is_pinned: post.isPinned || false,
    likes: 0,
    liked_user_ids: []
  }).select().single()
  if (!res.error) {
    invalidateCache('posts:')
    invalidateCache('postTags:')
  }
  return res
}

export async function dbUpdatePost(id: string, updates: Partial<PostItem>) {
  const payload: any = {}
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.content !== undefined) payload.content = updates.content
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted
  if (updates.isPinned !== undefined) payload.is_pinned = updates.isPinned
  if (updates.likes !== undefined) payload.likes = updates.likes
  if (updates.likedUserIds !== undefined) payload.liked_user_ids = updates.likedUserIds
  // 🐛 버그 수정: tags/isSecret가 누락되어 있어 행사사진 태그 수정(PhotoGallery)과
  // 기도제목 비밀글 토글(PrayerBoard)이 화면에는 반영되지만 DB에는 저장되지 않던 문제.
  if (updates.tags !== undefined) payload.tags = updates.tags
  if (updates.isSecret !== undefined) payload.is_secret = updates.isSecret
  const res = await supabase.from('posts').update(payload).eq('id', id)
  if (!res.error) {
    invalidateCache('posts:')
    if (updates.tags !== undefined) invalidateCache('postTags:')
  }
  return res
}

/**
 * 게시글 삭제.
 *
 * 🐛 과거 버그: 글만 지우고 **첨부된 사진 파일은 스토리지에 그대로 남겼습니다.**
 * 아이 사진이 찍혀서 부모님 요청으로 게시물을 지워도, 이미지 파일은 공개 주소로
 * 계속 접근 가능했습니다. (파일을 지우는 함수는 이미 storage.ts에 있었는데 아무도 안 불렀습니다.)
 * → 글을 먼저 지우고, 성공하면 사진 파일도 정리합니다.
 *   순서가 반대면 사진 삭제만 성공했을 때 글이 깨진 이미지를 가리키게 됩니다.
 */
export async function dbDeletePost(id: string) {
  // 삭제 전에 이미지 주소를 먼저 확보 (지운 뒤에는 조회할 수 없으므로)
  let imageUrls: string[] = []
  const before = await supabase.from('posts').select('image_urls').eq('id', id).maybeSingle()
  if (!before.error && before.data) imageUrls = before.data.image_urls || []

  const res = await supabase.from('posts').delete().eq('id', id)
  if (!res.error) {
    invalidateCache('posts:')
    invalidateCache('postTags:')
    if (imageUrls.length > 0) {
      // 파일 정리는 실패해도 글 삭제 자체는 성공으로 봅니다(고아 파일이 남을 뿐).
      const { deleteImagesFromStorage } = await import('./storage')
      await deleteImagesFromStorage(imageUrls).catch(() => {})
    }
  }
  return res
}

/**
 * 좋아요/아멘 토글.
 *
 * 🐛 과거 버그: 화면에서 현재 값을 읽어 계산한 뒤 통째로 덮어쓰는 방식이었습니다.
 * 주일 예배 직후처럼 여러 명이 거의 동시에 누르면 나중 사람이 앞사람 것을 지워서,
 * 카운트가 실제보다 계속 낮게 어긋났습니다(누른 사람 목록에서도 빠짐).
 *
 * → Supabase 함수(RPC) `toggle_post_like` 로 서버에서 원자적으로 처리합니다.
 *   RPC가 아직 없는 환경에서는 기존 방식으로 자동 대체(fallback)합니다.
 */
export async function dbTogglePostLike(
  postId: string,
  userId: string,
  fallback: { likes: number; likedUserIds: string[] }
): Promise<{ likes: number; likedUserIds: string[]; error: any }> {
  const rpc = await supabase.rpc('toggle_post_like', { p_post_id: postId, p_user_id: userId })

  if (!rpc.error && rpc.data) {
    const row: any = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
    if (row && typeof row.likes === 'number') {
      invalidateCache('posts:')
      return { likes: row.likes, likedUserIds: row.liked_user_ids || [], error: null }
    }
  }

  // ── RPC 미적용 환경용 대체 경로 (동시 클릭 시 유실 가능성은 남습니다) ──
  const isLiked = fallback.likedUserIds.includes(userId)
  const nextLikes = isLiked ? Math.max(0, fallback.likes - 1) : fallback.likes + 1
  const nextUsers = isLiked
    ? fallback.likedUserIds.filter(uid => uid !== userId)
    : [...fallback.likedUserIds, userId]
  const res = await dbUpdatePost(postId, { likes: nextLikes, likedUserIds: nextUsers })
  return { likes: nextLikes, likedUserIds: nextUsers, error: res.error }
}

export async function dbAddComment(postId: string, authorId: string, authorName: string, content: string) {
  const res = await supabase.from('post_comments').insert({
    post_id: postId,
    author_id: authorId,
    author_name: authorName,
    content
  })
  if (!res.error) invalidateCache('posts:')
  return res
}

// ==========================================
// 4. 교회 일정 (church_events)
// ==========================================
export interface ChurchEventItem {
  id: string
  date: string
  title: string
  type: 'sunday' | 'special'
}

export async function dbFetchChurchEvents(): Promise<ChurchEventItem[]> {
  const { data, error } = await supabase.from('church_events').select('*').order('date_str', { ascending: true })
  throwIfFetchFailed(error, '교회 일정')
  if (!data) return []
  return data.map((d: any) => ({
    id: d.id,
    date: d.date_str,
    title: d.title,
    type: d.type
  }))
}

export async function dbCreateChurchEvent(dateStr: string, title: string, type: 'sunday' | 'special') {
  const res = await supabase.from('church_events').insert({
    date_str: dateStr,
    title,
    type
  }).select().single()
  if (!res.error) invalidateCache('churchEvents', { exact: true })
  return res
}

export async function dbUpdateChurchEvent(id: string, title: string) {
  const res = await supabase.from('church_events').update({ title }).eq('id', id)
  if (!res.error) invalidateCache('churchEvents', { exact: true })
  return res
}

export async function dbDeleteChurchEvent(id: string) {
  const res = await supabase.from('church_events').delete().eq('id', id)
  if (!res.error) invalidateCache('churchEvents', { exact: true })
  return res
}

// ==========================================
// 5. 교회 행사 신청 폼 (event_forms)
// ==========================================
export interface EventFormData {
  id?: string
  title: string
  content: string
  url: string
}

export async function dbFetchLatestEventForm(): Promise<EventFormData | null> {
  const { data, error } = await supabase.from('event_forms').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  throwIfFetchFailed(error, '행사 신청 폼')
  if (!data) return null
  return {
    id: data.id,
    title: data.title,
    content: data.content || '',
    url: data.url || ''
  }
}

/**
 * 행사 신청 폼 저장.
 *
 * 🐛 과거 버그: 주보와 마찬가지로 id 없이 upsert를 호출해서 저장할 때마다 새 행이 쌓였습니다.
 * → 기존 행이 있으면 그 행을 수정합니다. (항상 최신 1건만 쓰는 화면이라 행이 하나면 충분)
 */
export async function dbUpsertEventForm(eventData: EventFormData) {
  const payload = {
    title: eventData.title,
    content: eventData.content,
    url: eventData.url,
    updated_at: new Date().toISOString()
  }

  // 기존 행이 있으면 수정, 없으면 새로 추가
  const existing = await supabase
    .from('event_forms')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)

  let res
  if (!existing.error && existing.data && existing.data.length > 0) {
    res = await supabase.from('event_forms').update(payload).eq('id', existing.data[0].id)
  } else {
    res = await supabase.from('event_forms').insert(payload)
  }

  if (!res.error) invalidateCache('eventForm:latest', { exact: true })
  return res
}

// ==========================================
// 6. 주일 식사 신청 (meal_registrations)
// ==========================================
export async function dbFetchMealRegistrations() {
  const { data, error } = await supabase.from('meal_registrations').select('*')
  throwIfFetchFailed(error, '식사 신청 현황')
  if (!data) return []
  return data
}

export async function dbSaveMealRegistration(payload: {
  familyGroupId: string
  dateStr: string
  registeredByUserId: string
  registeredByUserName: string
  attending: boolean
  adultCount: number
  childCount: number
}) {
  const res = await supabase.from('meal_registrations').upsert({
    family_group_id: payload.familyGroupId,
    date_str: payload.dateStr,
    registered_by_user_id: payload.registeredByUserId,
    registered_by_user_name: payload.registeredByUserName,
    attending: payload.attending,
    adult_count: payload.adultCount,
    child_count: payload.childCount,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'family_group_id,date_str',
    ignoreDuplicates: false
  })
  if (!res.error) invalidateCache('mealRegistrations', { exact: true })
  return res
}

/**
 * 같은 가정이 옛날 키로 남겨둔 식사 신청 줄을 지웁니다.
 * (가족 연결 전 'fam_single_...' 또는 이름을 키로 쓰던 아주 예전 형식)
 * 실패해도 저장 자체는 이미 끝났으므로 앱을 멈추지 않고 조용히 넘어갑니다.
 */
export async function dbCleanupStaleMealRegistrations(staleKeys: string[], dateStr: string) {
  const keys = (staleKeys || []).filter(Boolean)
  if (keys.length === 0 || !dateStr) return { error: null, removed: 0 }
  const { data, error } = await supabase
    .from('meal_registrations')
    .delete()
    .eq('date_str', dateStr)
    .in('family_group_id', keys)
    .select('id')
  if (error) {
    console.warn('dbCleanupStaleMealRegistrations:', error.message)
    return { error, removed: 0 }
  }
  const removed = data?.length || 0
  if (removed > 0) invalidateCache('mealRegistrations', { exact: true })
  return { error: null, removed }
}

export async function dbFetchMealCoupons(): Promise<Record<string, MealCouponAccount>> {
  try {
    // 1. 쿠폰 잔액 테이블 조회
    const { data: coupons, error: couponError } = await supabase
      .from('meal_coupons')
      .select('*')

    // 조회 실패를 빈 결과로 돌려주면 모든 가정이 "잔여 0장"으로 보여서,
    // 식권을 산 성도가 식권을 못 받는 상황이 생깁니다. 반드시 실패로 알립니다.
    throwIfFetchFailed(couponError, '식권 현황')

    if (!coupons || coupons.length === 0) return {}

    // 2. 히스토리 테이블 조회 (외래키 제약조건 없이도 안전하게 독립 조회)
    const { data: historyList, error: histError } = await supabase
      .from('meal_coupon_history')
      .select('*')
      .order('created_at', { ascending: true })

    if (histError) {
      console.warn('dbFetchMealCoupons histError (테이블 미생성 가능성):', histError.message)
    }

    // 계정별 이력을 한 번의 순회로 그룹핑 (기존: 계정마다 전체 이력을 filter →
    // O(계정 수 × 이력 수). 이력이 쌓일수록 계정이 많아질수록 느려지는 구조였음.
    // 개선: historyList를 한 번만 순회해 family_group_id별로 묶어두고 O(1) 조회.
    // → 전체 O(계정 수 + 이력 수)로 개선. historyList가 이미 created_at 오름차순
    // 정렬 상태로 조회되므로, 그룹별 순서도 기존과 동일하게 오름차순 유지됨.
    const histByFamily = new Map<string, MealCouponAccount['history']>()
    ;(historyList || []).forEach((h: any) => {
      const item = {
        id: h.id,
        dateStr: toLocalDateStr(h.created_at),
        type: h.type,
        amount: h.amount,
        note: h.note || ''
      }
      const list = histByFamily.get(h.family_group_id)
      if (list) list.push(item)
      else histByFamily.set(h.family_group_id, [item])
    })

    const result: Record<string, MealCouponAccount> = {}
    coupons.forEach((c: any) => {
      result[c.family_group_id] = {
        familyGroupId: c.family_group_id,
        familyName: c.family_name || '가정',
        balance: c.balance ?? 0,
        history: histByFamily.get(c.family_group_id) || []
      }
    })
    return result
  } catch (err) {
    console.error('dbFetchMealCoupons error:', err)
    // 빈 객체로 감추면 "잔여 0장"으로 오해되므로 그대로 올려보냅니다.
    throw err
  }
}

export interface CouponUpdateResult {
  /** 반영 후 잔액. 실패했으면 null */
  balance: number | null
  /** 실제로 반영된 증감량. 잔액이 부족해 일부만 차감된 경우 요청값과 다를 수 있습니다. */
  applied: number
  error: any
}

/**
 * 식권 발급/차감.
 *
 * 🐛 과거 버그 3가지를 한 번에 고칩니다.
 *
 * 1) **실패해도 성공으로 보고했습니다.** select 오류를 받아놓고 한 번도 확인하지 않았고,
 *    update/insert 실패는 console에만 찍고 잔액을 그대로 반환했습니다. 그래서 저장이
 *    실패해도 화면에는 "🎟️ +10장 발급 (잔여: 10장)"이 떴습니다.
 *    특히 select가 실패하면 "이 가정은 계정이 없다"고 오판해서 기존 잔액을 0으로 보고
 *    새 행을 만들어, 8장이던 가정이 1장이 되는 일이 생길 수 있었습니다.
 *
 * 2) **잔액과 내역이 안 맞았습니다.** 잔액은 0에서 멈추는데(Math.max) 내역에는 요청한
 *    양이 그대로 기록돼서, 1장 남은 가정에 -1을 세 번 하면 내역엔 "1장 사용" 3줄이
 *    남고 잔액은 1만 줄었습니다. 나중에 잔액 문의가 오면 내역으로 검증이 안 됩니다.
 *
 * 3) **동시 조작 시 유실.** 두 봉사자가 같은 가정을 동시에 조작하면 나중 사람이
 *    앞사람 것을 덮어썼습니다.
 *
 * → Supabase 함수(RPC) `adjust_meal_coupon` 이 있으면 서버에서 한 번에 처리합니다(권장).
 *   없으면 아래 대체 경로로 동작하되, 이제는 오류를 정확히 돌려주고 잔액/내역도 일치시킵니다.
 */
export async function dbUpdateMealCoupon(
  familyGroupId: string,
  familyName: string,
  delta: number,
  note?: string
): Promise<CouponUpdateResult> {
  const defaultNote = note || (delta > 0 ? (delta === 10 ? '관리자 10장 발급' : '관리자 발급') : '식사 사용/차감')

  // ── 1순위: 서버에서 원자적으로 처리 ──
  const rpc = await supabase.rpc('adjust_meal_coupon', {
    p_family_group_id: familyGroupId,
    p_family_name: familyName,
    p_delta: delta,
    p_note: defaultNote
  })
  if (!rpc.error && rpc.data !== null && rpc.data !== undefined) {
    const row: any = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
    if (row && typeof row.balance === 'number') {
      invalidateCache('mealCoupons', { exact: true })
      return { balance: row.balance, applied: row.applied ?? delta, error: null }
    }
  }

  // ── 대체 경로 (RPC 미적용 환경) ──
  const { data: rows, error: selectError } = await supabase
    .from('meal_coupons')
    .select('balance')
    .eq('family_group_id', familyGroupId)

  // 조회 실패를 "계정 없음"으로 오해하면 기존 잔액을 날려버리므로 반드시 중단합니다.
  if (selectError) return { balance: null, applied: 0, error: selectError }

  const exists = !!rows && rows.length > 0
  const currentBalance = exists ? (rows[0].balance ?? 0) : 0

  // 잔액이 부족하면 있는 만큼만 차감하고, 내역에도 "실제로 반영된 양"만 기록합니다.
  const applied = delta < 0 ? Math.max(delta, -currentBalance) : delta
  const newBalance = currentBalance + applied

  if (exists) {
    const { error: updateError } = await supabase.from('meal_coupons').update({
      balance: newBalance,
      family_name: familyName,
      updated_at: new Date().toISOString()
    }).eq('family_group_id', familyGroupId)
    if (updateError) return { balance: null, applied: 0, error: updateError }
  } else {
    const { error: insertError } = await supabase.from('meal_coupons').insert({
      family_group_id: familyGroupId,
      family_name: familyName,
      balance: newBalance,
      updated_at: new Date().toISOString()
    })
    if (insertError) return { balance: null, applied: 0, error: insertError }
  }

  if (applied !== 0) {
    const { error: histError } = await supabase.from('meal_coupon_history').insert({
      family_group_id: familyGroupId,
      type: applied > 0 ? 'GRANT' : 'USE',
      amount: Math.abs(applied),
      note: defaultNote
    })
    // 내역 기록 실패는 잔액 반영 자체를 무효로 만들지는 않지만, 장부가 어긋나므로 알려줍니다.
    if (histError) {
      invalidateCache('mealCoupons', { exact: true })
      return { balance: newBalance, applied, error: histError }
    }
  }

  invalidateCache('mealCoupons', { exact: true })
  return { balance: newBalance, applied, error: null }
}

/**
 * 가족 연결 시 각 성도의 개인 쿠폰(fam_single_xxx)을
 * 새 가족 그룹 쿠폰(newFamilyGroupId)으로 합산·병합하고
 * 기존 개인 레코드는 삭제합니다.
 *
 * @param memberIds        병합 대상 성도 ID 배열 (모든 가족 구성원)
 * @param newFamilyGroupId 새 가족 그룹 ID
 * @param newFamilyName    새 가족 명칭
 */
export async function dbMergeCouponsIntoFamily(
  memberIds: string[],
  newFamilyGroupId: string,
  newFamilyName: string
) {
  try {
    // 1. 각 성도의 개인 쿠폰 키 목록 (fam_single_xxx)
    const singleKeys = memberIds.map(id => `fam_single_${id}`)
      .filter(key => key !== newFamilyGroupId) // 새 가족 ID 자신은 정리 대상이 아님

    if (singleKeys.length === 0) return

    // 2. 개인 쿠폰 레코드 조회
    const { data: singleRows, error: selectError } = await supabase
      .from('meal_coupons')
      .select('family_group_id, balance')
      .in('family_group_id', singleKeys)

    if (selectError) throw new Error(`개인 쿠폰 조회 실패: ${selectError.message}`)

    const singleTotal = (singleRows || []).reduce((sum, r) => sum + (r.balance ?? 0), 0)

    // 3. 현재 가족 그룹 쿠폰 잔액 조회
    const { data: famRows, error: famError } = await supabase
      .from('meal_coupons')
      .select('balance')
      .eq('family_group_id', newFamilyGroupId)

    if (famError) throw new Error(`가족 쿠폰 조회 실패: ${famError.message}`)

    const famExists = !!famRows && famRows.length > 0
    const famBalance = famExists ? (famRows[0].balance ?? 0) : 0
    const mergedBalance = famBalance + singleTotal

    // 4. 가족 그룹 쿠폰 행을 **항상 먼저** 만들어 둡니다.
    //
    // ⚠️ 순서가 중요합니다: meal_coupon_history.family_group_id 에는
    // meal_coupons(family_group_id)를 가리키는 외래키가 걸려 있습니다.
    // 아래 6번에서 내역을 새 가족 ID로 옮기려면 그 행이 **이미 존재해야** 합니다.
    // (이전 버전은 `if (singleTotal > 0)` 안에서만 행을 만들어서, 잔액이 0인 상태로
    //  가정을 합치면 내역 이관이 외래키 위반으로 실패했습니다.)
    if (famExists) {
      if (mergedBalance !== famBalance || newFamilyName) {
        const { error: updateError } = await supabase.from('meal_coupons').update({
          balance: mergedBalance,
          family_name: newFamilyName,
          updated_at: new Date().toISOString()
        }).eq('family_group_id', newFamilyGroupId)
        if (updateError) throw new Error(`가족 쿠폰 업데이트 실패: ${updateError.message}`)
      }
    } else {
      const { error: insertError } = await supabase.from('meal_coupons').insert({
        family_group_id: newFamilyGroupId,
        family_name: newFamilyName,
        balance: mergedBalance,
        updated_at: new Date().toISOString()
      })
      if (insertError) throw new Error(`가족 쿠폰 생성 실패: ${insertError.message}`)
    }

    // 5. 기존 개인 쿠폰 내역을 가족 ID로 이관
    //
    // 🐛 과거 버그: 여기에 더해 "개인 쿠폰 가정 통합 (N장)"이라는 GRANT 내역을 **새로 추가**했습니다.
    // 기존 내역도 그대로 옮기면서 합성 기록까지 만들어서, 내역 합계가 실제 잔액의 두 배가 됐습니다.
    // → 합성 기록은 만들지 않습니다. (통합 시점은 이관된 내역으로 충분히 확인됩니다.
    //    'MERGE' 같은 새 type 값은 meal_coupon_history_type_check 제약에 걸려 실패합니다.)
    const { error: historyError } = await supabase
      .from('meal_coupon_history')
      .update({ family_group_id: newFamilyGroupId })
      .in('family_group_id', singleKeys)

    if (historyError) throw new Error(`쿠폰 내역 이관 실패: ${historyError.message}`)

    // 6. 개인 쿠폰 행 삭제
    //
    // 🐛 과거 버그: 이 정리 작업이 `if (singleTotal > 0)` 안에 있어서, 잔액이 0인 상태로
    // 가정을 합치면 개인 쿠폰 행이 영영 안 지워졌습니다. 그 행은 식권 화면에 "유령 가정"
    // 카드로 남고, 나중에 거기에 발급된 쿠폰은 아무도 못 봅니다.
    // → 잔액과 무관하게 항상 정리합니다. (내역을 먼저 옮겼으므로 외래키 위반도 없습니다)
    const { error: deleteError } = await supabase
      .from('meal_coupons')
      .delete()
      .in('family_group_id', singleKeys)

    if (deleteError) throw new Error(`기존 개인 쿠폰 삭제 실패: ${deleteError.message}`)

    invalidateCache('mealCoupons', { exact: true })
  } catch (err) {
    console.error('[dbMergeCouponsIntoFamily] 쿠폰 병합 오류:', err)
    throw err // 호출부(관리자 대시보드)에서 alert 하도록 re-throw
  }
}

// ==========================================
// 8. 출석체크 (attendance_records)
// ==========================================
export async function dbFetchAttendanceRecords(dateStr?: string, userId?: string) {
  let query = supabase.from('attendance_records').select('*')
  if (dateStr) {
    query = query.eq('date_str', dateStr)
  }
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query
  throwIfFetchFailed(error, '출석 기록')
  if (!data) return []
  return data
}

/**
 * 출석 기록 저장.
 *
 * 🐛 과거 버그: "먼저 지우고 → 다시 넣는" 방식이었습니다. 두 작업 사이에 연결이 끊기면
 * (리더가 출석을 고치다가 교회를 나서는 순간처럼) **지우기만 성공하고 넣기는 실패**해서,
 * 그 주 그 라브리 전체 출석 기록이 통째로 사라졌습니다. 화면에는 "저장 중 오류"라고만
 * 떠서 아무것도 안 바뀐 줄 알게 됩니다. 손대지 않은 다른 성도들 기록까지 함께 날아갔습니다.
 *
 * → 지우지 않고 upsert(있으면 덮어쓰기, 없으면 추가)로 바꿉니다. 중간에 실패해도
 *   기존 기록은 그대로 남습니다.
 *   (Supabase에서 attendance_records에 UNIQUE(user_id, date_str) 제약이 필요합니다 —
 *    SQL 파일 참고. 제약이 아직 없으면 기존 방식으로 자동 대체합니다.)
 */
export async function dbSaveAttendanceRecords(records: {
  userId: string
  dateStr: string
  labriId: string
  status: 'ATTEND' | 'ABSENT'
  note?: string
  recordedBy?: string
}[]) {
  if (!records || records.length === 0) return { error: null }

  const payload = records.map(r => ({
    user_id: r.userId,
    date_str: r.dateStr,
    labri_id: r.labriId,
    status: r.status,
    // 출석으로 표시된 사람에게는 결석사유가 남아있으면 안 됩니다.
    // (결석 → 사유 입력 → 다시 출석으로 정정한 경우 사유만 남던 문제)
    note: r.status === 'ABSENT' ? (r.note || '') : '',
    recorded_by: r.recordedBy
  }))

  const res = await supabase
    .from('attendance_records')
    .upsert(payload, { onConflict: 'user_id,date_str' })

  if (!res.error) {
    invalidateCache('attendanceRecords:')
    return res
  }

  // ── UNIQUE 제약 미적용 환경용 대체 경로 (기존 동작) ──
  const dateStr = records[0].dateStr
  const userIds = records.map(r => r.userId)

  const { error: deleteError } = await supabase
    .from('attendance_records')
    .delete()
    .eq('date_str', dateStr)
    .in('user_id', userIds)

  if (deleteError) return { error: deleteError }

  const insertRes = await supabase.from('attendance_records').insert(payload)
  if (!insertRes.error) invalidateCache('attendanceRecords:')
  return insertRes
}
