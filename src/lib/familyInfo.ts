/**
 * "가족 현황 메모"(profiles.family_info) 구조화 헬퍼
 *
 * 기존에는 이 칸이 관리자가 손으로 입력하는 자유 텍스트("아내: 홍길순, 자녀: 김철수")였습니다.
 * 이제는:
 *  - 배우자 정보는 더 이상 텍스트로 저장하지 않고, 이미 있는 "가족/배우자 연결" 기능
 *    (familyGroupId)으로 실제 연동된 계정에서 그때그때 이름을 가져와 보여줍니다.
 *  - 자녀 등 계정이 없는 가족 구성원은 이름/생일/교회학교 그룹을 별도 목록(JSON)으로 저장합니다.
 *    예전에 쓰던 나이대(유아/어린이/학생/청년) 자동 표시는 없앴고, 대신 실제로 출석을 관리하는
 *    교회학교 그룹(영아부·유아·유치부·초등부·중고등부)을 직접 지정합니다.
 *    그룹을 지정하지 않으면 "미지정"이며, 주소록 목록·생일 달력·출석체크에서 빠집니다.
 *  - 부부(배우자 연동된 두 계정)는 자녀 목록을 공유합니다. 화면에 보여줄 때는 항상 "본인 저장분 +
 *    배우자 저장분"을 합쳐서(getSharedChildren) 보여주고, 저장할 때도 두 계정 모두에 동일한 최신
 *    목록을 기록(양쪽 동기화)해서 누가 먼저 입력했든 서로 최신 정보를 보게 됩니다.
 *
 * family_info 컬럼은 그대로 text이고, 아래 형태의 JSON 문자열을 담습니다:
 *   { "note": "기타 자유 메모", "children": [{ id, name, birthday }] }
 * 예전 방식으로 입력된 일반 텍스트(JSON이 아닌 값)는 자동으로 note로 인식되어
 * 데이터가 사라지지 않고 그대로 보존됩니다.
 */
import type { UserProfile } from './mockData'

export const FAMILY_ROLE_ORDER: Record<string, number> = {
  '조부': 1,
  '조모': 2,
  '부': 3,
  '모': 4,
  '자녀1': 5,
  '자녀2': 6,
  '자녀3': 7,
  '자녀': 8,
  '기타': 9,
}

/**
 * 자녀가 속한 교회학교 그룹. 빈 값이면 "미지정"입니다.
 *
 * - 미지정(빈 값): 주소록·생일달력·출석 **모두 제외**
 * - 출석 미적용: 주소록·생일달력에는 **보이고**, 출석체크·리마인더에서만 제외
 *   (교회학교에 안 다니지만 명단에는 있어야 하는 자녀)
 */
export const CHILD_LABRI_NO_ATTENDANCE = '출석 미적용'

export const CHILD_LABRI_OPTIONS = ['영아부', '유아·유치부', '초등부', '중고등부', CHILD_LABRI_NO_ATTENDANCE] as const

/**
 * 화면에 보여줄 자녀 부서 이름.
 *
 * "출석 미적용"은 **부모가 고르는 설정값**이지 부서 이름이 아니라서,
 * 주소록 같은 곳에 그대로 뜨면 성도님들이 부서로 오해합니다.
 * → 빈 값으로 돌려주어 부서 칸에 아무것도 안 나오게 합니다.
 */
export function getChildGroupLabel(group?: string): string {
  const g = (group || '').trim()
  return g === CHILD_LABRI_NO_ATTENDANCE ? '' : g
}

/** 출석체크·통계 대상이 되는 그룹만 (출석 미적용 제외) */
export const CHILD_ATTENDANCE_GROUPS = ['영아부', '유아·유치부', '초등부', '중고등부'] as const

export interface FamilyChildInfo {
  id: string
  name: string
  birthday?: string // 'YYYY-MM-DD' 또는 'MM-DD'. 관리자는 모를 수 있으므로 비어있을 수 있음(부모가 마이페이지에서 입력)
  /**
   * 자녀 교회학교 그룹(영아부/유아·유치부/초등부/중고등부).
   * 비어 있으면 "미지정" — 출석체크·주소록 목록·생일 달력에서 제외됩니다.
   * (부모의 가족현황 줄에는 이름이 그대로 나옵니다)
   */
  labriId?: string
  /**
   * 자녀 프로필 사진 주소. 부모가 [내 정보 > 정보 수정 > 자녀 정보]에서 올립니다.
   * 비어 있으면 주소록·생일 달력에서 이름 두 글자가 동그라미에 표시됩니다.
   */
  avatarUrl?: string
}

export interface FamilyInfoData {
  note: string
  children: FamilyChildInfo[]
  addressRequestedAt?: string // 관리자가 "주소 보완요청"을 누른 시각(ISO). 비어있으면 요청 없음.
}

export function parseFamilyInfo(raw?: string | null): FamilyInfoData {
  if (!raw || !raw.trim()) return { note: '', children: [], addressRequestedAt: '' }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.children)) {
      return {
        note: typeof parsed.note === 'string' ? parsed.note : '',
        children: parsed.children
          .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>).name === 'string' && !!((c as Record<string, unknown>).name as string).trim())
          .map((c: Record<string, unknown>) => ({
            id: typeof c.id === 'string' && c.id ? c.id : `child_${Math.random().toString(36).slice(2, 9)}`,
            name: ((c.name as string) || '').trim(),
            birthday: typeof c.birthday === 'string' ? c.birthday : '',
            labriId: typeof c.labriId === 'string' ? c.labriId : '',
            avatarUrl: typeof c.avatarUrl === 'string' ? c.avatarUrl : ''
          })),
        addressRequestedAt: typeof parsed.addressRequestedAt === 'string' ? parsed.addressRequestedAt : ''
      }
    }
  } catch {
    // JSON이 아니면 예전 방식의 자유 텍스트 메모로 간주하고 그대로 보존
  }
  return { note: raw, children: [], addressRequestedAt: '' }
}

export function serializeFamilyInfo(data: FamilyInfoData): string {
  const note = (data.note || '').trim()
  const children = (data.children || [])
    .filter(c => c.name && c.name.trim())
    .map(c => ({ id: c.id, name: c.name, birthday: c.birthday || '', labriId: c.labriId || '', avatarUrl: c.avatarUrl || '' }))
  const addressRequestedAt = data.addressRequestedAt || ''
  if (!note && children.length === 0 && !addressRequestedAt) return ''
  return JSON.stringify({ note, children, addressRequestedAt })
}

// familyGroupId로 연동된 다른 실제 계정(배우자 등)을 찾습니다.
export function findLinkedFamilyMembers(user: UserProfile, allUsers: UserProfile[]): UserProfile[] {
  if (!user.familyGroupId) return []
  return allUsers.filter(u => u.id !== user.id && u.familyGroupId === user.familyGroupId)
}

// 부부(가족 내 호칭이 서로 '부'/'모'로 지정된 두 계정)만 반환합니다. 조부모 등 확대가족
// 구성원과는 주소를 자동으로 공유하지 않기 위한 안전장치입니다(3대가 한 가족그룹으로
// 묶여 있어도 조부모의 주소까지 같이 바뀌지 않도록).
export function findSpouseLinks(user: UserProfile, allUsers: UserProfile[]): UserProfile[] {
  const isParentRole = (u: UserProfile) => u.familyRole === '부' || u.familyRole === '모'
  if (!isParentRole(user)) return []
  return findLinkedFamilyMembers(user, allUsers).filter(isParentRole)
}

// 두 자녀 목록을 id 기준으로 병합합니다. primary가 secondary보다 우선(같은 id면 primary 값 사용)합니다.
export function mergeChildrenLists(primary: FamilyChildInfo[], secondary: FamilyChildInfo[]): FamilyChildInfo[] {
  const map = new Map<string, FamilyChildInfo>()
  ;(secondary || []).forEach(c => map.set(c.id, c))
  ;(primary || []).forEach(c => map.set(c.id, c))
  return Array.from(map.values())
}

// 본인 + 배우자(연동된 계정) 저장분을 합친 자녀 목록. 부부는 자녀 정보를 공유해서 보여줍니다.
export function getSharedChildren(user: UserProfile, allUsers: UserProfile[]): FamilyChildInfo[] {
  const own = parseFamilyInfo(user.familyInfo).children
  const linked = findLinkedFamilyMembers(user, allUsers)
  return linked.reduce((acc, spouse) => mergeChildrenLists(acc, parseFamilyInfo(spouse.familyInfo).children), own)
}

// 저장 시 본인 + 배우자 계정 모두에 동일한(최신) 자녀 목록을 기록하기 위한 업데이트 목록 생성.
// note와 addressRequestedAt(주소 보완요청 상태)은 각 계정별로 개별 보존합니다(본인 것만 바꾸고
// 배우자의 기존 메모/보완요청 상태는 그대로 유지).
export function buildFamilyInfoSyncUpdates(
  targetUser: UserProfile,
  note: string,
  children: FamilyChildInfo[],
  allUsers: UserProfile[]
): { userId: string; familyInfo: string }[] {
  const ownAddressRequestedAt = parseFamilyInfo(targetUser.familyInfo).addressRequestedAt
  const updates = [{ userId: targetUser.id, familyInfo: serializeFamilyInfo({ note, children, addressRequestedAt: ownAddressRequestedAt }) }]
  findLinkedFamilyMembers(targetUser, allUsers).forEach(spouse => {
    const spouseData = parseFamilyInfo(spouse.familyInfo)
    updates.push({ userId: spouse.id, familyInfo: serializeFamilyInfo({ note: spouseData.note, children, addressRequestedAt: spouseData.addressRequestedAt }) })
  })
  return updates
}

// 관리자가 "주소 보완요청" 버튼을 눌렀을 때 저장할 family_info 문자열 (기존 메모/자녀 목록은 보존)
export function buildAddressRequestUpdate(user: UserProfile, requested: boolean): string {
  const data = parseFamilyInfo(user.familyInfo)
  return serializeFamilyInfo({ ...data, addressRequestedAt: requested ? new Date().toISOString() : '' })
}

/**
 * 생일이 아직 안 적힌 자녀 목록 (마이페이지 "생일 입력 알림"용).
 *
 * 교회학교 그룹이 **지정된** 자녀만 대상으로 합니다.
 * 미지정 자녀는 생일 달력에도 안 나오므로 굳이 생일을 재촉하지 않습니다.
 */
export function getMissingBirthdayChildren(user: UserProfile, allUsers: UserProfile[]): FamilyChildInfo[] {
  return getSharedChildren(user, allUsers).filter(c => !c.birthday && !!c.labriId)
}

// 주소록 등에 보여줄 "배우자:xxx / 자녀:xxx/xxx" 형태의 요약 문자열 생성
//
// "기타 메모"(note)는 관리자만 보는 내부 메모라, 기본값(includeNote=false)에서는
// 포함하지 않습니다 — 주소록·마이페이지 등 성도에게 노출되는 화면에서 자동으로 빠집니다.
// 관리자 성도관리 화면처럼 메모를 보여줘야 하는 곳에서만 true로 넘겨서 씁니다.
export function buildFamilyStatusText(user: UserProfile, allUsers: UserProfile[], includeNote = false): string {
  const parts: string[] = []
  const linked = findLinkedFamilyMembers(user, allUsers)
  if (linked.length > 0) {
    parts.push(`배우자:${linked.map(u => u.name).join('·')}`)
  }
  const children = getSharedChildren(user, allUsers)
  if (children.length > 0) {
    parts.push(`자녀:${children.map(c => c.name).join('·')}`)
  }
  if (includeNote) {
    const { note } = parseFamilyInfo(user.familyInfo)
    if (note) parts.push(note)
  }
  return parts.join(' / ')
}

// 자녀 카드에 표시할 "아빠: xxx / 엄마: xxx" 형태의 부모 라벨(아빠 먼저, 엄마 다음 순서 고정).
// 가족 내 호칭(familyRole)이 부/모로 지정되어 있지 않으면 "보호자:이름1·이름2" 형태로 대체 표기합니다.
function parentRoleLabel(u: UserProfile): '부' | '모' | null {
  if (u.familyRole === '부') return '부'
  if (u.familyRole === '모') return '모'
  return null
}

export function buildParentLabel(owner: UserProfile, linkedMembers: UserProfile[]): string {
  const people = [owner, ...linkedMembers]
  const labeled = people.map(p => ({ p, role: parentRoleLabel(p) }))
  if (labeled.every(x => x.role)) {
    const order: Record<'부' | '모', number> = { '부': 0, '모': 1 }
    const text: Record<'부' | '모', string> = { '부': '아빠', '모': '엄마' }
    const sorted = [...labeled].sort((a, b) => order[a.role as '부' | '모'] - order[b.role as '부' | '모'])
    return sorted.map(x => `${text[x.role as '부' | '모']}: ${x.p.name}`).join(' / ')
  }
  return `보호자:${people.map(p => p.name).join('·')}`
}

// 계정이 없는 자녀 등 가족 구성원을 주소록/생일 목록에 표시하기 위한 가상 항목 생성.
// 부부가 각자 자녀를 저장했더라도 같은 자녀(id)는 한 번만 나오도록 중복 제거합니다.
export function buildDependentEntries(users: UserProfile[]): UserProfile[] {
  const seen = new Set<string>()
  const out: UserProfile[] = []

  // 🐛 자녀가 커서 직접 가입하면 **주소록에 두 번** 나옵니다.
  //    (① 부모가 적어둔 가족 메모 속 자녀  ② 새로 만든 본인 계정)
  // → 같은 가정에 같은 이름의 실제 계정이 있으면, 메모 쪽 자녀는 만들지 않습니다.
  //    (관리자가 가족 메모에서 지우지 않아도 자동으로 정리됩니다)
  const realMemberKeys = new Set(
    users
      .filter(u => !u.isDependent && u.name)
      .map(u => `${(u.familyGroupId || '').trim()}|${u.name.trim()}`)
  )

  users.forEach(u => {
    const shared = getSharedChildren(u, users)
    const linked = findLinkedFamilyMembers(u, users)
    shared.forEach(c => {
      if (seen.has(c.id)) return
      // 이 자녀가 이미 계정을 만들어 명단에 있으면 가상 항목을 만들지 않습니다.
      if (realMemberKeys.has(`${(u.familyGroupId || '').trim()}|${(c.name || '').trim()}`)) {
        seen.add(c.id)
        return
      }
      seen.add(c.id)
      out.push({
        id: `dep_${c.id}`,
        name: c.name,
        email: '',
        phone: '',
        role: 'MEMBER',
        duty: '자녀',
        birthday: c.birthday,
        // 부모가 올려준 자녀 사진 (없으면 이름 두 글자가 표시됩니다)
        avatarUrl: c.avatarUrl || '',
        createdAt: '',
        isDependent: true,
        // 자녀 교회학교 그룹. 비어 있으면 주소록 목록/생일 달력에서 숨깁니다.
        childLabriId: c.labriId || '',
        // 주소록에서 "부모 바로 아래"에 자녀를 붙이려면 어느 가정인지 알아야 합니다.
        // (가족 연결이 안 된 분의 자녀는 값이 없어, 주소록에서 단독 항목으로 나옵니다)
        familyGroupId: u.familyGroupId,
        parentName: buildParentLabel(u, linked)
      })
    })
  })
  return out
}
