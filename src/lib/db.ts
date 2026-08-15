import { supabase } from './supabase'
import { UserProfile, PostItem, Role, MealCouponAccount } from './mockData'

// ==========================================
// 1. 성도 프로필 (profiles)
// ==========================================
export async function dbFetchProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((d: any) => ({
    id: d.id,
    name: d.name || '',
    email: d.email || '',
    phone: d.phone || '',
    address: d.address || '',
    role: (d.role || 'PENDING') as Role,
    labriId: d.labri_id,
    duty: d.duty || '성도',
    familyGroupId: d.family_group_id,
    familyRole: d.family_role,
    familyInfo: d.family_info,
    birthday: d.birthday,
    avatarUrl: d.avatar_url,
    createdAt: d.created_at ? d.created_at.slice(0, 10) : ''
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

  return await supabase.from('profiles').update(payload).eq('id', userId)
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
  return await supabase.from('profiles').update(payload).eq('id', userId)
}

export async function dbRejectUser(userId: string) {
  return await supabase.from('profiles').delete().eq('id', userId)
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

export async function dbFetchLatestBulletin(): Promise<BulletinData | null> {
  const { data, error } = await supabase.from('bulletins').select('*').order('date_str', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    date: data.date_str,
    title: data.title,
    preacher: data.preacher,
    passage: data.passage,
    summary: data.summary || '',
    imageUrls: data.image_urls || []
  }
}

export async function dbUpsertBulletin(bulletin: BulletinData) {
  return await supabase.from('bulletins').upsert({
    date_str: bulletin.date,
    title: bulletin.title,
    preacher: bulletin.preacher,
    passage: bulletin.passage,
    summary: bulletin.summary,
    image_urls: bulletin.imageUrls,
    updated_at: new Date().toISOString()
  })
}

// ==========================================
// 3. 통합 게시판 (posts) & 댓글 (post_comments)
// ==========================================
export async function dbFetchPosts(category?: string): Promise<PostItem[]> {
  let query = supabase.from('posts').select(`
    *,
    post_comments (*)
  `).order('created_at', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map((d: any) => ({
    id: d.id,
    authorId: d.author_id,
    authorName: d.author_name || '익명',
    title: d.title,
    content: d.content,
    category: d.category,
    createdAt: d.created_at ? d.created_at.slice(0, 10) : '',
    likes: d.likes || 0,
    likedUserIds: d.liked_user_ids || [],
    isSecret: d.is_secret,
    isCompleted: d.is_completed,
    isPinned: d.is_pinned,
    youtubeUrl: d.youtube_url,
    imageUrls: d.image_urls || [],
    tags: d.tags || [],
    comments: (d.post_comments || []).map((c: any) => ({
      id: c.id,
      authorName: c.author_name,
      content: c.content,
      createdAt: c.created_at ? c.created_at.slice(0, 10) : ''
    }))
  }))
}

export async function dbCreatePost(post: Partial<PostItem>) {
  return await supabase.from('posts').insert({
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
}

export async function dbUpdatePost(id: string, updates: Partial<PostItem>) {
  const payload: any = {}
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.content !== undefined) payload.content = updates.content
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted
  if (updates.isPinned !== undefined) payload.is_pinned = updates.isPinned
  if (updates.likes !== undefined) payload.likes = updates.likes
  if (updates.likedUserIds !== undefined) payload.liked_user_ids = updates.likedUserIds
  return await supabase.from('posts').update(payload).eq('id', id)
}

export async function dbDeletePost(id: string) {
  return await supabase.from('posts').delete().eq('id', id)
}

export async function dbAddComment(postId: string, authorId: string, authorName: string, content: string) {
  return await supabase.from('post_comments').insert({
    post_id: postId,
    author_id: authorId,
    author_name: authorName,
    content
  })
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
  if (error || !data) return []
  return data.map((d: any) => ({
    id: d.id,
    date: d.date_str,
    title: d.title,
    type: d.type
  }))
}

export async function dbCreateChurchEvent(dateStr: string, title: string, type: 'sunday' | 'special') {
  return await supabase.from('church_events').insert({
    date_str: dateStr,
    title,
    type
  }).select().single()
}

export async function dbUpdateChurchEvent(id: string, title: string) {
  return await supabase.from('church_events').update({ title }).eq('id', id)
}

export async function dbDeleteChurchEvent(id: string) {
  return await supabase.from('church_events').delete().eq('id', id)
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
  if (error || !data) return null
  return {
    id: data.id,
    title: data.title,
    content: data.content || '',
    url: data.url || ''
  }
}

export async function dbUpsertEventForm(eventData: EventFormData) {
  return await supabase.from('event_forms').upsert({
    title: eventData.title,
    content: eventData.content,
    url: eventData.url,
    updated_at: new Date().toISOString()
  })
}

// ==========================================
// 6. 주일 식사 신청 (meal_registrations)
// ==========================================
export async function dbFetchMealRegistrations() {
  const { data, error } = await supabase.from('meal_registrations').select('*')
  if (error || !data) return []
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
  return await supabase.from('meal_registrations').upsert({
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
}

export async function dbFetchMealCoupons(): Promise<Record<string, MealCouponAccount>> {
  try {
    // 1. 쿠폰 잔액 테이블 조회
    const { data: coupons, error: couponError } = await supabase
      .from('meal_coupons')
      .select('*')

    if (couponError) {
      console.error('dbFetchMealCoupons couponError:', couponError.message)
      return {}
    }

    if (!coupons || coupons.length === 0) return {}

    // 2. 히스토리 테이블 조회 (외래키 제약조건 없이도 안전하게 독립 조회)
    const { data: historyList, error: histError } = await supabase
      .from('meal_coupon_history')
      .select('*')
      .order('created_at', { ascending: true })

    if (histError) {
      console.warn('dbFetchMealCoupons histError (테이블 미생성 가능성):', histError.message)
    }

    const result: Record<string, MealCouponAccount> = {}
    coupons.forEach((c: any) => {
      const matchedHist = (historyList || [])
        .filter((h: any) => h.family_group_id === c.family_group_id)
        .map((h: any) => ({
          id: h.id,
          dateStr: h.created_at ? h.created_at.slice(0, 10) : '',
          type: h.type,
          amount: h.amount,
          note: h.note || ''
        }))

      result[c.family_group_id] = {
        familyGroupId: c.family_group_id,
        familyName: c.family_name || '가정',
        balance: c.balance ?? 0,
        history: matchedHist
      }
    })
    return result
  } catch (err) {
    console.error('dbFetchMealCoupons error:', err)
    return {}
  }
}

export async function dbUpdateMealCoupon(familyGroupId: string, familyName: string, delta: number, note?: string) {
  // 1. 현재 잔액 확인
  const { data: rows, error: selectError } = await supabase
    .from('meal_coupons')
    .select('balance')
    .eq('family_group_id', familyGroupId)

  let currentBalance = 0
  const exists = rows && rows.length > 0

  if (exists) {
    currentBalance = rows[0].balance ?? 0
  }

  const newBalance = Math.max(0, currentBalance + delta)

  // 2. family_group_id 기준으로 update 또는 insert
  if (exists) {
    const { error: updateError } = await supabase.from('meal_coupons').update({
      balance: newBalance,
      family_name: familyName,
      updated_at: new Date().toISOString()
    }).eq('family_group_id', familyGroupId)
    if (updateError) console.error('dbUpdateMealCoupon updateError:', updateError.message)
  } else {
    const { error: insertError } = await supabase.from('meal_coupons').insert({
      family_group_id: familyGroupId,
      family_name: familyName,
      balance: newBalance,
      updated_at: new Date().toISOString()
    })
    if (insertError) console.error('dbUpdateMealCoupon insertError:', insertError.message)
  }

  // 3. 내역(history) 기록
  if (delta !== 0) {
    const { error: histError } = await supabase.from('meal_coupon_history').insert({
      family_group_id: familyGroupId,
      type: delta > 0 ? 'GRANT' : 'USE',
      amount: Math.abs(delta),
      note: note || (delta > 0 ? (delta === 10 ? '관리자 10장 발급' : '관리자 발급') : '식사 사용/차감')
    })
    if (histError) console.warn('dbUpdateMealCoupon histError:', histError.message)
  }
  return newBalance
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

    // 2. 개인 쿠폰 레코드 조회
    const { data: singleRows, error: selectError } = await supabase
      .from('meal_coupons')
      .select('family_group_id, balance')
      .in('family_group_id', singleKeys)

    if (selectError) throw new Error(`개인 쿠폰 조회 실패: ${selectError.message}`)

    const singleTotal = (singleRows || []).reduce((sum, r) => sum + (r.balance ?? 0), 0)

    if (singleTotal > 0) {
      // 3. 현재 가족 그룹 쿠폰 잔액 조회
      const { data: famRows, error: famError } = await supabase
        .from('meal_coupons')
        .select('balance')
        .eq('family_group_id', newFamilyGroupId)

      if (famError) throw new Error(`가족 쿠폰 조회 실패: ${famError.message}`)

      const famExists = famRows && famRows.length > 0
      const famBalance = famExists ? (famRows[0].balance ?? 0) : 0
      const mergedBalance = famBalance + singleTotal

      // 4. 가족 그룹 쿠폰 upsert (잔액 합산)
      if (famExists) {
        const { error: updateError } = await supabase.from('meal_coupons').update({
          balance: mergedBalance,
          family_name: newFamilyName,
          updated_at: new Date().toISOString()
        }).eq('family_group_id', newFamilyGroupId)
        if (updateError) throw new Error(`가족 쿠폰 업데이트 실패: ${updateError.message}`)
      } else {
        const { error: insertError } = await supabase.from('meal_coupons').insert({
          family_group_id: newFamilyGroupId,
          family_name: newFamilyName,
          balance: mergedBalance,
          updated_at: new Date().toISOString()
        })
        if (insertError) throw new Error(`가족 쿠폰 생성 실패: ${insertError.message}`)
      }

      // 5. 병합 이력 기록
      await supabase.from('meal_coupon_history').insert({
        family_group_id: newFamilyGroupId,
        type: 'GRANT',
        amount: singleTotal,
        note: `개인 쿠폰 가정 통합 (${singleTotal}장)`
      })

      // 6. 기존 개인 쿠폰 레코드 히스토리를 가족 ID로 이전 후 레코드 삭제
      await supabase
        .from('meal_coupon_history')
        .update({ family_group_id: newFamilyGroupId })
        .in('family_group_id', singleKeys)

      const { error: deleteError } = await supabase
        .from('meal_coupons')
        .delete()
        .in('family_group_id', singleKeys)

      if (deleteError) throw new Error(`기존 개인 쿠폰 삭제 실패: ${deleteError.message}`)
    }
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
  if (error || !data) return []
  return data
}

export async function dbSaveAttendanceRecords(records: {
  userId: string
  dateStr: string
  labriId: string
  status: 'ATTEND' | 'ABSENT'
  note?: string
  recordedBy?: string
}[]) {
  if (!records || records.length === 0) return { error: null }
  
  const dateStr = records[0].dateStr
  const userIds = records.map(r => r.userId)

  // 1. 해당 날짜의 기존 출석 기록 삭제 (수정 시 완벽 덮어쓰기)
  await supabase
    .from('attendance_records')
    .delete()
    .eq('date_str', dateStr)
    .in('user_id', userIds)

  // 2. 새 출석 기록 등록
  const payload = records.map(r => ({
    user_id: r.userId,
    date_str: r.dateStr,
    labri_id: r.labriId,
    status: r.status,
    note: r.note || '',
    recorded_by: r.recordedBy
  }))

  return await supabase.from('attendance_records').insert(payload)
}
