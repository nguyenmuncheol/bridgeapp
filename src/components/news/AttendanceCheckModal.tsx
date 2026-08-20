'use client'

import { useState, useEffect, useMemo } from 'react'
import { CheckSquare } from 'lucide-react'
import { UserProfile, isApprovedMember, canEditChildAttendance } from '../../lib/mockData'
import {
  dbFetchAttendanceRecords, dbSaveAttendanceRecords,
  dbFetchChildAttendanceRecords, dbSaveChildAttendanceRecords,
} from '../../lib/db'
import { CHILD_LABRI_OPTIONS, buildDependentEntries } from '../../lib/familyInfo'
import { useCachedQuery } from '../../lib/dataCache'

const ABSENCE_TAGS = ['출근/출장', '여행', '아파요', '가족방문']
const ADULT_GROUPS = ['라브리1', '라브리2', '라브리3', '미정']

interface AttendanceCheckModalProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

/** 자녀 그룹인지 (영아부·유아·유치부·초등부·중고등부) */
function isChildGroup(group: string): boolean {
  return (CHILD_LABRI_OPTIONS as readonly string[]).includes(group)
}

// ── 출석체크 버튼 + 모달 (리더/관리자/선생님 전용, 자체 상태 관리) ──
export default function AttendanceCheckModal({ currentUser, allUsers }: AttendanceCheckModalProps) {
  const isLeader = currentUser.role === 'LEADER'
  const isAdmin = currentUser.role === 'ADMIN'
  const isTeacher = currentUser.role === 'TEACHER'
  const canCheck = canEditChildAttendance(currentUser.role)

  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [checkSelections, setCheckSelections] = useState<Record<string, 'ATTEND' | 'ABSENT'>>({})
  const [checkNotes, setCheckNotes] = useState<Record<string, string>>({})
  const [checkSubmitted, setCheckSubmitted] = useState(false)
  // 🔧 이전에는 이 날짜에 "어떤 라브리든" 한 명이라도 출석기록이 있으면 무조건 완료로
  // 표시되는 버그가 있었습니다. 현재 담당 그룹 전원의 기록이 실제로 DB에 존재할 때만
  // true로 설정합니다.
  const [hasSubmittedAttendance, setHasSubmittedAttendance] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // ── 교회학교 그룹이 지정된 자녀들 (계정이 없으므로 부모의 가족현황에서 만들어 옵니다) ──
  const childEntries = useMemo(
    () => buildDependentEntries(allUsers).filter(c => !!c.childLabriId),
    [allUsers]
  )

  // ── 내가 출석을 입력할 수 있는 그룹 목록 ──
  const availableGroups = useMemo(() => {
    // 자녀 그룹은 "지정된 자녀가 한 명이라도 있는 그룹"만 보여줍니다.
    const activeChildGroups = CHILD_LABRI_OPTIONS.filter(g => childEntries.some(c => c.childLabriId === g))

    if (isTeacher) {
      // 담당 그룹을 지정하지 않은 선생님 = 모든 자녀 그룹 담당
      const mine = (currentUser.teachGroup || '').trim()
      return mine ? activeChildGroups.filter(g => g === mine) : [...activeChildGroups]
    }
    if (isAdmin) return [...ADULT_GROUPS, ...activeChildGroups]
    if (isLeader) return [currentUser.labriId || '미정']
    return []
  }, [isTeacher, isAdmin, isLeader, currentUser.teachGroup, currentUser.labriId, childEntries])

  const [selectedGroup, setSelectedGroup] = useState('')
  // 그룹 목록이 만들어지면 첫 번째 그룹을 자동 선택합니다.
  useEffect(() => {
    if (availableGroups.length === 0) return
    if (!selectedGroup || !availableGroups.includes(selectedGroup)) {
      setSelectedGroup(availableGroups[0])
    }
  }, [availableGroups, selectedGroup])

  const childMode = isChildGroup(selectedGroup)

  // 가장 최근 지난 주일 날짜 계산 (오늘이 일요일이면 오늘, 월~토요일이면 직전 일요일)
  // 🐛 과거 버그: 이 값을 화면이 처음 만들어질 때 딱 한 번만 계산했습니다.
  // 리더가 토요일 저녁에 앱을 열어두고 주일 예배 후 그대로 출석을 제출하면,
  // **지난 주일 날짜로 저장**되어 지난주 기록을 덮어썼습니다.
  // → 날짜가 바뀌거나 앱으로 돌아올 때 다시 계산합니다.
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

  // 지금 화면에 보여줄 대상 (어른 성도 또는 자녀)
  const targetMembers = useMemo(() => {
    if (!selectedGroup) return []
    if (childMode) return childEntries.filter(c => c.childLabriId === selectedGroup)
    if (selectedGroup === '미정') return members.filter(u => !u.labriId || u.labriId === '미정')
    return members.filter(u => u.labriId === selectedGroup)
  }, [selectedGroup, childMode, childEntries, members])

  const attendedCount = targetMembers.filter(m => checkSelections[m.id] === 'ATTEND').length
  // 표시한 사람만 저장합니다. 표시하지 않은 사람은 "미지정"으로 남습니다.
  //
  // 예전에는 **전원 표시해야만** 제출할 수 있었습니다. 그런데 늦게 오신 분이나
  // 확인이 안 되는 분 때문에 한 명이라도 비면 아무것도 저장하지 못하고,
  // 리더가 앱을 닫으면 그 주 출석이 통째로 날아갔습니다.
  // → 이제 아는 것부터 저장하고 나중에 채울 수 있습니다.
  //   (미지정이 남아 있으면 서버가 담당자에게 계속 알려줍니다)
  const checkedMembers = targetMembers.filter(m => !!checkSelections[m.id])
  const unsetCount = targetMembers.length - checkedMembers.length
  const canSubmit = checkedMembers.length > 0

  // ── DB에서 출석 기록 로드 ──
  // 어른 출석표와 자녀 출석표는 완전히 다른 표라서 따로 불러옵니다.
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

  // 현재 담당 그룹 전원의 기록이 실제로 있을 때만 "완료"로 표시
  useEffect(() => {
    const selections: Record<string, 'ATTEND' | 'ABSENT'> = {}
    const notes: Record<string, string> = {}
    ;(rawRecords || []).forEach((r: any) => {
      selections[r.user_id] = r.status as 'ATTEND' | 'ABSENT'
      if (r.note) notes[r.user_id] = r.note
    })
    // 자녀 기록은 dependent_id로 저장되므로 화면 id(dep_...)에 맞춰 붙입니다.
    ;(rawChildRecords || []).forEach((r: any) => {
      selections[`dep_${r.dependent_id}`] = r.status as 'ATTEND' | 'ABSENT'
      if (r.note) notes[`dep_${r.dependent_id}`] = r.note
    })
    setCheckSelections(selections)
    setCheckNotes(notes)
    const relevantIds = targetMembers.map(m => m.id)
    setHasSubmittedAttendance(relevantIds.length > 0 && relevantIds.every(id => !!selections[id]))
    // targetMembers는 selectedGroup에 따라 파생되므로, 그룹이 바뀔 때도 완료 여부를 다시 계산합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRecords, rawChildRecords, selectedGroup])

  // 이미 선택된 상태(출석/결석)를 다시 누르면 "미지정" 상태로 되돌립니다.
  const toggleCheckSelection = (memberId: string, status: 'ATTEND' | 'ABSENT') => {
    setCheckSelections(prev => {
      const next = { ...prev }
      if (next[memberId] === status) {
        delete next[memberId]
      } else {
        next[memberId] = status
      }
      return next
    })
    // 🐛 과거 버그: 결석으로 표시하고 사유(#아파요)를 고른 뒤 다시 '출석'으로 정정해도
    // 사유가 그대로 남아 저장됐습니다. 나중에 보고서에는 "출석했는데 아팠음"으로 나옵니다.
    if (status === 'ATTEND') {
      setCheckNotes(prev => {
        if (!prev[memberId]) return prev
        const next = { ...prev }
        delete next[memberId]
        return next
      })
    }
  }

  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false)

  const handleSubmitAttendance = async () => {
    // 🐛 과거 버그: 제출 중 표시도, 중복 방지도 없어서 느린 연결에서 두 번 누르면
    // 같은 사람/같은 날짜 기록이 두 줄 생길 수 있었습니다(통계가 두 배로 잡힘).
    if (isSubmittingAttendance) return

    if (!canSubmit) {
      showToast('한 명 이상 출석/결석을 표시해 주세요.', true)
      return
    }

    setIsSubmittingAttendance(true)
    let error: any = null

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
      error = res.error
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
      error = res.error
    }

    setIsSubmittingAttendance(false)
    if (error) {
      showToast('출석체크 저장 중 오류가 발생했습니다. 다시 시도해 주세요.', true)
      return
    }
    setHasSubmittedAttendance(true)
    setCheckSubmitted(true)
    setTimeout(() => {
      setCheckSubmitted(false)
      setShowAttendanceModal(false)
    }, 1200)
  }

  if (!canCheck) return null
  // 선생님인데 담당할 자녀가 아직 한 명도 없으면 버튼을 숨깁니다.
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-[440px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-[#335f87] text-white">
              <div>
                <h3 className="font-black text-sm">✏️ {targetSundayShortLabel}(일) 출석체크</h3>
                <p className="text-2xs text-blue-200 mt-0.5">
                  {selectedGroup} · 출석 {attendedCount}/{targetMembers.length}명
                </p>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white font-bold">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {/* 그룹 선택 탭 (어른 라브리 + 자녀 그룹) */}
              {showGroupTabs && (
                <div className="bg-slate-100 p-1.5 rounded-xl space-y-1">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-2xs font-bold text-slate-600">🏛️ 그룹 선택</span>
                    <span className="text-2xs font-bold text-[#335f87] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {selectedGroup === '미정' ? '미정/새가족' : selectedGroup} ({targetMembers.length}명)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {availableGroups.map(group => (
                      <button
                        key={group}
                        type="button"
                        onClick={() => setSelectedGroup(group)}
                        className={`py-1.5 px-0.5 rounded-lg text-2xs font-bold transition-all ${
                          selectedGroup === group
                            ? 'bg-[#335f87] text-white shadow-xs'
                            : isChildGroup(group)
                              ? 'bg-white text-emerald-700 hover:bg-emerald-50'
                              : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {group === '미정' ? '미정/새가족' : group}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCheckSelections(prev => {
                      const next = { ...prev }
                      targetMembers.forEach(m => { next[m.id] = 'ATTEND' })
                      return next
                    })
                  }}
                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-2xs font-bold hover:bg-emerald-700"
                >⚡ 전원 출석</button>
              </div>

              {targetMembers.length === 0 && (
                <p className="py-8 text-center text-xs text-gray-400">이 그룹에 해당하는 사람이 없습니다.</p>
              )}

              {targetMembers.map(member => {
                const sel = checkSelections[member.id]
                return (
                  <div key={member.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{member.name}</span>
                        {/* 자녀는 부모 이름을 붙이지 않습니다 (줄이 길어지고 굳이 필요 없음) */}
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
                              onClick={() => setCheckNotes(p => ({ ...p, [member.id]: checkNotes[member.id] === tag ? '' : tag }))}
                              className={`px-2 py-0.5 rounded-md border ${checkNotes[member.id] === tag ? 'bg-rose-100 border-rose-300 text-rose-800 font-bold' : 'bg-white border-gray-200 text-gray-500'}`}
                            >#{tag}</button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="결석 사유 직접 입력 (선택사항)..."
                          value={checkNotes[member.id] || ''}
                          onChange={e => setCheckNotes(p => ({ ...p, [member.id]: e.target.value }))}
                          className="w-full text-xs p-2 bg-white rounded-lg border border-rose-200 focus:outline-none text-gray-900 font-medium"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 출석체크 제출 버튼 */}
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              {checkSubmitted ? (
                <div className="w-full py-3 bg-emerald-600 text-white font-bold text-xs rounded-xl text-center">
                  ✅ 출석체크가 명단에 정상 반영되었습니다!
                </div>
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
