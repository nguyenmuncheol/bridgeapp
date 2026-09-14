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
import { calculateAge } from './dateUtils'

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

// ────────────────────────────────────────────────────────────────
// 주소록 정렬 기준 — 출석체크 명단도 이 기준을 그대로 씁니다(요청: "출석체크 정렬은
// 주소록 정렬 기준과 동일하게"). 두 화면이 각자 정렬을 따로 두면 시간이 지나며
// 조금씩 어긋나기 쉬우므로, 정렬 로직은 여기 한 곳에만 둡니다.
// ────────────────────────────────────────────────────────────────

// 나이 계산 실패(생일 연도 미상 등) 시 -1로 처리해 정렬 시 맨 뒤로 보냅니다.
export function ageOf(m: UserProfile): number {
  const age = calculateAge(m.birthday)
  return age === null ? -1 : age
}

/**
 * "자녀로 볼 사람"인지 판단합니다.
 * ① 계정이 없는 자녀(가상 항목)
 * ② 자녀가 커서 직접 가입한 경우 — 실제 계정이지만 가족에서의 역할이 '자녀'
 */
export function isChildLike(m: UserProfile): boolean {
  return !!m.isDependent || m.familyRole === '자녀'
}

interface MemberUnit { members: UserProfile[]; sortAge: number }

// 부부 묶기: 전달된 scope(현재 화면에 표시될 후보 목록) 안에 familyRole이 '부'/'모'인 두 사람이
// 같은 familyGroupId로 모두 존재할 때만 한 쌍으로 묶습니다. 배우자가 다른 라브리라 scope에
// 없으면 억지로 데려오지 않고 단독으로 취급합니다.
export function groupCouplesInScope(scope: UserProfile[]): MemberUnit[] {
  const paired = new Set<string>()
  const units: MemberUnit[] = []

  scope.filter(m => !isChildLike(m)).forEach(m => {
    if (paired.has(m.id)) return
    const isSpouseRole = m.familyRole === '부' || m.familyRole === '모'
    const spouse = m.familyGroupId
      ? scope.find(o => o.id !== m.id && !paired.has(o.id) && o.familyGroupId === m.familyGroupId && (isSpouseRole ? (o.familyRole === '부' || o.familyRole === '모' || !o.familyRole) : true))
      : undefined

    if (spouse) {
      paired.add(m.id)
      paired.add(spouse.id)
      const pairSorted = [m, spouse].sort((a, b) =>
        (FAMILY_ROLE_ORDER[a.familyRole || ''] || 10) - (FAMILY_ROLE_ORDER[b.familyRole || ''] || 10)
      )
      units.push({ members: pairSorted, sortAge: Math.max(ageOf(m), ageOf(spouse)) })
    } else {
      paired.add(m.id)
      units.push({ members: [m], sortAge: ageOf(m) })
    }
  })

  return units
}

// 나이 내림차순(연장자 우선) 정렬. 나이가 같거나 알 수 없으면 이름 가나다순.
export function sortUnitsByAge(units: MemberUnit[]) {
  return [...units].sort((a, b) => {
    if (a.sortAge !== b.sortAge) return b.sortAge - a.sortAge
    return (a.members[0]?.name || '').localeCompare(b.members[0]?.name || '', 'ko')
  })
}

/**
 * 성인 그룹(라브리1~3·미정 등) 한 그룹 안에서의 표시 순서.
 * 리더 부부(없으면 관리자 부부, 없으면 목사님 부부)를 최상단에 고정하고,
 * 나머지는 부부를 묶어 나이 내림차순(동률·미상이면 이름순)으로 정렬합니다.
 */
export function sortAdultsForGroupDisplay(members: UserProfile[]): UserProfile[] {
  const isSeniorPastor = (m: UserProfile) => !m.isDependent && (m.name === '정제호' || m.duty?.includes('목사'))
  const leaders = members.filter(m => !m.isDependent && m.role === 'LEADER')
  const admins = members.filter(m => !m.isDependent && m.role === 'ADMIN')
  const pastors = members.filter(isSeniorPastor)
  const pinnedBase = leaders.length > 0 ? leaders : (admins.length > 0 ? admins : pastors)

  const pinnedIds = new Set<string>()
  const pinnedBlock: UserProfile[] = []
  pinnedBase.forEach(lead => {
    if (pinnedIds.has(lead.id)) return
    const spouse = (lead.familyRole === '부' || lead.familyRole === '모') && lead.familyGroupId
      ? members.find(o => o.id !== lead.id && !pinnedIds.has(o.id) && o.familyGroupId === lead.familyGroupId && (o.familyRole === '부' || o.familyRole === '모'))
      : (lead.familyGroupId
          ? members.find(o => o.id !== lead.id && !pinnedIds.has(o.id) && o.familyGroupId === lead.familyGroupId)
          : undefined)
    const unit = spouse
      ? [lead, spouse].sort((a, b) => (FAMILY_ROLE_ORDER[a.familyRole || ''] || 10) - (FAMILY_ROLE_ORDER[b.familyRole || ''] || 10))
      : [lead]
    unit.forEach(u => pinnedIds.add(u.id))
    pinnedBlock.push(...unit)
  })

  const rest = members.filter(m => !pinnedIds.has(m.id))
  const restSorted = sortUnitsByAge(groupCouplesInScope(rest)).flatMap(u => u.members)
  return [...pinnedBlock, ...restSorted]
}

/** 자녀 그룹(교회학교 부서별) 안에서의 표시 순서: 나이 내림차순, 동률·미상이면 이름순. */
export function sortChildrenForGroupDisplay(children: UserProfile[]): UserProfile[] {
  return [...children].sort((a, b) => {
    const diff = ageOf(b) - ageOf(a)
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ko')
  })
}

/**
 * 자녀가 속한 교회학교 그룹. **관리자만 지정합니다**(부모 화면에는 선택칸이 없습니다).
 *
 * 값에 따라 자녀가 어디에 보이는지:
 * - 미지정(빈 값): 아무 데도 안 나옵니다. 부모의 가족현황 줄과 관리자 자녀 목록에만
 *   보이며, **관리자 화면에 "그룹을 정해 주세요" 배너로 계속 뜹니다.**
 * - 출석 미적용: 미지정과 똑같이 아무 데도 안 나오지만, 관리자 배너에서는 빠집니다.
 *   즉 **"교회학교에 다니지 않는 것을 확인했으니 그만 알려도 된다"는 표시**입니다.
 *   생일도 표시하지 않고, 부모에게 생일 입력을 재촉하지도 않습니다.
 * - 영아부~중고등부: 주소록 교회학교 탭 · 생일 · 출석체크 · 교회학교 인원수 모두 포함.
 *
 * 주소록은 교회학교 출석 관리용 명단이라, 교회학교에 다니지 않는 자녀는 넣지 않습니다.
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

/**
 * 선생님(TEACHER)이 담당하는 교회학교 그룹 — 여러 개 겸임할 수 있습니다.
 *
 * DB 마이그레이션 없이 콤마로 이어 붙인 문자열로 profiles.teach_group에 그대로 저장합니다
 * ("영아부,유아·유치부"). 빈 문자열/undefined는 "미지정 = 전체 담당"을 뜻합니다(기존과 동일).
 */
export function parseTeachGroups(raw?: string | null): string[] {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean)
}
export function serializeTeachGroups(groups: string[]): string {
  return groups.filter(Boolean).join(',')
}

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
  spouseName?: string // 미가입 배우자 이름 직접 입력
  children: FamilyChildInfo[]
  addressRequestedAt?: string // 관리자가 "주소 보완요청"을 누른 시각(ISO). 비어있으면 요청 없음.
}

export function parseFamilyInfo(raw?: string | null): FamilyInfoData {
  if (!raw || !raw.trim()) return { note: '', spouseName: '', children: [], addressRequestedAt: '' }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.children)) {
      return {
        note: typeof parsed.note === 'string' ? parsed.note : '',
        spouseName: typeof parsed.spouseName === 'string' ? parsed.spouseName.trim() : '',
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
  return { note: raw, spouseName: '', children: [], addressRequestedAt: '' }
}

export function serializeFamilyInfo(data: FamilyInfoData): string {
  const note = (data.note || '').trim()
  const spouseName = (data.spouseName || '').trim()
  const children = (data.children || [])
    .filter(c => c.name && c.name.trim())
    .map(c => ({ id: c.id, name: c.name, birthday: c.birthday || '', labriId: c.labriId || '', avatarUrl: c.avatarUrl || '' }))
  const addressRequestedAt = data.addressRequestedAt || ''
  if (!note && !spouseName && children.length === 0 && !addressRequestedAt) return ''
  return JSON.stringify({ note, spouseName, children, addressRequestedAt })
}

// familyGroupId로 연동된 다른 실제 계정(배우자 등)을 찾습니다.
export function findLinkedFamilyMembers(user: UserProfile, allUsers: UserProfile[]): UserProfile[] {
  if (!user.familyGroupId) return []
  return allUsers.filter(u => u.id !== user.id && u.familyGroupId === user.familyGroupId)
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

import { familyKeyOf } from './familyKey'

// 저장 시 본인 + 배우자 계정 모두에 동일한(최신) 자녀 목록을 기록하기 위한 업데이트 목록 생성.
// note, spouseName, addressRequestedAt(주소 보완요청 상태)은 각 계정별로 개별 보존합니다.
export function buildFamilyInfoSyncUpdates(
  targetUser: UserProfile,
  note: string,
  children: FamilyChildInfo[],
  allUsers: UserProfile[],
  spouseName?: string
): { userId: string; familyInfo: string }[] {
  const targetData = parseFamilyInfo(targetUser.familyInfo)
  const finalSpouseName = spouseName !== undefined ? spouseName : (targetData.spouseName || '')
  const updates = [{ userId: targetUser.id, familyInfo: serializeFamilyInfo({ note, spouseName: finalSpouseName, children, addressRequestedAt: targetData.addressRequestedAt }) }]
  findLinkedFamilyMembers(targetUser, allUsers).forEach(spouse => {
    const spouseData = parseFamilyInfo(spouse.familyInfo)
    updates.push({ userId: spouse.id, familyInfo: serializeFamilyInfo({ note: spouseData.note, spouseName: spouseData.spouseName || '', children, addressRequestedAt: spouseData.addressRequestedAt }) })
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
 * 교회학교 부서가 **실제로 지정된** 자녀만 재촉합니다.
 * 미지정·출석 미적용 자녀는 생일 달력에 나오지 않으므로, 받아도 쓸 데가 없는
 * 생일을 부모에게 요구하지 않습니다.
 */
export function getMissingBirthdayChildren(user: UserProfile, allUsers: UserProfile[]): FamilyChildInfo[] {
  return getSharedChildren(user, allUsers).filter(c =>
    !c.birthday && (CHILD_ATTENDANCE_GROUPS as readonly string[]).includes(c.labriId || '')
  )
}

// 주소록 등에 보여줄 "배우자:xxx / 자녀:xxx/xxx" 형태의 요약 문자열 생성
export function buildFamilyStatusText(user: UserProfile, allUsers: UserProfile[], includeNote = false): string {
  const parts: string[] = []
  const linked = findLinkedFamilyMembers(user, allUsers)
  const { note, spouseName } = parseFamilyInfo(user.familyInfo)
  if (linked.length > 0) {
    parts.push(`배우자:${linked.map(u => u.name).join('·')}`)
  } else if (spouseName) {
    parts.push(`배우자:${spouseName}`)
  }
  const children = getSharedChildren(user, allUsers)
  if (children.length > 0) {
    parts.push(`자녀:${children.map(c => c.name).join('·')}`)
  }
  if (includeNote && note) {
    parts.push(note)
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
  if (labeled.length > 1 && labeled.every(x => x.role)) {
    const order: Record<'부' | '모', number> = { '부': 0, '모': 1 }
    const text: Record<'부' | '모', string> = { '부': '아빠', '모': '엄마' }
    const sorted = [...labeled].sort((a, b) => order[a.role as '부' | '모'] - order[b.role as '부' | '모'])
    return sorted.map(x => `${text[x.role as '부' | '모']}: ${x.p.name}`).join(' / ')
  }

  // 배우자 계정 연동은 없으나 '미가입 배우자 이름'이 직접 입력된 경우
  const { spouseName } = parseFamilyInfo(owner.familyInfo)
  if (spouseName && owner.familyRole) {
    if (owner.familyRole === '부') {
      return `아빠: ${owner.name} / 엄마: ${spouseName}`
    }
    if (owner.familyRole === '모') {
      return `엄마: ${owner.name} / 아빠: ${spouseName}`
    }
    return `보호자: ${owner.name} · ${spouseName}`
  }

  // 편부모 (배우자 연동 및 미가입 배우자 정보 모두 없음)
  if (owner.familyRole === '부') {
    return `아빠: ${owner.name}`
  }
  if (owner.familyRole === '모') {
    return `엄마: ${owner.name}`
  }

  return `보호자:${people.map(p => p.name).join('·')}`
}

// 계정이 없는 자녀 등 가족 구성원의 가상 항목 생성 (교회학교 그룹 지정 여부와 무관한 전체 목록).
// 부부가 각자 자녀를 저장했더라도 같은 자녀(id)는 한 번만 나오도록 중복 제거합니다.
// 실제로 화면에 무엇을 보여줄지는 아래 두 함수가 나눠서 결정합니다.
function buildAllDependentEntries(users: UserProfile[]): UserProfile[] {
  const seen = new Set<string>()
  const out: UserProfile[] = []

  const realMemberKeys = new Set(
    users
      .filter(u => !u.isDependent && u.name)
      .map(u => `${(u.familyGroupId || familyKeyOf(u)).trim()}|${u.name.trim()}`)
  )

  users.forEach(u => {
    const shared = getSharedChildren(u, users)
    const linked = findLinkedFamilyMembers(u, users)
    const effectiveFamilyGroupId = u.familyGroupId || familyKeyOf(u)
    shared.forEach(c => {
      if (seen.has(c.id)) return
      // 이 자녀가 이미 계정을 만들어 명단에 있으면 가상 항목을 만들지 않습니다.
      if (realMemberKeys.has(`${effectiveFamilyGroupId.trim()}|${(c.name || '').trim()}`)) {
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
        avatarUrl: c.avatarUrl || '',
        createdAt: '',
        isDependent: true,
        childLabriId: c.labriId || '',
        familyGroupId: effectiveFamilyGroupId,
        parentName: buildParentLabel(u, linked)
      })
    })
  })
  return out
}

/**
 * 화면(주소록·생일·출석)에 보여줄 자녀 목록.
 *
 * **교회학교 부서가 실제로 지정된 자녀만** 남습니다. 미지정(빈 값)과 출석 미적용은
 * 둘 다 빠지며, 그 자녀들은 부모의 가족현황 줄과 관리자 자녀 목록에만 보입니다.
 */
export function buildDependentEntries(users: UserProfile[]): UserProfile[] {
  return buildAllDependentEntries(users).filter(c =>
    (CHILD_ATTENDANCE_GROUPS as readonly string[]).includes(c.childLabriId || '')
  )
}

/**
 * 관리자가 아직 교회학교 그룹을 정해 주지 않은 자녀들 (관리자 화면 배너용).
 *
 * 부모가 자녀를 등록해도 그룹이 없으면 어느 명단에도 나오지 않으므로,
 * 관리자에게 알려 주어 빠뜨리지 않게 합니다.
 * "출석 미적용"은 관리자가 이미 확인한 것이므로 여기서 제외합니다.
 */
export function getUnassignedChildren(users: UserProfile[]): UserProfile[] {
  return buildAllDependentEntries(users).filter(c => !(c.childLabriId || '').trim())
}
