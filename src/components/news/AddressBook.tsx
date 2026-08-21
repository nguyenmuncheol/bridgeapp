'use client'

import { useState, useMemo } from 'react'
import { ChevronRight, Users, Search } from 'lucide-react'
import { UserProfile, getInitials } from '../../lib/mockData'
import { buildFamilyStatusText, getChildGroupLabel } from '../../lib/familyInfo'
import { formatBirthdayDisplay, calculateAge } from '../../lib/dateUtils'
import { FAMILY_ROLE_ORDER } from '../../lib/adminHelpers'
import { matchesKoreanSearch } from '../../lib/koreanSearch'
import ProfileImageLightbox from '../ProfileImageLightbox'

// 주소록 편성상태 필터: 라브리1~3 / 자녀(유아·유치·학생 통합, 하단 라벨로 세부 구분 표시) / 라브리 미정(❤️)
const ADDRESS_FILTERS: { key: string; label: string; match: (m: UserProfile) => boolean }[] = [
  { key: '전체', label: '전체', match: () => true },
  { key: '라브리1', label: '라브리1', match: m => m.labriId === '라브리1' },
  { key: '라브리2', label: '라브리2', match: m => m.labriId === '라브리2' },
  { key: '라브리3', label: '라브리3', match: m => m.labriId === '라브리3' },
  // 계정이 없는 자녀 + 커서 직접 가입한 자녀를 함께 보여줍니다.
  { key: '자녀', label: '자녀', match: m => !!m.isDependent || m.familyRole === '자녀' },
  { key: '미정', label: '❤️', match: m => !m.isDependent && m.familyRole !== '자녀' && (!m.labriId || m.labriId === '미정') },
]

// 라브리/미정 필터에서 "관리자 or 라브리리더 부부 최상단 고정" 규칙이 적용되는 필터 키 목록
const LABRI_FILTER_KEYS = ['라브리1', '라브리2', '라브리3', '미정']

// 나이 계산 실패(생일 연도 미상 등) 시 -1로 처리해 정렬 시 맨 뒤로 보냅니다.
const ageOf = (m: UserProfile): number => {
  const age = calculateAge(m.birthday)
  return age === null ? -1 : age
}

// 🐛 과거 문제: 부부는 묶는 규칙이 있는데 **자녀는 없었습니다.**
// 자녀(계정이 없는 가상 항목)가 "나이 어린 사람"으로 취급돼 목록 맨 아래로 밀려서,
// 목사님 가정 자녀 두 명이 부모와 10줄 떨어져 나오는 식이었습니다.
// → 아래 childrenOf / flattenWithChildren 로 자녀를 부모 바로 아래에 붙입니다.

/**
 * "자녀로 볼 사람"인지 판단합니다.
 * ① 계정이 없는 자녀(가상 항목)
 * ② **자녀가 커서 직접 가입한 경우** — 실제 계정이지만 가족에서의 역할이 '자녀'
 *    (이 경우도 부모 아래에 붙여야 가정이 흩어지지 않습니다)
 */
function isChildLike(m: UserProfile): boolean {
  return !!m.isDependent || m.familyRole === '자녀'
}

/** 이 가정(들)에 속한 자녀를 나이 많은 순으로 꺼냅니다. 이미 배치된 자녀는 건너뜁니다. */
function childrenOf(members: UserProfile[], scope: UserProfile[], claimed: Set<string>): UserProfile[] {
  const gids = new Set(members.map(m => m.familyGroupId).filter(Boolean) as string[])
  if (gids.size === 0) return []
  const kids = scope.filter(c =>
    isChildLike(c) && c.familyGroupId && gids.has(c.familyGroupId) && !claimed.has(c.id)
  )
  kids.forEach(k => claimed.add(k.id))
  return [...kids].sort((a, b) => {
    const d = ageOf(b) - ageOf(a)
    return d !== 0 ? d : (a.name || '').localeCompare(b.name || '', 'ko')
  })
}

/** 가정 묶음(부부/단독)을 한 줄 목록으로 펼치면서, 각 가정 뒤에 그 집 자녀를 이어 붙입니다. */
function flattenWithChildren(
  units: { members: UserProfile[]; sortAge: number }[],
  scope: UserProfile[],
  claimed: Set<string>
): UserProfile[] {
  return units.flatMap(u => [...u.members, ...childrenOf(u.members, scope, claimed)])
}

// 부부 묶기: 전달된 scope(현재 화면에 표시될 후보 목록) 안에 familyRole이 '부'/'모'인 두 사람이
// 같은 familyGroupId로 모두 존재할 때만 한 쌍으로 묶습니다. 배우자가 다른 라브리라 scope에
// 없으면 억지로 데려오지 않고 단독으로 취급합니다.
// (자녀 가상 항목은 여기서 제외하고, 나중에 부모 아래에 붙입니다)
function groupCouplesInScope(scope: UserProfile[]): { members: UserProfile[]; sortAge: number }[] {
  const paired = new Set<string>()
  const units: { members: UserProfile[]; sortAge: number }[] = []

  scope.filter(m => !isChildLike(m)).forEach(m => {
    if (paired.has(m.id)) return
    const isSpouseRole = m.familyRole === '부' || m.familyRole === '모'
    const spouse = isSpouseRole && m.familyGroupId
      ? scope.find(o => o.id !== m.id && !paired.has(o.id) && o.familyGroupId === m.familyGroupId && (o.familyRole === '부' || o.familyRole === '모'))
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
function sortUnitsByAge(units: { members: UserProfile[]; sortAge: number }[]) {
  return [...units].sort((a, b) => {
    if (a.sortAge !== b.sortAge) return b.sortAge - a.sortAge
    return (a.members[0]?.name || '').localeCompare(b.members[0]?.name || '', 'ko')
  })
}

interface AddressBookProps {
  addressBookEntries: UserProfile[]
  allUsers: UserProfile[]
}

// ── 주소록 (검색 + 편성상태 필터 + 상세 펼치기) ──
export default function AddressBook({ addressBookEntries, allUsers }: AddressBookProps) {
  const [addressFilter, setAddressFilter] = useState<string>('전체')
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [lightboxMember, setLightboxMember] = useState<UserProfile | null>(null)

  // 주소록 필터 (검색어 우선, 그 다음 편성상태 필터) + 필터별 정렬 규칙 적용
  const displayedMembers = useMemo(() => {
    const q = searchQuery.trim()
    // 🐛 과거 문제: `name.includes(검색어)` 뿐이라 어르신이 "ㄱ"을 입력해 김/강/고 성도를
    // 찾으려 하면 결과가 하나도 안 나왔습니다. → 초성 검색 지원(koreanSearch.ts)
    // 교회학교 그룹이 지정되지 않은 자녀는 주소록 목록에 넣지 않습니다.
    // (부모 카드의 "가족현황" 줄에는 이름이 그대로 나옵니다)
    const visibleEntries = addressBookEntries.filter(m => !m.isDependent || !!m.childLabriId)
    const base = q
      ? visibleEntries.filter(m => matchesKoreanSearch(m.name, q))
      : visibleEntries
    const activeFilter = ADDRESS_FILTERS.find(f => f.key === addressFilter) || ADDRESS_FILTERS[0]
    const filtered = base.filter(activeFilter.match)

    // ① "자녀" 필터: 나이 많은 순(생일 빠른 순)으로 정렬
    if (addressFilter === '자녀') {
      return [...filtered].sort((a, b) => {
        const diff = ageOf(b) - ageOf(a)
        return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ko')
      })
    }

    // ② "전체" 필터: 목사님 → 사모님 부부를 반드시 이 순서로 최상단에 고정, 나머지는 나이순(부부는 묶어서)
    if (addressFilter === '전체') {
      const pastor = filtered.filter(m => !m.isDependent && m.duty === '목사')
      const pastorWife = filtered.filter(m => !m.isDependent && m.duty === '사모')
      const pinnedAdults = [...pastor, ...pastorWife]
      const pinnedIds = new Set(pinnedAdults.map(m => m.id))
      const claimed = new Set<string>()
      // 목사님 가정 자녀도 부모 바로 아래에 붙입니다.
      const pinnedBlock = [...pinnedAdults, ...childrenOf(pinnedAdults, filtered, claimed)]
      const rest = filtered.filter(m => !pinnedIds.has(m.id) && !claimed.has(m.id))
      const restSorted = flattenWithChildren(sortUnitsByAge(groupCouplesInScope(rest)), rest, claimed)
      // 부모를 이 화면에서 못 찾은 자녀는 맨 뒤에 나이순으로 둡니다.
      const orphanKids = rest.filter(m => isChildLike(m) && !claimed.has(m.id))
        .sort((a, b) => (ageOf(b) - ageOf(a)) || a.name.localeCompare(b.name, 'ko'))
      return [...pinnedBlock, ...restSorted, ...orphanKids]
    }

    // ③ 라브리1/2/3/미정 필터: 관리자 또는 라브리리더 부부를 최상단에 고정
    //    (리더가 있으면 리더 우선, 리더와 관리자가 함께 있으면 관리자는 일반 성도처럼 취급)
    //    나머지는 나이순(부부는 같은 필터 안에 함께 있을 때만 묶음 — 라브리가 다르면 억지로 묶지 않음)
    if (LABRI_FILTER_KEYS.includes(addressFilter)) {
      const leaders = filtered.filter(m => !m.isDependent && m.role === 'LEADER')
      const pinnedBase = leaders.length > 0 ? leaders : filtered.filter(m => !m.isDependent && m.role === 'ADMIN')

      const pinnedIds = new Set<string>()
      const pinnedBlock: UserProfile[] = []
      pinnedBase.forEach(lead => {
        if (pinnedIds.has(lead.id)) return
        const spouse = (lead.familyRole === '부' || lead.familyRole === '모') && lead.familyGroupId
          ? filtered.find(o => o.id !== lead.id && !pinnedIds.has(o.id) && o.familyGroupId === lead.familyGroupId && (o.familyRole === '부' || o.familyRole === '모'))
          : undefined
        const unit = spouse
          ? [lead, spouse].sort((a, b) => (FAMILY_ROLE_ORDER[a.familyRole || ''] || 10) - (FAMILY_ROLE_ORDER[b.familyRole || ''] || 10))
          : [lead]
        unit.forEach(u => pinnedIds.add(u.id))
        pinnedBlock.push(...unit)
      })

      const claimed = new Set<string>()
      const pinnedWithKids = [...pinnedBlock, ...childrenOf(pinnedBlock, filtered, claimed)]
      const rest = filtered.filter(m => !pinnedIds.has(m.id) && !claimed.has(m.id))
      const restSorted = flattenWithChildren(sortUnitsByAge(groupCouplesInScope(rest)), rest, claimed)
      const orphanKids = rest.filter(m => isChildLike(m) && !claimed.has(m.id))
        .sort((a, b) => (ageOf(b) - ageOf(a)) || a.name.localeCompare(b.name, 'ko'))
      return [...pinnedWithKids, ...restSorted, ...orphanKids]
    }

    return filtered
  }, [addressBookEntries, addressFilter, searchQuery])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="성도 이름으로 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2.5 bg-white rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87] shadow-2xs text-gray-900 font-medium"
        />
        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">✕</button>}
      </div>

      {/* 검색 중에도 필터 칩을 유지합니다. 예전에는 검색창에 글자를 넣는 순간
          칩 줄이 통째로 사라져서 화면이 손가락 밑에서 재구성됐습니다. */}
      {(
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl text-2xs font-bold overflow-x-auto">
          {ADDRESS_FILTERS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setAddressFilter(opt.key)}
              className={`flex-1 py-2 rounded-lg transition-all whitespace-nowrap ${addressFilter === opt.key ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* 선택한 그룹에 몇 명이 있는지 바로 보여줍니다 */}
      {displayedMembers.length > 0 && (
        <p className="text-2xs text-gray-400 font-medium px-1">
          {(() => {
            const total = displayedMembers.length
            // 자녀 탭은 성도 수를 따로 보여줄 이유가 없어 "자녀 총 N명"만 표시합니다.
            if (addressFilter === '자녀' && !searchQuery.trim()) return `자녀 총 ${total}명`
            const scope = searchQuery.trim() ? '검색 결과' : addressFilter === '전체' ? '전체' : addressFilter
            const kids = displayedMembers.filter(m => isChildLike(m)).length
            return kids > 0
              ? `${scope} 총 ${total}명 (성도 ${total - kids}명 · 자녀 ${kids}명)`
              : `${scope} 총 ${total}명`
          })()}
        </p>
      )}

      <div className="space-y-2">
        {displayedMembers.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400">
            {searchQuery.trim()
              ? `'${searchQuery.trim()}' 검색 결과가 없습니다.`
              : '표시할 성도가 없습니다.'}
          </div>
        )}
        {displayedMembers.map(member => (
          // 자녀는 살짝 들여쓰고 옅게 표시해 "이 집 아이"임이 한눈에 보이게 합니다.
          <div
            key={member.id}
            className={`bg-white rounded-2xl border shadow-2xs overflow-hidden ${
              isChildLike(member) ? 'ml-5 border-gray-100/70 bg-gray-50/40' : 'border-gray-100'
            }`}
          >
            <button onClick={() => setExpandedMember(expandedMember === member.id ? null : member.id)} className="w-full p-3.5 flex items-center justify-between text-left">
              <div className="flex items-center gap-2.5">
                <div
                  onClick={member.avatarUrl ? (e) => { e.stopPropagation(); setLightboxMember(member) } : undefined}
                  className={`w-12 h-12 rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden ${member.avatarUrl ? 'cursor-pointer' : ''}`}
                >
                  {member.avatarUrl ? <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" /> : getInitials(member.name)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900 text-sm">{member.name}</span>
                    <span className="text-2xs text-gray-400">{member.duty}</span>
                  </div>
                  {member.isDependent ? (
                    // "출석 미적용"은 부서 이름이 아니므로 부서 칸을 비워 둡니다.
                    getChildGroupLabel(member.childLabriId) && (
                      <span className="text-2xs text-[#335f87]">{getChildGroupLabel(member.childLabriId)}</span>
                    )
                  ) : (
                    member.labriId && member.labriId !== '미정' && (
                      <span className="text-2xs text-[#335f87]">{member.labriId}</span>
                    )
                  )}
                </div>
              </div>
              <ChevronRight size={14} className={`text-gray-400 transition-transform ${expandedMember === member.id ? 'rotate-90' : ''}`} />
            </button>
            {expandedMember === member.id && (
              <div className="px-4 pb-3.5 space-y-2 text-xs border-t border-gray-50 pt-2">
                {member.isDependent ? (
                  <>
                    <div className="flex items-center gap-2 text-gray-600"><Users size={12} className="text-gray-400" /><span>{member.parentName}</span></div>
                    {member.birthday && <div className="flex items-center gap-2 text-gray-600"><span className="w-3 text-center text-2xs">🎂</span><span>{formatBirthdayDisplay(member.birthday)}</span></div>}
                  </>
                ) : (
                  <>
                    {/* 연락처 — 눌러서 바로 전화를 걸 수 있습니다 */}
                    {member.phone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="w-3 text-center text-2xs">📞</span>
                        <a href={`tel:${member.phone}`} className="font-bold text-[#335f87] hover:underline">{member.phone}</a>
                      </div>
                    )}
                    {member.birthday && <div className="flex items-center gap-2 text-gray-600"><span className="w-3 text-center text-2xs">🎂</span><span>{formatBirthdayDisplay(member.birthday)}</span></div>}
                    {buildFamilyStatusText(member, allUsers) && <div className="flex items-center gap-2 text-gray-600"><Users size={12} className="text-gray-400" /><span>{buildFamilyStatusText(member, allUsers)}</span></div>}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {lightboxMember?.avatarUrl && (
        <ProfileImageLightbox
          src={lightboxMember.avatarUrl}
          alt={lightboxMember.name}
          onClose={() => setLightboxMember(null)}
        />
      )}
    </div>
  )
}
