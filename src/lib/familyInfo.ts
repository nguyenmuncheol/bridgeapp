/**
 * "가족 현황 메모"(profiles.family_info) 구조화 헬퍼
 *
 * 기존에는 이 칸이 관리자가 손으로 입력하는 자유 텍스트("아내: 홍길순, 자녀: 김철수")였습니다.
 * 이제는:
 *  - 배우자 정보는 더 이상 텍스트로 저장하지 않고, 이미 있는 "가족/배우자 연결" 기능
 *    (familyGroupId)으로 실제 연동된 계정에서 그때그때 이름을 가져와 보여줍니다.
 *  - 자녀 등 계정이 없는 가족 구성원은 이름/생일을 별도 목록(JSON)으로 저장합니다. 나이대
 *    (유아/어린이/학생/청년) 구분은 더 이상 수동 선택이 아니라 생일로부터 자동 계산해서
 *    보여줍니다(dateUtils.getChildAgeLabel 참고). 생일이 없으면 나이대 표기 없이 이름만 보입니다.
 *  - 부부(배우자 연동된 두 계정)는 자녀 목록을 공유합니다. 화면에 보여줄 때는 항상 "본인 저장분 +
 *    배우자 저장분"을 합쳐서(getSharedChildren) 보여주고, 저장할 때도 두 계정 모두에 동일한 최신
 *    목록을 기록(양쪽 동기화)해서 누가 먼저 입력했든 서로 최신 정보를 보게 됩니다.
 *
 * family_info 컬럼은 그대로 text이고, 아래 형태의 JSON 문자열을 담습니다:
 *   { "note": "기타 자유 메모", "children": [{ id, name, birthday }] }
 * 예전 방식으로 입력된 일반 텍스트(JSON이 아닌 값)는 자동으로 note로 인식되어
 * 데이터가 사라지지 않고 그대로 보존됩니다.
 */
import { UserProfile } from './mockData'

export interface FamilyChildInfo {
  id: string
  name: string
  birthday?: string // 'YYYY-MM-DD' 또는 'MM-DD'. 관리자는 모를 수 있으므로 비어있을 수 있음(부모가 마이페이지에서 입력)
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
          .filter((c: any) => c && typeof c.name === 'string' && c.name.trim())
          .map((c: any) => ({
            id: c.id || `child_${Math.random().toString(36).slice(2, 9)}`,
            name: c.name.trim(),
            birthday: c.birthday || ''
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
  const children = (data.children || []).filter(c => c.name && c.name.trim())
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

// 배우자 등 미입력 생일이 있는 자녀 목록 (마이페이지 "생일 입력 알림"용)
export function getMissingBirthdayChildren(user: UserProfile, allUsers: UserProfile[]): FamilyChildInfo[] {
  return getSharedChildren(user, allUsers).filter(c => !c.birthday)
}

// 주소록 등에 보여줄 "배우자:xxx / 자녀:xxx/xxx" 형태의 요약 문자열 생성
export function buildFamilyStatusText(user: UserProfile, allUsers: UserProfile[]): string {
  const parts: string[] = []
  const linked = findLinkedFamilyMembers(user, allUsers)
  if (linked.length > 0) {
    parts.push(`배우자:${linked.map(u => u.name).join('·')}`)
  }
  const children = getSharedChildren(user, allUsers)
  if (children.length > 0) {
    parts.push(`자녀:${children.map(c => c.name).join('·')}`)
  }
  const { note } = parseFamilyInfo(user.familyInfo)
  if (note) parts.push(note)
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
  users.forEach(u => {
    const shared = getSharedChildren(u, users)
    const linked = findLinkedFamilyMembers(u, users)
    shared.forEach(c => {
      if (seen.has(c.id)) return
      seen.add(c.id)
      out.push({
        id: `dep_${c.id}`,
        name: c.name,
        email: '',
        phone: '',
        role: 'MEMBER',
        duty: '자녀',
        birthday: c.birthday,
        createdAt: '',
        isDependent: true,
        // 주소록에서 "부모 바로 아래"에 자녀를 붙이려면 어느 가정인지 알아야 합니다.
        // (가족 연결이 안 된 분의 자녀는 값이 없어, 주소록에서 단독 항목으로 나옵니다)
        familyGroupId: u.familyGroupId,
        parentName: buildParentLabel(u, linked)
      })
    })
  })
  return out
}
