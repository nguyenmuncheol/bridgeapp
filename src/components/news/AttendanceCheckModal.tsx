'use client'

import { useState, useEffect, useMemo } from 'react'
import { CheckSquare } from 'lucide-react'
import { UserProfile, isApprovedMember } from '../../lib/mockData'
import { dbFetchAttendanceRecords, dbSaveAttendanceRecords } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'

const ABSENCE_TAGS = ['출근/출장', '여행', '아파요', '개인사정', '가족방문']

interface AttendanceCheckModalProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

// ── 출석체크 버튼 + 모달 (리더/관리자 전용, 자체 상태 관리) ──
export default function AttendanceCheckModal({ currentUser, allUsers }: AttendanceCheckModalProps) {
  const isLeaderOrAdmin = currentUser.role === 'LEADER' || currentUser.role === 'ADMIN'

  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [checkSelections, setCheckSelections] = useState<Record<string, 'ATTEND' | 'ABSENT'>>({})
  const [checkNotes, setCheckNotes] = useState<Record<string, string>>({})
  const [checkSubmitted, setCheckSubmitted] = useState(false)
  // 🔧 이전에는 이 날짜에 "어떤 라브리든" 한 명이라도 출석기록이 있으면 무조건 완료로
  // 표시되는 버그가 있었습니다. loadAttendanceRecords()에서 현재 담당 그룹 전원의
  // 기록이 실제로 DB에 존재할 때만 true로 설정하도록 고쳤습니다.
  const [hasSubmittedAttendance, setHasSubmittedAttendance] = useState(false)
  const [adminLabriFilter, setAdminLabriFilter] = useState<string>('라브리1')

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

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
  const members = allUsers.filter(u => isApprovedMember(u.role) && u.role !== 'COUPON')
  const myLabriMembers = members.filter(u => u.labriId === currentUser.labriId && currentUser.labriId)
  const targetMembers = isLeaderOrAdmin
    ? (currentUser.role === 'ADMIN'
        ? (adminLabriFilter === '미정' ? members.filter(u => !u.labriId || u.labriId === '미정') : members.filter(u => u.labriId === adminLabriFilter))
        : myLabriMembers)
    : []
  // checkSelections에는 그날 전체(다른 라브리 포함) 출석기록이 담길 수 있으므로, 반드시
  // targetMembers(리더 본인 라브리 또는 관리자가 선택한 그룹)로만 좁혀서 카운팅합니다.
  const attendedCount = targetMembers.filter(m => checkSelections[m.id] === 'ATTEND').length
  // 전원 명시적으로 출석/결석을 표시해야만 제출 가능 (미처리 인원이 자동으로 '출석' 처리되는 것을 방지)
  const allMembersChecked = targetMembers.length > 0 && targetMembers.every(m => !!checkSelections[m.id])

  // DB에서 출석체크 데이터 로드 (해당 날짜 전체 기록을 캐시로 가져온 뒤, 라브리 필터가 바뀌어도
  // 같은 날짜라면 재요청 없이 캐시를 그대로 재사용하고 클라이언트에서만 다시 계산합니다)
  const { data: rawRecords, refetch: refetchAttendance } = useCachedQuery(
    `attendanceRecords:${targetSundayDateStr}`,
    () => dbFetchAttendanceRecords(targetSundayDateStr),
    { enabled: isLeaderOrAdmin }
  )

  // 현재 담당 그룹 전원의 기록이 실제로 있을 때만 "완료"로 표시
  useEffect(() => {
    if (!rawRecords) return
    const selections: Record<string, 'ATTEND' | 'ABSENT'> = {}
    const notes: Record<string, string> = {}
    rawRecords.forEach((r: any) => {
      selections[r.user_id] = r.status as 'ATTEND' | 'ABSENT'
      if (r.note) notes[r.user_id] = r.note
    })
    setCheckSelections(selections)
    setCheckNotes(notes)
    const relevantIds = targetMembers.map(m => m.id)
    setHasSubmittedAttendance(relevantIds.length > 0 && relevantIds.every(id => !!selections[id]))
    // targetMembers는 adminLabriFilter에 따라 파생되므로, 필터가 바뀔 때도 완료 여부를 다시 계산합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRecords, adminLabriFilter])

  // 출석체크 제출 (DB 동기화)
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

    // 안전장치: 전원이 명시적으로 출석/결석 표시되지 않았다면 제출하지 않음
    // (버튼도 비활성화되지만, 방어적으로 한 번 더 확인)
    if (!allMembersChecked) {
      showToast('아직 출석/결석을 표시하지 않은 성도가 있습니다.', true)
      return
    }
    const records = targetMembers.map(m => ({
      userId: m.id,
      dateStr: targetSundayDateStr,
      labriId: m.labriId || '미정',
      status: checkSelections[m.id] as 'ATTEND' | 'ABSENT',
      note: checkNotes[m.id] || '',
      recordedBy: currentUser.id
    }))

    setIsSubmittingAttendance(true)
    const { error } = await dbSaveAttendanceRecords(records)
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

  if (!isLeaderOrAdmin) return null

  return (
    <>
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      <button
        onClick={() => {
          refetchAttendance()
          setShowAttendanceModal(true)
        }}
        className={`px-2.5 py-1.5 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1 transition-all ${
          hasSubmittedAttendance ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600 animate-pulse'
        }`}
      >
        <CheckSquare size={13} />
        {hasSubmittedAttendance ? `✅ ${targetSundayShortLabel} 출첵완료` : `🚨 ${targetSundayShortLabel} 출첵하기`}
      </button>

      {/* ── 출석체크 모달 (화면 중앙 정중앙 팝업 배치 + 제출 버튼) ── */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-[440px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-[#335f87] text-white">
              <div>
                <h3 className="font-black text-sm">✏️ {targetSundayShortLabel}(일) 출석체크</h3>
                <p className="text-[10px] text-blue-200 mt-0.5">출석: {attendedCount}/{targetMembers.length}명</p>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white font-bold">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {/* 관리자: 라브리 선택 탭 */}
              {currentUser.role === 'ADMIN' && (
                <div className="bg-slate-100 p-1.5 rounded-xl space-y-1">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold text-slate-600">🏛️ 라브리 선택</span>
                    <span className="text-[9px] font-bold text-[#335f87] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {adminLabriFilter === '미정' ? '미정/새가족' : adminLabriFilter} ({targetMembers.length}명)
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {['라브리1', '라브리2', '라브리3', '미정'].map(labri => (
                      <button
                        key={labri}
                        type="button"
                        onClick={() => setAdminLabriFilter(labri)}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          adminLabriFilter === labri
                            ? 'bg-[#335f87] text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {labri === '미정' ? '미정/새가족' : labri}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between bg-amber-50 border border-amber-100 p-2.5 rounded-xl text-xs">
                <span className="text-amber-900 font-medium">💡 전원 출석 클릭 후 결석자만 수정하세요</span>
                <button
                  type="button"
                  onClick={() => {
                    const newSel: Record<string, 'ATTEND' | 'ABSENT'> = {}
                    targetMembers.forEach(m => { newSel[m.id] = 'ATTEND' })
                    setCheckSelections(newSel)
                  }}
                  className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:bg-emerald-700"
                >⚡ 전원 출석</button>
              </div>

              {targetMembers.map(member => {
                const sel = checkSelections[member.id]
                return (
                  <div key={member.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{member.name}</span>
                        <span className="text-[10px] text-gray-400 ml-1.5">{member.duty}</span>
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
                        <div className="flex gap-1 flex-wrap text-[10px]">
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
                <button
                  onClick={handleSubmitAttendance}
                  disabled={!allMembersChecked || isSubmittingAttendance}
                  title={!allMembersChecked ? '전원 출석/결석 표시 후 제출할 수 있습니다.' : undefined}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckSquare size={16} /> {isSubmittingAttendance
                    ? '저장 중...'
                    : !allMembersChecked
                      ? `전원 표시 필요 (${targetMembers.filter(m => !checkSelections[m.id]).length}명 남음)`
                      : `${hasSubmittedAttendance ? '✅ 출석체크 수정 완료하기' : '✅ 출석체크 최종 제출하기'} (${attendedCount}명 출석)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
