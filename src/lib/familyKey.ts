// 가정(가족) 단위 키를 하나로 통일해주는 헬퍼입니다.
//
// 🐛 과거 버그: 식사 신청은 "가정당 1건"이 원래 설계인데, 실제로는 같은 가정이
// 두 건으로 집계되는 경우가 있었습니다. 원인은 "가정을 무엇으로 묶는가"가
// 시점에 따라 달랐기 때문입니다.
//
//   ① 아주 예전 코드 : 신청자 이름을 그대로 키로 썼습니다. (예: '임진재')
//   ② 가족 연결 전   : 혼자인 사람은 'fam_single_<본인 계정 ID>' 를 씁니다.
//   ③ 가족 연결 후   : 관리자가 부부를 묶으면 'fam_msxxxxxx' 로 바뀝니다.
//
// 그래서 남편이 먼저 혼자 신청(②)한 뒤 관리자가 부부를 묶고(③) 아내가 다시
// 신청하면, 같은 가정인데 DB에는 서로 다른 키로 두 줄이 남아 **주방 집계가
// 두 배**로 잡혔습니다. (DB의 "가정+날짜 중복 금지" 제약도 키가 다르면 못 막습니다.)
//
// → 아래 함수로 어떤 형태의 옛날 키든 "지금 이 사람의 가정 키"로 되돌려서,
//   화면 표시와 주방 집계 양쪽 모두 가정당 한 건만 세도록 합니다.

import { UserProfile, isApprovedMember } from './mockData'

/** 이 사람이 지금 사용해야 하는 가정 키 */
export function familyKeyOf(user: Pick<UserProfile, 'id' | 'familyGroupId'>): string {
  const gid = user?.familyGroupId?.trim()
  return gid ? gid : `fam_single_${user.id}`
}

/**
 * DB에 저장된 가정 키(옛날 형식 포함)를 현재 기준 가정 키로 변환합니다.
 * 대응하는 사람을 못 찾으면 원래 값을 그대로 돌려줍니다(임의로 합치지 않습니다).
 */
export function resolveFamilyKey(rawKey: string | null | undefined, allUsers: UserProfile[]): string {
  const key = (rawKey || '').trim()
  if (!key) return ''
  if (!allUsers || allUsers.length === 0) return key

  // ③ 이미 현재 가족그룹 ID인 경우
  if (allUsers.some(u => u.familyGroupId && u.familyGroupId.trim() === key)) return key

  // ② 'fam_single_<계정ID>' 형식
  if (key.startsWith('fam_single_')) {
    const uid = key.slice('fam_single_'.length)
    const owner = allUsers.find(u => u.id === uid)
    return owner ? familyKeyOf(owner) : key
  }

  // ① 이름을 키로 쓰던 아주 예전 형식
  //    동명이인이 있으면 잘못 합칠 수 있으므로, 딱 한 명일 때만 변환합니다.
  const sameName = allUsers.filter(u => u.name?.trim() === key)
  if (sameName.length === 1) return familyKeyOf(sameName[0])

  return key
}

/**
 * 이 가정이 과거에 썼을 수 있는 다른 키들(정리 대상)을 모읍니다.
 * 저장 후 이 키로 된 옛날 신청 줄을 지워서 중복 집계를 막습니다.
 */
export function staleFamilyKeys(currentUser: UserProfile, allUsers: UserProfile[]): string[] {
  const canonical = familyKeyOf(currentUser)
  const gid = currentUser.familyGroupId?.trim()
  const members = gid ? allUsers.filter(u => u.familyGroupId?.trim() === gid) : [currentUser]
  const keys = new Set<string>()
  members.forEach(m => {
    keys.add(`fam_single_${m.id}`)
    if (m.name?.trim()) keys.add(m.name.trim())
  })
  keys.delete(canonical)
  return Array.from(keys).filter(Boolean)
}

/** 화면에 보여줄 가정 단위 */
export interface FamilyUnit {
  /** 가정 키 (familyKeyOf 와 동일 기준) */
  key: string
  /** '임진재 · 장호정 가정' 또는 혼자면 '홍길동' */
  label: string
  /** 이 가정에 속한 성도들 */
  members: UserProfile[]
}

/**
 * 승인된 성도들을 가정 단위로 묶습니다.
 * 관리자 화면에서 "아직 응답 안 한 가정"을 계산할 때 씁니다.
 * (실제 계정이 없는 자녀 등 가상 항목은 제외합니다)
 */
export function buildFamilyUnits(allUsers: UserProfile[]): FamilyUnit[] {
  const groups = new Map<string, UserProfile[]>()
  ;(allUsers || []).forEach(u => {
    if (!u || u.isDependent) return
    if (!isApprovedMember(u.role)) return
    const key = familyKeyOf(u)
    const list = groups.get(key)
    if (list) list.push(u)
    else groups.set(key, [u])
  })

  const units: FamilyUnit[] = []
  groups.forEach((members, key) => {
    // 부부(부/모)를 먼저, 그 다음 이름순으로 정렬해 이름표를 만듭니다.
    const sorted = [...members].sort((a, b) => {
      const rank = (r?: string) => (r === '부' ? 0 : r === '모' ? 1 : 2)
      const d = rank(a.familyRole) - rank(b.familyRole)
      return d !== 0 ? d : (a.name || '').localeCompare(b.name || '')
    })
    const names = sorted.map(m => m.name).filter(Boolean)
    const label = names.length > 1 ? `${names.join(' · ')} 가정` : (names[0] || '이름 없음')
    units.push({ key, label, members: sorted })
  })

  return units.sort((a, b) => a.label.localeCompare(b.label))
}
