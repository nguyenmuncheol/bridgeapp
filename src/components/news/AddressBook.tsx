'use client'

import { useState, useMemo, Fragment } from 'react'
import { ChevronRight, Users, Search, Triangle, UserCheck } from 'lucide-react'
import { UserProfile, getInitials } from '../../lib/mockData'
import {
  buildFamilyStatusText, getChildGroupLabel, getSharedChildren, CHILD_LABRI_NO_ATTENDANCE,
  isChildLike, sortChildrenByDepartment, getDepartmentRank, sortAdultsForGroupDisplay, groupCouplesInScope, sortUnitsByAge,
} from '../../lib/familyInfo'
import { formatBirthdayMonthDayOnly } from '../../lib/dateUtils'
import { matchesKoreanSearch } from '../../lib/koreanSearch'
import ProfileImageLightbox from '../ProfileImageLightbox'
import { useCachedQuery } from '../../lib/dataCache'
import { dbFetchAllNamedVisitors, VisitorRecordRow } from '../../lib/db'

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

interface AddressBookProps {
  addressBookEntries: UserProfile[]
  allUsers: UserProfile[]
  currentUser?: UserProfile
}

// ── 주소록 (검색 + 편성상태 필터 + 상세 펼치기) ──
export default function AddressBook({ addressBookEntries, allUsers, currentUser }: AddressBookProps) {
  const [addressFilter, setAddressFilter] = useState<string>('전체')
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [lightboxMember, setLightboxMember] = useState<UserProfile | null>(null)

  // 관리자, 리더, 선생님 권한 확인
  const canSeeVisitors = currentUser && ['ADMIN', 'LEADER', 'TEACHER'].includes(currentUser.role)

  // 기명 방문자 전체 기록 조회 (미정 탭에서 권한자에게만 표시)
  const { data: allNamedVisitors } = useCachedQuery(
    'allNamedVisitors',
    () => dbFetchAllNamedVisitors(),
    { enabled: !!canSeeVisitors }
  )

  // 기명 방문자별 총 출석 횟수 및 정보 요약
  interface VisitorSummary {
    key: string
    name: string
    category: string
    visitCount: number
    recentDate: string
    dates: string[]
    notes: { date: string; note: string }[]
  }

  const visitorSummaries = useMemo<VisitorSummary[]>(() => {
    if (!allNamedVisitors || allNamedVisitors.length === 0) return []
    const map = new Map<string, { name: string; category: string; dates: string[]; notes: { date: string; note: string }[] }>()

    allNamedVisitors.forEach((v: VisitorRecordRow) => {
      if (!v.name) return
      const k = `${v.name.trim()}__${v.category}`
      const existing = map.get(k)
      if (existing) {
        existing.dates.push(v.date_str)
        if (v.note && v.note.trim()) {
          existing.notes.push({ date: v.date_str, note: v.note.trim() })
        }
      } else {
        map.set(k, {
          name: v.name.trim(),
          category: v.category,
          dates: [v.date_str],
          notes: v.note && v.note.trim() ? [{ date: v.date_str, note: v.note.trim() }] : []
        })
      }
    })

    return Array.from(map.entries()).map(([key, info]) => {
      const sortedDates = [...info.dates].sort().reverse()
      return {
        key,
        name: info.name,
        category: info.category,
        visitCount: info.dates.length,
        recentDate: sortedDates[0],
        dates: sortedDates,
        notes: info.notes.sort((a, b) => b.date.localeCompare(a.date))
      }
    }).sort((a, b) => {
      // 1. 최근 방문일 내림차순
      if (a.recentDate !== b.recentDate) return b.recentDate.localeCompare(a.recentDate)
      // 2. 방문 횟수 내림차순
      if (a.visitCount !== b.visitCount) return b.visitCount - a.visitCount
      // 3. 이름 가나다순
      return a.name.localeCompare(b.name, 'ko')
    })
  }, [allNamedVisitors])

  // 검색어가 적용된 방문자 목록 (미정 탭에서 표시용)
  const filteredVisitors = useMemo(() => {
    if (!canSeeVisitors || addressFilter !== '미정') return []
    const q = searchQuery.trim()
    if (!q) return visitorSummaries
    return visitorSummaries.filter(v => matchesKoreanSearch(v.name, q) || matchesKoreanSearch(v.category, q))
  }, [canSeeVisitors, addressFilter, searchQuery, visitorSummaries])

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

      return sortChildrenByDepartment(filteredKids)
    }

    // ② 성인 성도 중심 목록 (전체 / 라브리1~3 / 미정): 자녀 카드는 숨기고 성인 카드만 렌더링
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
          className="w-full pl-8 pr-3 py-2.5 bg-white rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-brand shadow-2xs text-gray-900 font-medium"
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
                addressFilter === opt.key ? 'bg-white text-brand shadow-xs font-bold' : 'text-gray-500 hover:text-gray-700'
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
            if (addressFilter === '미정' && canSeeVisitors && filteredVisitors.length > 0) {
              return `검색 결과: 성도 ${displayedMembers.length}명 + 방문자 ${filteredVisitors.length}명`
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
          if (addressFilter === '미정' && canSeeVisitors && visitorSummaries.length > 0) {
            return `미정 성도 총 ${displayedMembers.length}명 (방문자 ${visitorSummaries.length}명 등록됨)`
          }
          return `${addressFilter} 성도 총 ${displayedMembers.length}명`
        })()}
      </p>

      <div className="space-y-2">
        {displayedMembers.length === 0 && filteredVisitors.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400">
            {searchQuery.trim()
              ? `'${searchQuery.trim()}' 검색 결과가 없습니다.`
              : '표시할 성도가 없습니다.'}
          </div>
        )}

        {/* ── 등록 교인 명단 ── */}
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
                    <span className="text-2xs font-semibold text-brand bg-sky-50 px-1.5 py-0.5 rounded-md">
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
                        className={`w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm overflow-hidden ${member.avatarUrl ? 'cursor-pointer' : ''}`}
                      >
                        {member.avatarUrl ? <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" loading="lazy" decoding="async" /> : getInitials(member.name)}
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
                          <span className="text-2xs text-brand font-medium">{getChildGroupLabel(member.childLabriId)}</span>
                        )
                      ) : (
                        member.labriId && member.labriId !== '미정' && (
                          <span className="text-2xs text-brand font-medium">{member.labriId}</span>
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
                        {member.phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="w-3 text-center text-2xs">📞</span>
                            <a href={`tel:${member.phone}`} className="font-bold text-brand hover:underline">{member.phone}</a>
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

        {/* ── [미정 탭 전용] 관리자/리더/교사에게만 보이는 기명 방문자 섹션 ── */}
        {addressFilter === '미정' && canSeeVisitors && filteredVisitors.length > 0 && (
          <div className="pt-4 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                🏷️ 교회 방문자 명단 ({filteredVisitors.length}명)
              </span>
              <span className="text-3xs text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                관리자·리더·교사만 확인 가능
              </span>
            </div>

            {filteredVisitors.map(v => (
              <div
                key={v.key}
                className="bg-amber-50/40 rounded-2xl border border-amber-200/80 shadow-2xs overflow-hidden"
              >
                <button
                  onClick={() => setExpandedMember(expandedMember === `vis_${v.key}` ? null : `vis_${v.key}`)}
                  className="w-full p-3.5 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                      {getInitials(v.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{v.name}</span>
                        <span className="text-2xs font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          🏷️방문자
                        </span>
                        <span className="text-2xs text-gray-500 font-medium">
                          ({v.category})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {/* 작은 버튼식 출석 횟수 표시 */}
                        <span className="inline-flex items-center gap-0.5 text-2xs font-black bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded-full shadow-2xs">
                          <UserCheck size={11} className="text-amber-600" />
                          {v.visitCount}회 출석
                        </span>
                        <span className="text-3xs text-gray-400">
                          최근 {v.recentDate}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={14} className={`text-gray-400 transition-transform ${expandedMember === `vis_${v.key}` ? 'rotate-90' : ''}`} />
                </button>

                {expandedMember === `vis_${v.key}` && (
                  <div className="px-4 pb-3.5 space-y-2.5 text-xs border-t border-amber-100/80 pt-2.5 bg-white/60">
                    <div className="space-y-1">
                      <div className="text-2xs text-gray-600 font-bold">
                        🗓️ 출석 일자 기록 ({v.dates.length}회):
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {v.dates.map(dateStr => (
                          <span
                            key={dateStr}
                            className="px-2 py-0.5 bg-amber-100/70 border border-amber-200 text-amber-900 rounded-md text-3xs font-semibold"
                          >
                            {dateStr}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 특이사항 목록 */}
                    {v.notes.length > 0 && (
                      <div className="pt-2 border-t border-amber-100/80 space-y-1.5">
                        <div className="text-2xs text-amber-900 font-bold flex items-center gap-1">
                          <span>📝 특이사항 ({v.notes.length}건):</span>
                        </div>
                        <div className="space-y-1">
                          {v.notes.map((n, idx) => (
                            <div
                              key={idx}
                              className="p-2 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-gray-800 leading-relaxed"
                            >
                              <div className="flex items-center gap-1 text-3xs font-bold text-amber-800 mb-0.5">
                                <span>📅 {n.date}</span>
                              </div>
                              <div className="whitespace-pre-wrap">{n.note}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
