import type { Dispatch, SetStateAction } from 'react'
import { UserProfile, isApprovedMember } from './mockData'
import { dbUpdateProfile } from './db'
import { parseFamilyInfo, buildAddressRequestUpdate } from './familyInfo'

// AdminDashboard의 여러 탭(성도관리/가입승인/출석통계)에서 공통으로 쓰는 헬퍼 모음입니다.
// (파일 분리 전 AdminDashboard.tsx에 있던 로직을 그대로 옮긴 것으로, 동작은 동일합니다.)

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

// 라브리 값이 없거나(빈 문자열) 승인 시 저장된 '미정' 문자열이거나 모두 "라브리 미정"으로 통일
export function normalizeLabriLabel(labriId?: string) {
  return (!labriId || labriId === '미정') ? '라브리 미정' : labriId
}

// 가족 그룹별로 묶어서 옵션 목록 생성 (가정 단위 / 단독 단위)
export function getFamilyGroupOptions(allUsers: UserProfile[], excludeUserId?: string) {
  const approvedMembers = allUsers.filter(u => isApprovedMember(u.role))
  const candidates = approvedMembers.filter(m => m.id !== excludeUserId)
  const groupMap: Record<string, UserProfile[]> = {}
  const singles: UserProfile[] = []

  candidates.forEach(m => {
    if (m.familyGroupId) {
      if (!groupMap[m.familyGroupId]) groupMap[m.familyGroupId] = []
      groupMap[m.familyGroupId].push(m)
    } else {
      singles.push(m)
    }
  })

  const options: { key: string; label: string; isGroup: boolean }[] = []

  // 1. 이미 묶여있는 가족 그룹들
  Object.entries(groupMap).forEach(([, members]) => {
    const sorted = [...members].sort((a, b) => {
      const orderA = FAMILY_ROLE_ORDER[a.familyRole || ''] || 10
      const orderB = FAMILY_ROLE_ORDER[b.familyRole || ''] || 10
      return orderA - orderB
    })
    const nameList = sorted.map(m => m.name).join(' · ')
    // 그룹 내 첫 번째 사람을 대표 key로 사용
    options.push({
      key: sorted[0].id,
      label: `👨‍👩‍👧 [가족] ${nameList} 가정 (${members.length}명)`,
      isGroup: true
    })
  })

  // 2. 아직 단독인 성도들
  singles.forEach(m => {
    options.push({
      key: m.id,
      label: `👤 [개인] ${m.name} ${m.duty} (${m.labriId || '미정'})`,
      isGroup: false
    })
  })

  return options.sort((a, b) => {
    if (a.isGroup && !b.isGroup) return -1
    if (!a.isGroup && b.isGroup) return 1
    return a.label.localeCompare(b.label)
  })
}

// 주소 보완요청 토글: 이미 요청된 상태면 취소, 아니면 새로 요청(시각 기록).
// 본인이 마이페이지에서 주소를 수정하면 자동으로 꺼지고, 필요 시 관리자가 다시 눌러 재요청할 수 있습니다.
// 성공 시 새로 저장된 familyInfo 문자열을 반환하고(호출자가 로컬 상태를 추가로 동기화할 수 있도록),
// 실패 시 alert을 띄운 뒤 null을 반환합니다.
export async function requestAddressUpdate(
  user: UserProfile,
  onUpdateUsers: Dispatch<SetStateAction<UserProfile[]>> | undefined,
  showToast: (msg: string) => void
): Promise<string | null> {
  const currentlyRequested = !!parseFamilyInfo(user.familyInfo).addressRequestedAt
  const newFamilyInfo = buildAddressRequestUpdate(user, !currentlyRequested)
  const { error } = await dbUpdateProfile(user.id, { familyInfo: newFamilyInfo })
  if (error) {
    alert(`주소 보완요청 처리 중 오류가 발생했습니다: ${error.message}`)
    return null
  }
  onUpdateUsers?.(prev => prev.map(u => u.id === user.id ? { ...u, familyInfo: newFamilyInfo } : u))
  showToast(currentlyRequested ? `🏠 ${user.name}님에게 주소 보완요청을 취소했습니다.` : `🏠 ${user.name}님에게 주소 보완요청을 보냈습니다.`)
  return newFamilyInfo
}
