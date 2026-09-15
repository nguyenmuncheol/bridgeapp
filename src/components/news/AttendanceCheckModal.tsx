'use client'

import { useState, useEffect, useMemo } from 'react'
import { CheckSquare, Plus, Trash2 } from 'lucide-react'
import { UserProfile, isApprovedMember, canEditChildAttendance } from '../../lib/mockData'
import {
  dbFetchAttendanceRecords, dbSaveAttendanceRecords,
  dbFetchChildAttendanceRecords, dbSaveChildAttendanceRecords,
  dbFetchVisitorRecords, dbSaveVisitorCounters, dbAddNamedVisitor, dbDeleteVisitorRecord,
  dbFetchAllNamedVisitors, AnonymousVisitorCategory, NamedVisitorCategory
} from '../../lib/db'
import { CHILD_ATTENDANCE_GROUPS, buildDependentEntries, sortAdultsForGroupDisplay, sortChildrenForGroupDisplay, parseTeachGroups } from '../../lib/familyInfo'
import { useCachedQuery } from '../../lib/dataCache'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'

const ABSENCE_TAGS = ['출근/출장', '여행', '아파요', '가족방문']
const ADULT_GROUPS = ['라브리1', '라브리2', '라브리3', '미정']
const ANONYMOUS_CATEGORIES: AnonymousVisitorCategory[] = ['성인', '학생']
const NAMED_VISITOR_CATEGORIES: NamedVisitorCategory[] = ['성인', '중고등부', '초등부', '유아유치부']

interface AttendanceCheckModalProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

/** 출석을 체크하는 자녀 그룹인지 ("출석 미적용"은 여기서 빠집니다) */
function isChildGroup(group: string): boolean {
  return (CHILD_ATTENDANCE_GROUPS as readonly string[]).includes(group)
}

// ── 출석체크 버튼 + 모달 (리더/관리자/선생님 전용, 자체 상태 관리) ──
export default function AttendanceCheckModal({ currentUser, allUsers }: AttendanceCheckModalProps) {
  const isLeader = currentUser.role === 'LEADER'
  const isAdmin = currentUser.role === 'ADMIN'
  const isTeacher = currentUser.role === 'TEACHER'
  const canCheck = canEditChildAttendance(currentUser.role)

  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  useModalDismiss(showAttendanceModal, () => setShowAttendanceModal(false))
  const [checkSubmitted, setCheckSubmitted] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // ── 교회학교 그룹이 지정된 자녀들 ──
  const childEntries = useMemo(
    () => buildDependentEntries(allUsers).filter(c => (CHILD_ATTENDANCE_GROUPS as readonly string[]).includes(c.childLabriId || '')),
    [allUsers]
  )

  // ── 내가 출석을 입력할 수 있는 그룹 목록 + [방문자] 탭 ──
  const availableGroups = useMemo(() => {
    const activeChildGroups = CHILD_ATTENDANCE_GROUPS.filter(g => childEntries.some(c => c.childLabriId === g))

    let groups: string[] = []
    if (isTeacher) {
      const mine = parseTeachGroups(currentUser.teachGroup)
      groups = mine.length > 0 ? activeChildGroups.filter(g => mine.includes(g)) : [...activeChildGroups]
    } else if (isAdmin) {
      groups = [...ADULT_GROUPS, ...activeChildGroups]
    } else if (isLeader) {
      groups = [currentUser.labriId || '미정']
    }

    if (groups.length > 0) {
      return [...groups, '방문자']
    }
    return []
  }, [isTeacher, isAdmin, isLeader, currentUser.teachGroup, currentUser.labriId, childEntries])

  const [selectedGroupOverride, setSelectedGroupOverride] = useState<string | null>(null)
  const selectedGroup =
    selectedGroupOverride && availableGroups.includes(selectedGroupOverride)
      ? selectedGroupOverride
      : availableGroups[0] ?? ''
  const setSelectedGroup = setSelectedGroupOverride

  const childMode = isChildGroup(selectedGroup)
  const isVisitorTab = selectedGroup === '방문자'

  // 가장 최근 지난 주일 날짜 계산
  const computeTargetSunday = () => {
    const d = new Date()
    const dayOfWeek = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToLastSunday = dayOfWeek === 0 ? 0 : dayOfWeek
    const lastSun = new Date(d)
    lastSun.setDate(d.getDate() - daysToLastSunday)
    return `${lastSun.getFullYear()}-${String(lastSun.getMonth() + 1).padStart(2, '0')}-${String(lastSun.getDate()).padStart(2, '0')}`
  }
  const [targetSundayDateStr, setTargetSundayDateStr] = useState(computeTargetSunday)
  useEffect(() => {
    const sync = () => setTargetSundayDateStr(computeTargetSunday())
    const timer = setInterval(sync, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const targetSundayShortLabel = useMemo(() => {
    const parts = targetSundayDateStr.split('-')
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`
  }, [targetSundayDateStr])

  // 주소록 및 출석체크: 승인대기자 및 쿠폰 관리자(COUPON) 제외
  const members = useMemo(
    () => allUsers.filter(u => isApprovedMember(u.role) && u.role !== 'COUPON'),
    [allUsers]
  )

  // ── DB에서 출석 기록 로드 ──
  const { data: rawRecords, refetch: refetchAttendance } = useCachedQuery(
    `attendanceRecords:${targetSundayDateStr}`,
    () => dbFetchAttendanceRecords(targetSundayDateStr),
    { enabled: canCheck && !isTeacher }
  )
  const { data: rawChildRecords, refetch: refetchChildAttendance } = useCachedQuery(
    `childAttendanceRecords:${targetSundayDateStr}`,
    () => dbFetchChildAttendanceRecords(targetSundayDateStr),
    { enabled: canCheck }
  )

  // ── 방문자 출석 기록 로드 ──
  const { data: visitorRecords, refetch: refetchVisitorRecords } = useCachedQuery(
    `visitorRecords:${targetSundayDateStr}`,
    () => dbFetchVisitorRecords(targetSundayDateStr),
    { enabled: canCheck }
  )

  // ── 최근 기명 방문자 전체 (자동완성/추천용) ──
  const { data: allNamedVisitors, refetch: refetchAllNamedVisitors } = useCachedQuery(
    'allNamedVisitors',
    () => dbFetchAllNamedVisitors(),
    { enabled: canCheck }
  )

  // ── 방문자 익명 카운터 ──
  // 🐛 과거 버그: DB 기록을 useEffect + setState로 로컬 상태에 "복사"해 두었더니,
  //    기명 방문자를 추가·삭제해 목록을 다시 불러올 때마다 그 효과가 다시 돌면서
  //    아직 저장하지 않은 카운터 입력이 DB 값으로 되돌아갔습니다.
  // → 출석 체크(selectionsOverride)와 똑같이, DB 값을 그대로 파생시키고
  //   사용자가 손댄 경우에만 override를 덮어씌우는 방식으로 바꿉니다.
  const derivedVisitorCounters = useMemo<Record<AnonymousVisitorCategory, number>>(() => {
    const counts: Record<AnonymousVisitorCategory, number> = { '성인': 0, '학생': 0 }
    ;(visitorRecords || []).forEach(r => {
      if (!r.name && (r.category === '성인' || r.category === '학생')) {
        counts[r.category as AnonymousVisitorCategory] = r.count
      }
    })
    return counts
  }, [visitorRecords])

  // override에 날짜를 함께 담아 둡니다. 주일을 바꾸면 이전 주일에서 만지던 숫자가
  // 따라오지 않고 자동으로 그 주일의 DB 값으로 돌아갑니다.
  const [visitorCountersOverride, setVisitorCountersOverride] =
    useState<{ dateStr: string; counters: Record<AnonymousVisitorCategory, number> } | null>(null)

  const visitorCounters =
    visitorCountersOverride && visitorCountersOverride.dateStr === targetSundayDateStr
      ? visitorCountersOverride.counters
      : derivedVisitorCounters

  /** 익명 카운터 증감 (+1 / -1). 0 아래로는 내려가지 않습니다. */
  const adjustVisitorCounter = (cat: AnonymousVisitorCategory, delta: number) => {
    const base = visitorCounters
    setVisitorCountersOverride({
      dateStr: targetSundayDateStr,
      counters: { ...base, [cat]: Math.max(0, (base[cat] || 0) + delta) }
    })
  }

  // 해당 주일의 기명 방문자 목록
  const currentSundayNamedVisitors = useMemo(() => {
    return (visitorRecords || []).filter(r => !!r.name)
  }, [visitorRecords])

  // Option 2: 현재 선택된 부서/라브리 탭에 소속된 기명 방문자 목록
  const departmentLinkedVisitors = useMemo(() => {
    if (isVisitorTab) return []
    // 자녀 부서 탭인 경우 (중고등부, 초등부, 유아·유치부)
    if (childMode) {
      return currentSundayNamedVisitors.filter(v => {
        if (selectedGroup === '중고등부') return v.category === '중고등부'
        if (selectedGroup === '초등부') return v.category === '초등부'
        if (selectedGroup === '유아·유치부') return v.category === '유아유치부'
        return false
      })
    }
    // 어른 라브리 탭인 경우 (성인 방문자 표시)
    if (selectedGroup === '미정' || selectedGroup === '라브리1' || selectedGroup === '라브리2' || selectedGroup === '라브리3') {
      // 성인 방문자는 미정 또는 각 라브리 탭에서도 참고할 수 있도록 표시
      return currentSundayNamedVisitors.filter(v => v.category === '성인')
    }
    return []
  }, [isVisitorTab, childMode, selectedGroup, currentSundayNamedVisitors])

  // 신규 기명 방문자 추가 입력 폼 상태
  const [newVisitorName, setNewVisitorName] = useState('')
  const [newVisitorCategory, setNewVisitorCategory] = useState<NamedVisitorCategory>('성인')
  const [newVisitorNote, setNewVisitorNote] = useState('')
  const [isAddingVisitor, setIsAddingVisitor] = useState(false)

  // DB 기록에서 선택 상태·메모 파생
  interface AttendanceRow { user_id?: string; dependent_id?: string; status: string; note?: string }
  const derivedFromDB = useMemo(() => {
    const selections: Record<string, 'ATTEND' | 'ABSENT'> = {}
    const notes: Record<string, string> = {}
    ;(rawRecords || []).forEach((r: AttendanceRow) => {
      if (!r.user_id) return
      selections[r.user_id] = r.status as 'ATTEND' | 'ABSENT'
      if (r.note) notes[r.user_id] = r.note
    })
    ;(rawChildRecords || []).forEach((r: AttendanceRow) => {
      if (!r.dependent_id) return
      selections[`dep_${r.dependent_id}`] = r.status as 'ATTEND' | 'ABSENT'
      if (r.note) notes[`dep_${r.dependent_id}`] = r.note
    })
    return { selections, notes }
  }, [rawRecords, rawChildRecords])

  const [selectionsOverride, setSelectionsOverride] = useState<Record<string, 'ATTEND' | 'ABSENT'> | null>(null)
  const [notesOverride, setNotesOverride] = useState<Record<string, string> | null>(null)

  const checkSelections = selectionsOverride ?? derivedFromDB.selections
  const checkNotes = notesOverride ?? derivedFromDB.notes
  const setCheckSelections = setSelectionsOverride
  const setCheckNotes = setNotesOverride

  // 지금 화면에 보여줄 등록 교인 대상 (어른 성도 또는 자녀)
  const targetMembers = useMemo(() => {
    if (!selectedGroup || isVisitorTab) return []
    if (childMode) return sortChildrenForGroupDisplay(childEntries.filter(c => c.childLabriId === selectedGroup))
    const group = selectedGroup === '미정'
      ? members.filter(u => !u.labriId || u.labriId === '미정')
      : members.filter(u => u.labriId === selectedGroup)
    return sortAdultsForGroupDisplay(group)
  }, [selectedGroup, childMode, isVisitorTab, childEntries, members])

  const attendedCount = targetMembers.filter(m => checkSelections[m.id] === 'ATTEND').length
  const checkedMembers = targetMembers.filter(m => !!checkSelections[m.id])
  const unsetCount = targetMembers.length - checkedMembers.length

  // 방문자 총 인원 수
  const totalVisitorCount = useMemo(() => {
    const counterSum = Object.values(visitorCounters).reduce((a, b) => a + b, 0)
    return counterSum + currentSundayNamedVisitors.length
  }, [visitorCounters, currentSundayNamedVisitors])

  const canSubmit = isVisitorTab ? true : checkedMembers.length > 0

  const relevantIds = targetMembers.map(m => m.id)
  const hasSubmittedAttendance =
    relevantIds.length > 0 && relevantIds.every(id => !!checkSelections[id])

  const toggleCheckSelection = (memberId: string, status: 'ATTEND' | 'ABSENT') => {
    setCheckSelections(prev => {
      const base = prev ?? derivedFromDB.selections
      const next = { ...base }
      if (next[memberId] === status) {
        delete next[memberId]
      } else {
        next[memberId] = status
      }
      return next
    })
    if (status === 'ATTEND') {
      setCheckNotes(prev => {
        const base = prev ?? derivedFromDB.notes
        if (!base[memberId]) return prev
        const next = { ...base }
        delete next[memberId]
        return next
      })
    }
  }

  // ── 방문자 추가 핸들러 ──
  const handleAddNamedVisitor = async (nameToAdd?: string, catToAdd?: NamedVisitorCategory, noteToAdd?: string) => {
    const name = (nameToAdd || newVisitorName).trim()
    const category = catToAdd || newVisitorCategory
    const note = (noteToAdd !== undefined ? noteToAdd : newVisitorNote).trim()
    if (!name) {
      showToast('방문자 이름을 입력해 주세요.', true)
      return
    }

    setIsAddingVisitor(true)
    const res = await dbAddNamedVisitor(targetSundayDateStr, name, category, note || undefined, currentUser.id)
    setIsAddingVisitor(false)

    if (res.error) {
      showToast(res.error.message || '방문자 추가 실패', true)
    } else {
      showToast(`${name} 방문자(${category})를 추가했습니다.`)
      setNewVisitorName('')
      setNewVisitorNote('')
      refetchVisitorRecords()
      refetchAllNamedVisitors()
    }
  }

  // ── 방문자 삭제 핸들러 ──
  const handleDeleteVisitor = async (id: string, name: string | null) => {
    const confirmName = name ? `'${name}' 방문자` : '방문자 기록'
    if (!confirm(`${confirmName}을(를) 삭제하시겠습니까?`)) return

    const res = await dbDeleteVisitorRecord(id)
    if (res.error) {
      showToast('방문자 삭제 실패', true)
    } else {
      showToast('삭제되었습니다.')
      refetchVisitorRecords()
      refetchAllNamedVisitors()
    }
  }

  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false)

  const handleSubmitAttendance = async () => {
    if (isSubmittingAttendance) return

    if (isVisitorTab) {
      // 방문자 탭 저장: 익명 카운터 저장
      setIsSubmittingAttendance(true)
      const countersPayload = ANONYMOUS_CATEGORIES.map(cat => ({
        category: cat,
        count: visitorCounters[cat] || 0
      }))
      const res = await dbSaveVisitorCounters(targetSundayDateStr, countersPayload, currentUser.id)
      setIsSubmittingAttendance(false)

      if (res.error) {
        showToast('방문자 출석 저장 중 오류가 발생했습니다.', true)
        return
      }
      setVisitorCountersOverride(null)
      refetchVisitorRecords()
      setCheckSubmitted(true)
      setTimeout(() => {
        setCheckSubmitted(false)
        setShowAttendanceModal(false)
      }, 1200)
      return
    }

    if (!canSubmit) {
      showToast('한 명 이상 출석/결석을 표시해 주세요.', true)
      return
    }

    setIsSubmittingAttendance(true)
    let submitError: { message?: string } | null = null

    if (childMode) {
      const records = checkedMembers.map(m => ({
        dependentId: m.id.replace(/^dep_/, ''),
        childName: m.name,
        familyGroupId: m.familyGroupId,
        labriId: selectedGroup,
        dateStr: targetSundayDateStr,
        status: checkSelections[m.id] as 'ATTEND' | 'ABSENT',
        note: checkNotes[m.id] || '',
        recordedBy: currentUser.id,
      }))
      const res = await dbSaveChildAttendanceRecords(records)
      submitError = res.error
    } else {
      const records = checkedMembers.map(m => ({
        userId: m.id,
        dateStr: targetSundayDateStr,
        labriId: m.labriId || '미정',
        status: checkSelections[m.id] as 'ATTEND' | 'ABSENT',
        note: checkNotes[m.id] || '',
        recordedBy: currentUser.id,
      }))
      const res = await dbSaveAttendanceRecords(records)
      submitError = res.error
    }

    setIsSubmittingAttendance(false)
    if (submitError) {
      showToast('출석체크 저장 중 오류가 발생했습니다. 다시 시도해 주세요.', true)
      return
    }
    setCheckSubmitted(true)
    setTimeout(() => {
      setCheckSubmitted(false)
      setShowAttendanceModal(false)
    }, 1200)
  }

  if (!canCheck) return null
  if (availableGroups.length === 0) return null

  const showGroupTabs = availableGroups.length > 1

  return (
    <>
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      <button
        onClick={() => {
          if (!isTeacher) refetchAttendance()
          refetchChildAttendance()
          refetchVisitorRecords()
          refetchAllNamedVisitors()
          setShowAttendanceModal(true)
        }}
        className={`px-2.5 py-1.5 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1 transition-all ${
          hasSubmittedAttendance ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600 animate-pulse'
        }`}
      >
        <CheckSquare size={13} />
        {hasSubmittedAttendance ? `✅ ${targetSundayShortLabel} 출첵완료` : `🚨 ${targetSundayShortLabel} 출첵하기`}
      </button>

      {/* ── 출석체크 모달 ── */}
      {showAttendanceModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setShowAttendanceModal(false))}
        >
          <div className="bg-white rounded-3xl w-full max-w-[440px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-[#335f87] text-white">
              <div>
                <h3 className="font-black text-sm">✏️ {targetSundayShortLabel}(일) 출석체크</h3>
                <p className="text-2xs text-blue-200 mt-0.5">
                  {isVisitorTab
                    ? `방문자 출석 · 총 ${totalVisitorCount}명`
                    : `${selectedGroup} · 출석 ${attendedCount}/${targetMembers.length}명${departmentLinkedVisitors.length > 0 ? ` (방문자 +${departmentLinkedVisitors.length}명)` : ''}`}
                </p>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white font-bold">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {/* 그룹 선택 탭 (어른 라브리 + 자녀 그룹 + 방문자) */}
              {showGroupTabs && (
                <div className="bg-slate-100 p-1.5 rounded-xl space-y-1">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-2xs font-bold text-slate-600">🏛️ 그룹 선택</span>
                    <span className="text-2xs font-bold text-[#335f87] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {isVisitorTab
                        ? `방문자 (${totalVisitorCount}명)`
                        : `${selectedGroup === '미정' ? '미정/새가족' : selectedGroup} (${targetMembers.length}명)`}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {availableGroups.map(group => {
                      const isSelected = selectedGroup === group
                      const isVis = group === '방문자'
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => setSelectedGroup(group)}
                          className={`py-1.5 px-0.5 rounded-lg text-2xs font-bold transition-all ${
                            isSelected
                              ? 'bg-[#335f87] text-white shadow-xs'
                              : isVis
                                ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                : isChildGroup(group)
                                  ? 'bg-white text-emerald-700 hover:bg-emerald-50'
                                  : 'bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {group === '미정' ? '미정/새가족' : group === '방문자' ? '🏷️ 방문자' : group}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* 1. 방문자 탭 렌더링 (isVisitorTab) */}
              {/* ────────────────────────────────────────────────────────── */}
              {isVisitorTab ? (
                /* 순서 원칙: 이름을 남기는 방문자가 먼저입니다. 이름을 받아 두면 다음 주에
                   심방·연락으로 이어지지만, 익명 숫자는 총원 집계에서만 쓰입니다.
                   그래서 기명 영역에 포인트 컬러를 주고 익명 카운터는 아래에 무채색으로 둡니다. */
                <div className="space-y-4">
                  {/* 1. 기명 방문자 직접 입력 폼 (주인공) */}
                  <div className="bg-[#335f87]/5 border-2 border-[#335f87]/25 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#335f87]">✍️ 기명 방문자 등록</span>
                      <span className="text-2xs font-bold text-[#335f87]/70">이름을 아는 방문자</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="방문자 이름 입력..."
                          value={newVisitorName}
                          onChange={e => setNewVisitorName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddNamedVisitor() }}
                          className="flex-1 px-3 py-2 bg-white rounded-xl border border-[#335f87]/30 text-xs text-gray-900 font-bold focus:outline-none focus:border-[#335f87]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddNamedVisitor()}
                          disabled={isAddingVisitor || !newVisitorName.trim()}
                          className="px-3.5 py-2 bg-[#335f87] hover:bg-[#284b6b] disabled:bg-gray-300 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 transition-all"
                        >
                          <Plus size={14} /> 추가
                        </button>
                      </div>

                      {/* 부서 선택 칩 (성인 | 중고등부 | 초등부 | 유아유치부) */}
                      <div className="grid grid-cols-4 gap-1">
                        {NAMED_VISITOR_CATEGORIES.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setNewVisitorCategory(cat)}
                            className={`py-1.5 text-2xs font-bold rounded-lg border transition-all ${
                              newVisitorCategory === cat
                                ? 'bg-[#335f87] border-[#335f87] text-white shadow-2xs'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* 특이사항 텍스트 입력란 */}
                      <textarea
                        placeholder="특이사항 (선택사항, 예: 인도자, 비고 등)..."
                        value={newVisitorNote}
                        onChange={e => setNewVisitorNote(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-1.5 bg-white rounded-xl border border-[#335f87]/30 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#335f87] resize-none"
                      />

                      {/* 최근 기명 방문자 추천 (누르면 바로 등록) */}
                      {allNamedVisitors && allNamedVisitors.length > 0 && (
                        <div className="pt-1 space-y-1">
                          <span className="text-[10px] text-[#335f87]/70 font-bold">💡 최근 방문자 빠른 추가:</span>
                          <div className="flex flex-wrap gap-1">
                            {Array.from(new Set(allNamedVisitors.map(v => `${v.name}::${v.category}`)))
                              .slice(0, 6)
                              .map(key => {
                                const [name, cat] = key.split('::') as [string, NamedVisitorCategory]
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleAddNamedVisitor(name, cat)}
                                    className="px-2 py-0.5 bg-white hover:bg-[#335f87]/10 border border-[#335f87]/25 rounded-md text-[10px] text-gray-700 font-medium transition-all"
                                  >
                                    +{name} <span className="text-gray-400 text-[9px]">({cat})</span>
                                  </button>
                                )
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. 오늘 등록된 기명 방문자 명단 */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-black text-gray-900">
                      📋 오늘 등록된 기명 방문자{' '}
                      <span className="text-[#335f87]">({currentSundayNamedVisitors.length}명)</span>
                    </span>
                    {currentSundayNamedVisitors.length === 0 ? (
                      <p className="py-4 text-center text-2xs text-gray-400 bg-gray-50 rounded-xl">
                        등록된 기명 방문자가 없습니다.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {currentSundayNamedVisitors.map(v => (
                          <div
                            key={v.id}
                            className="p-2.5 bg-white rounded-xl border border-gray-200 border-l-4 border-l-[#335f87] shadow-2xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-gray-900">{v.name}</span>
                                <span className="text-2xs font-bold text-[#335f87] bg-[#335f87]/10 px-1.5 py-0.5 rounded">
                                  {v.category}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteVisitor(v.id, v.name)}
                                className="p-1 hover:bg-rose-100 rounded-lg text-rose-500 transition-colors"
                                title="삭제"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            {v.note && (
                              <div className="text-2xs text-gray-700 bg-gray-50 rounded-lg px-2 py-1 border border-gray-200 flex items-start gap-1">
                                <span className="shrink-0 font-bold text-[#335f87]">📝 Note:</span>
                                <span className="break-all">{v.note}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. 익명 방문자 숫자 카운터 (보조 — 무채색) */}
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs font-bold text-gray-500">🔢 익명 방문자 카운터</span>
                      <span className="text-2xs font-bold text-gray-500">
                        계: {Object.values(visitorCounters).reduce((a, b) => a + b, 0)}명
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ANONYMOUS_CATEGORIES.map(cat => (
                        <div key={cat} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-gray-200">
                          <span className="text-2xs font-bold text-gray-600">{cat}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustVisitorCounter(cat, -1)}
                              className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold flex items-center justify-center text-xs active:scale-95"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-bold text-xs text-gray-800">
                              {visitorCounters[cat] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustVisitorCounter(cat, 1)}
                              className="w-6 h-6 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold flex items-center justify-center text-xs active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium">
                      * 이름을 모르는 방문자만 숫자로 세어 주세요. 이름을 알면 위에 등록하는 편이 좋습니다.
                    </p>
                  </div>
                </div>
              ) : (
                /* ────────────────────────────────────────────────────────── */
                /* 2. 일반 부서/라브리 탭 렌더링 */
                /* ────────────────────────────────────────────────────────── */
                <>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCheckSelections(prev => {
                          const next = { ...(prev ?? derivedFromDB.selections) }
                          targetMembers.forEach(m => { next[m.id] = 'ATTEND' })
                          return next
                        })
                      }}
                      className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-2xs font-bold hover:bg-emerald-700"
                    >
                      ⚡ 전원 출석
                    </button>
                  </div>

                  {targetMembers.length === 0 && (
                    <p className="py-8 text-center text-xs text-gray-400">이 그룹에 해당하는 사람이 없습니다.</p>
                  )}

                  {/* 정규 교인 명단 */}
                  {targetMembers.map(member => {
                    const sel = checkSelections[member.id]
                    return (
                      <div key={member.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-gray-900">{member.name}</span>
                            {!childMode && member.duty && (
                              <span className="text-2xs text-gray-400 ml-1.5">{member.duty}</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => toggleCheckSelection(member.id, 'ATTEND')}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                sel === 'ATTEND' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border border-gray-200 text-gray-600'
                              }`}
                            >✅ 출석</button>
                            <button
                              onClick={() => toggleCheckSelection(member.id, 'ABSENT')}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                sel === 'ABSENT' ? 'bg-rose-600 text-white shadow-xs' : 'bg-white border border-gray-200 text-gray-600'
                              }`}
                            >❌ 결석</button>
                          </div>
                        </div>

                        {sel === 'ABSENT' && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex gap-1 flex-wrap text-2xs">
                              {ABSENCE_TAGS.map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => setCheckNotes(p => ({ ...(p ?? derivedFromDB.notes), [member.id]: checkNotes[member.id] === tag ? '' : tag }))}
                                  className={`px-2 py-0.5 rounded-md border ${checkNotes[member.id] === tag ? 'bg-rose-100 border-rose-300 text-rose-800 font-bold' : 'bg-white border-gray-200 text-gray-500'}`}
                                >#{tag}</button>
                              ))}
                            </div>
                            <input
                              type="text"
                              placeholder="결석 사유 직접 입력 (선택사항)..."
                              value={checkNotes[member.id] || ''}
                              onChange={e => setCheckNotes(p => ({ ...(p ?? derivedFromDB.notes), [member.id]: e.target.value }))}
                              className="w-full text-xs p-2 bg-white rounded-lg border border-rose-200 focus:outline-none text-gray-900 font-medium"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Option 2 연동: 해당 부서에 등록된 기명 방문자 목록 표시 */}
                  {departmentLinkedVisitors.length > 0 && (
                    <div className="pt-2 space-y-1.5 border-t border-dashed border-amber-300">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-2xs font-bold text-amber-800 flex items-center gap-1">
                          🏷️ 이 부서 방문자 ({departmentLinkedVisitors.length}명)
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedGroup('방문자')}
                          className="text-[10px] text-[#335f87] font-bold hover:underline"
                        >
                          방문자 탭에서 관리 →
                        </button>
                      </div>
                      {departmentLinkedVisitors.map(v => (
                        <div
                          key={v.id}
                          className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-900">{v.name}</span>
                              <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded">
                                🏷️방문
                              </span>
                            </div>
                            <span className="text-2xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              ✅ 출석
                            </span>
                          </div>
                          {v.note && (
                            <div className="text-2xs text-amber-950 bg-amber-100/60 rounded-lg px-2 py-1 border border-amber-200/50 flex items-start gap-1">
                              <span className="shrink-0 font-bold">📝</span>
                              <span className="break-all">{v.note}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 출석체크 제출 버튼 */}
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              {checkSubmitted ? (
                <div className="w-full py-3 bg-emerald-600 text-white font-bold text-xs rounded-xl text-center">
                  ✅ 출석체크가 명단에 정상 반영되었습니다!
                </div>
              ) : isVisitorTab ? (
                <button
                  onClick={handleSubmitAttendance}
                  disabled={isSubmittingAttendance}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckSquare size={16} />
                  {isSubmittingAttendance
                    ? '저장 중...'
                    : `✅ 방문자 카운터 저장하기 (총 ${totalVisitorCount}명)`}
                </button>
              ) : (
                <div className="space-y-2">
                  {unsetCount > 0 && checkedMembers.length > 0 && (
                    <p className="text-2xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
                      ⚠️ <strong>{unsetCount}명</strong>이 아직 표시되지 않았습니다. 이대로 저장하면 그분들은 <strong>미지정</strong>으로 남고,
                      담당자에게 계속 알림이 갑니다.
                    </p>
                  )}
                  <button
                    onClick={handleSubmitAttendance}
                    disabled={!canSubmit || isSubmittingAttendance}
                    title={!canSubmit ? '한 명 이상 표시한 뒤 저장할 수 있습니다.' : undefined}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckSquare size={16} /> {isSubmittingAttendance
                      ? '저장 중...'
                      : !canSubmit
                        ? '한 명 이상 표시해 주세요'
                        : unsetCount > 0
                          ? `여기까지 저장하기 (${attendedCount}명 출석 · ${unsetCount}명 미지정)`
                          : `${hasSubmittedAttendance ? '✅ 출석체크 수정 완료하기' : '✅ 출석체크 최종 제출하기'} (${attendedCount}명 출석)`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
