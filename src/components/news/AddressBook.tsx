'use client'

import { useState, useMemo, Fragment } from 'react'
import { ChevronRight, Users, Search, Triangle } from 'lucide-react'
import { UserProfile, getInitials } from '../../lib/mockData'
import {
  buildFamilyStatusText, getChildGroupLabel, getSharedChildren, CHILD_LABRI_NO_ATTENDANCE,
  isChildLike, sortChildrenForGroupDisplay, sortChildrenByDepartment, getDepartmentRank, sortAdultsForGroupDisplay, groupCouplesInScope, sortUnitsByAge,
} from '../../lib/familyInfo'
import { formatBirthdayMonthDayOnly } from '../../lib/dateUtils'
import { matchesKoreanSearch } from '../../lib/koreanSearch'
import ProfileImageLightbox from '../ProfileImageLightbox'

// 주소록 편성상태 필터: 라브리1~3 / 교회학교 / 라브리 미정(❤️)
const ADDRESS_FILTERS: { key: string; label: string; match: (m: UserProfile) => boolean }[] = [
  { key: '전체', label: '전체', match: () => true },
  { key: '라브리1', label: '라브리1', match: m => m.labriId === '라브리1' },
  { key: '라브리2', label: '라브리2', match: m => m.labriId === '라브리2' },
  { key: '라브리3', label: '라브리3', match: m => m.labriId === '라브리3' },
  // 교회학교: 부서가 지정되어 있고 출석미적용이 아닌 자녀만 매칭
  { key: '교회학교', label: '교회학교', match: m => (!!m.isDependent || m.familyRole === '자녀') && !!m.childLabriId && m.childLabriId !== CHILD_LABRI_NO_ATTENDANCE },
  { key: '미정', label: '❤️', match: m => !m.isDependent && m.familyRole !== '자녀' && (!m.labriId || m.labriId === '미정') },
]

// 라브리/미정 필터에서 "관리자 or 라브리리더 부부 최상단 고정" 규칙이 적용되는 필터 키 목록
const LABRI_FILTER_KEYS = ['라브리1', '라브리2', '라브리3', '미정']

// 나이 계산·자녀 판별·부부 묶음 정렬은 familyInfo.ts의 공용 함수를 씁니다
// (출석체크 명단도 같은 함수를 써서 두 화면의 정렬이 어긋나지 않게 합니다).

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
    const isChurchSchoolTab = addressFilter === '교회학교'

    // ① "교회학교" 탭: 자녀 가상 항목 중 출석미적용이 아닌 자녀만 나이순 정렬하여 단독 표시
    if (isChurchSchoolTab) {
      const kidsEntries = addressBookEntries.filter(m =>
        isChildLike(m) && !!m.childLabriId && m.childLabriId !== CHILD_LABRI_NO_ATTENDANCE
      )
      const filteredKids = q
        ? kidsEntries.filter(m => matchesKoreanSearch(m.name, q) || (m.parentName && matchesKoreanSearch(m.parentName, q)))
        : kidsEntries

      // ① "교회학교" 탭: 중고등부 -> 초등부 -> 유아유치부 -> 영아부 순으로 부서별로 모아서 나열 (생일 미입력자 포함)
      return sortChildrenByDepartment(filteredKids)
    }

    // ② 성인 성도 중심 목록 (전체 / 라브리1~3 / 미정): 자녀 카드는 숨기고 성인 카드만 렌더링
    // 검색 시: 본인 이름뿐 아니라 자녀 이름으로도 부모 성도를 찾을 수 있도록 매칭
    const adultEntries = addressBookEntries.filter(m => !isChildLike(m))
    const filteredAdults = q
      ? adultEntries.filter(m => {
          if (matchesKoreanSearch(m.name, q) || (m.duty && matchesKoreanSearch(m.duty, q))) return true
          const sharedKids = getSharedChildren(m, allUsers)
          return sharedKids.some(k => matchesKoreanSearch(k.name, q))
        })
      : adultEntries

    const activeFilter = ADDRESS_FILTERS.find(f => f.key === addressFilter) || ADDRESS_FILTERS[0]
    const filtered = filteredAdults.filter(activeFilter.match)

    // "전체" 필터: 담임목사님 부부 최상단 고정, 나머지는 나이순(부부는 묶어서)
    if (addressFilter === '전체') {
      const isSeniorPastor = (m: UserProfile) => !m.isDependent && (m.name === '정제호' || m.duty?.includes('목사'))
      const isPastorsWife = (m: UserProfile) => !m.isDependent && (m.name === '임혜영' || m.duty?.includes('사모'))

      const pastor = filtered.filter(isSeniorPastor).sort((a, b) => {
        if (a.name === '정제호') return -1
        if (b.name === '정제호') return 1
        return 0
      })
      const pastorWife = filtered.filter(isPastorsWife).sort((a, b) => {
        if (a.name === '임혜영') return -1
        if (b.name === '임혜영') return 1
        return 0
      })
      const pinnedAdults = [...pastor, ...pastorWife]
      const pinnedIds = new Set(pinnedAdults.map(m => m.id))
      const rest = filtered.filter(m => !pinnedIds.has(m.id))
      const restSorted = sortUnitsByAge(groupCouplesInScope(rest)).flatMap(u => u.members)
      return [...pinnedAdults, ...restSorted]
    }

    // 라브리1/2/3/미정 필터: 해당 라브리 리더 부부(없으면 관리자 부부, 없으면 목사님 부부) 최상단 고정, 나머지는 나이순
    // (출석체크 명단도 같은 함수를 씁니다 — sortAdultsForGroupDisplay in familyInfo.ts)
    if (LABRI_FILTER_KEYS.includes(addressFilter)) {
      return sortAdultsForGroupDisplay(filtered)
    }

    return filtered
  }, [addressBookEntries, addressFilter, searchQuery, allUsers])

  // 전체 통계 카운팅 (출석미적용 자녀는 교회학교 카운트에서 제외)
  const countingStats = useMemo(() => {
    const totalAdults = addressBookEntries.filter(m => !isChildLike(m)).length
    const kids = addressBookEntries.filter(m =>
      isChildLike(m) && !!m.childLabriId && m.childLabriId !== CHILD_LABRI_NO_ATTENDANCE
    )
    const totalChurchSchoolKids = kids.length

    const deptList = [
      { name: '중고등부', count: kids.filter(m => getDepartmentRank(m.childLabriId) === 0).length },
      { name: '초등부', count: kids.filter(m => getDepartmentRank(m.childLabriId) === 1).length },
      { name: '유아·유치부', count: kids.filter(m => getDepartmentRank(m.childLabriId) === 2).length },
      { name: '영아부', count: kids.filter(m => getDepartmentRank(m.childLabriId) === 3).length },
    ]

    const churchSchoolBreakdown = deptList
      .filter(d => d.count > 0)
      .map(d => `${d.name} ${d.count}명`)
      .join(', ')

    return {
      adults: totalAdults,
      churchSchool: totalChurchSchoolKids,
      churchSchoolBreakdown,
      total: totalAdults + totalChurchSchoolKids
    }
  }, [addressBookEntries])

  // 교회학교 탭 검색 시 필터링된 결과의 부서별 인원 계산용
  const displayedChurchSchoolBreakdown = useMemo(() => {
    if (addressFilter !== '교회학교') return ''
    const deptList = [
      { name: '중고등부', count: displayedMembers.filter(m => getDepartmentRank(m.childLabriId) === 0).length },
      { name: '초등부', count: displayedMembers.filter(m => getDepartmentRank(m.childLabriId) === 1).length },
      { name: '유아·유치부', count: displayedMembers.filter(m => getDepartmentRank(m.childLabriId) === 2).length },
      { name: '영아부', count: displayedMembers.filter(m => getDepartmentRank(m.childLabriId) === 3).length },
    ]
    return deptList
      .filter(d => d.count > 0)
      .map(d => `${d.name} ${d.count}명`)
      .join(', ')
  }, [addressFilter, displayedMembers])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="성도 또는 자녀 이름으로 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2.5 bg-white rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87] shadow-2xs text-gray-900 font-medium"
        />
        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">✕</button>}
      </div>

      {/* 필터 칩 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl text-2xs font-bold w-full">
        {ADDRESS_FILTERS.map(opt => {
          const flexRatio =
            opt.key === '미정' ? 1.0 :
            opt.key === '전체' ? 1.2 :
            opt.key === '교회학교' ? 2.0 :
            1.8

          return (
            <button
              key={opt.key}
              onClick={() => setAddressFilter(opt.key)}
              style={{ flex: `${flexRatio} ${flexRatio} 0%` }}
              className={`py-2 px-1 rounded-lg transition-all whitespace-nowrap text-center truncate ${
                addressFilter === opt.key ? 'bg-white text-[#335f87] shadow-xs font-bold' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* 인원 카운팅 */}
      <p className="text-2xs text-gray-400 font-medium px-1">
        {(() => {
          if (searchQuery.trim()) {
            if (addressFilter === '교회학교') {
              return displayedChurchSchoolBreakdown
                ? `검색 결과 총 ${displayedMembers.length}명 (${displayedChurchSchoolBreakdown})`
                : `검색 결과 총 ${displayedMembers.length}명`
            }
            return `검색 결과 총 ${displayedMembers.length}명`
          }
          if (addressFilter === '교회학교') {
            return countingStats.churchSchoolBreakdown
              ? `교회학교 총 ${displayedMembers.length}명 (${countingStats.churchSchoolBreakdown})`
              : `교회학교 총 ${displayedMembers.length}명`
          }
          if (addressFilter === '전체') {
            return `전체 총 ${countingStats.total}명 (성인 ${countingStats.adults}명 + 교회학교 ${countingStats.churchSchool}명)`
          }
          return `${addressFilter} 성도 총 ${displayedMembers.length}명`
        })()}
      </p>

      <div className="space-y-2">
        {displayedMembers.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400">
            {searchQuery.trim()
              ? `'${searchQuery.trim()}' 검색 결과가 없습니다.`
              : '표시할 성도가 없습니다.'}
          </div>
        )}
        {displayedMembers.map((member, index) => {
          const isChurchSchoolTab = addressFilter === '교회학교'
          const currentDept = getChildGroupLabel(member.childLabriId) || '기타'
          const prevDept = index > 0 ? (getChildGroupLabel(displayedMembers[index - 1].childLabriId) || '기타') : null
          const isNewDeptSection = isChurchSchoolTab && currentDept !== prevDept
          const currentDeptCount = isChurchSchoolTab
            ? displayedMembers.filter(m => (getChildGroupLabel(m.childLabriId) || '기타') === currentDept).length
            : 0

          return (
            <Fragment key={member.id}>
              {isNewDeptSection && (
                <div className="pt-2.5 pb-1 px-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-700">
                      {currentDept === '중고등부' ? '🏫' : currentDept === '초등부' ? '🎒' : currentDept.includes('유아') ? '🎨' : '🍼'} {currentDept}
                    </span>
                    <span className="text-2xs font-semibold text-[#335f87] bg-sky-50 px-1.5 py-0.5 rounded-md">
                      {currentDeptCount}명
                    </span>
                  </div>
                </div>
              )}
              <div
                className={`bg-white rounded-2xl border shadow-2xs overflow-hidden ${
                  isChildLike(member) ? 'border-gray-100/80 bg-gray-50/40' : 'border-gray-100'
                }`}
              >
                <button onClick={() => setExpandedMember(expandedMember === member.id ? null : member.id)} className="w-full p-3.5 flex items-center justify-between text-left">
                  <div className="flex items-center gap-2.5">
                    <div className="relative shrink-0">
                      <div
                        onClick={member.avatarUrl ? (e) => { e.stopPropagation(); setLightboxMember(member) } : undefined}
                        className={`w-12 h-12 rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold text-sm overflow-hidden ${member.avatarUrl ? 'cursor-pointer' : ''}`}
                      >
                        {member.avatarUrl ? <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" /> : getInitials(member.name)}
                      </div>
                      {member.isUnregistered && (
                        <span
                          title="미가입 성도"
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-xs ring-1 ring-white"
                        >
                          <Triangle size={9} className="text-amber-400" fill="currentColor" strokeWidth={0} />
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{member.name}</span>
                        <span className="text-2xs text-gray-400">{member.duty}</span>
                      </div>
                      {member.isDependent ? (
                        getChildGroupLabel(member.childLabriId) && (
                          <span className="text-2xs text-[#335f87] font-medium">{getChildGroupLabel(member.childLabriId)}</span>
                        )
                      ) : (
                        member.labriId && member.labriId !== '미정' && (
                          <span className="text-2xs text-[#335f87] font-medium">{member.labriId}</span>
                        )
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className={`text-gray-400 transition-transform ${expandedMember === member.id ? 'rotate-90' : ''}`} />
                </button>
                {expandedMember === member.id && (
                  <div className="px-4 pb-3.5 space-y-2 text-xs border-t border-gray-50 pt-2.5">
                    {member.isUnregistered ? (
                      <p className="text-2xs text-gray-300">앱에 가입하지 않아 등록된 정보가 없습니다.</p>
                    ) : member.isDependent ? (
                      <>
                        <div className="flex items-center gap-2 text-gray-600"><Users size={12} className="text-gray-400" /><span>{member.parentName}</span></div>
                        {member.birthday && <div className="flex items-center gap-2 text-gray-600"><span className="w-3 text-center text-2xs">🎂</span><span>{formatBirthdayMonthDayOnly(member.birthday)}</span></div>}
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
                        {member.birthday && <div className="flex items-center gap-2 text-gray-600"><span className="w-3 text-center text-2xs">🎂</span><span>{formatBirthdayMonthDayOnly(member.birthday)}</span></div>}
                        {buildFamilyStatusText(member, allUsers) && <div className="flex items-center gap-2 text-gray-600"><Users size={12} className="text-gray-400" /><span>{buildFamilyStatusText(member, allUsers)}</span></div>}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          )
        })}
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
