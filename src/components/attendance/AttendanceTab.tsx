'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar, CheckCircle2, Phone, Search, MapPin, Users, ChevronLeft, ChevronRight, CheckSquare } from 'lucide-react'
import { UserProfile, getUserDisplayName } from '../../lib/mockData'
import { getMostRecentSunday, getRecentMonths } from '../../lib/dateUtils'
import { dbFetchAttendanceRecords, dbSaveAttendanceRecords } from '../../lib/db'

interface AttendanceTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

export default function AttendanceTab({ currentUser, allUsers }: AttendanceTabProps) {
  const [subTab, setSubTab] = useState<'myattend' | 'check' | 'members'>('myattend')
  const isLeaderOrAdmin = currentUser.role === 'LEADER' || currentUser.role === 'ADMIN'

  // 토스트 메시지
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // ── 1. 본인 출석 확인 (DB 연동) ──
  const recentMonths = useMemo(() => getRecentMonths(3), [])
  const [calViewMonth, setCalViewMonth] = useState(recentMonths[recentMonths.length - 1].value)
  const [myAttendanceRecords, setMyAttendanceRecords] = useState<{ dateStr: string; status: 'ATTEND' | 'ABSENT'; note?: string }[]>([])

  const loadMyAttendance = useCallback(async () => {
    // DB 단에서 본인 ID로 필터링 — 전체 레코드 로드 방지
    const myRecords = await dbFetchAttendanceRecords(undefined, currentUser.id)
    const mapped = myRecords.map((r: any) => ({
      dateStr: r.date_str,
      status: r.status as 'ATTEND' | 'ABSENT',
      note: r.note || ''
    }))
    setMyAttendanceRecords(mapped)
  }, [currentUser.id])

  useEffect(() => {
    loadMyAttendance()
  }, [loadMyAttendance])

  const monthFilteredRecords = useMemo(() => {
    return myAttendanceRecords.filter(r => r.dateStr.startsWith(calViewMonth))
  }, [myAttendanceRecords, calViewMonth])

  // ── 2. 출석체크 (리더/관리자) ──
  // weekOffset: 0 (최근 일요일), -1 (1주 전), -2 (2주 전) ...
  const [weekOffset, setWeekOffset] = useState(0)
  const currentSunday = useMemo(() => getMostRecentSunday(weekOffset), [weekOffset])
  
  const [checkLabri, setCheckLabri] = useState(currentUser.labriId || '라브리1')
  const [selections, setSelections] = useState<Record<string, 'ATTEND' | 'ABSENT'>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // 대상 성도 목록 (관리자는 선택한 라브리, 리더는 본인 라브리) — 쿠폰 권한자 제외
  const targetMembers = useMemo(() => {
    return allUsers.filter(u =>
      u.role !== 'PENDING' &&
      u.role !== 'COUPON' &&
      (currentUser.role === 'ADMIN'
        ? (checkLabri === '미정' ? !u.labriId || u.labriId === '미정' : u.labriId === checkLabri)
        : u.labriId === currentUser.labriId)
    )
  }, [allUsers, currentUser.role, currentUser.labriId, checkLabri])

  // 선택된 주일의 기존 DB 출석 기록 자동 불러오기
  const loadDateAttendance = useCallback(async () => {
    const dateStr = currentSunday.dateStr
    const records = await dbFetchAttendanceRecords(dateStr)
    const newSel: Record<string, 'ATTEND' | 'ABSENT'> = {}
    const newNotes: Record<string, string> = {}

    if (records && records.length > 0) {
      records.forEach((r: any) => {
        newSel[r.user_id] = r.status
        if (r.note) newNotes[r.user_id] = r.note
      })
    }
    setSelections(newSel)
    setNotes(newNotes)
    setSubmitted(false)
  }, [currentSunday.dateStr])

  useEffect(() => {
    if (isLeaderOrAdmin && subTab === 'check') {
      loadDateAttendance()
    }
  }, [isLeaderOrAdmin, subTab, loadDateAttendance])

  const allSelected = targetMembers.length > 0 && targetMembers.every(u => selections[u.id] != null)

  const handleSubmit = async () => {
    if (!allSelected || isSubmitting) return

    setIsSubmitting(true)
    const dateStr = currentSunday.dateStr
    const recordsToSave = targetMembers.map(m => ({
      userId: m.id,
      dateStr: dateStr,
      labriId: m.labriId || '미정',
      status: selections[m.id],
      note: selections[m.id] === 'ABSENT' ? (notes[m.id] || '') : '',
      recordedBy: currentUser.name
    }))

    const result = await dbSaveAttendanceRecords(recordsToSave)
    setIsSubmitting(false)

    if (result.error) {
      alert(`출석체크 저장 중 오류가 발생했습니다: ${result.error.message}`)
    } else {
      setSubmitted(true)
      showToast(`✅ ${currentSunday.displayStr} 출석체크가 저장되었습니다!`)
      loadMyAttendance() // 본인 출석 기록도 갱신
    }
  }

  // ── 3. 주소록 ──
  const [memberFilter, setMemberFilter] = useState<'my' | 'all'>('my')
  const [search, setSearch] = useState('')
  const filteredMembers = allUsers.filter(u => {
    if (u.role === 'PENDING' || u.role === 'COUPON') return false
    if (memberFilter === 'my' && currentUser.labriId && u.labriId !== currentUser.labriId) return false
    if (search) return u.name.includes(search) || u.duty.includes(search) || (u.address || '').includes(search)
    return true
  })

  return (
    <div className="space-y-4 pb-6 relative">
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* 서브탭 */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold shadow-2xs">
        <button
          onClick={() => setSubTab('myattend')}
          className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'myattend' ? 'bg-[#335f87] text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          본인 출석 확인
        </button>
        {isLeaderOrAdmin && (
          <button
            onClick={() => setSubTab('check')}
            className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'check' ? 'bg-[#335f87] text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            출석체크
          </button>
        )}
        <button
          onClick={() => setSubTab('members')}
          className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'members' ? 'bg-[#335f87] text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          주소록
        </button>
      </div>

      {/* ── 1. 본인 출석 확인 ── */}
      {subTab === 'myattend' && (
        <div className="space-y-4">
          {/* 월 선택 */}
          <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-gray-100 shadow-2xs text-xs">
            <div className="flex gap-1.5">
              {recentMonths.map(m => (
                <button
                  key={m.value}
                  onClick={() => setCalViewMonth(m.value)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    calViewMonth === m.value ? 'bg-[#335f87] text-white shadow-xs' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span className="font-bold text-gray-700 text-[11px] pr-2">{calViewMonth} 출석 현황</span>
          </div>

          {/* 내 출석 기록 */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
            <h3 className="font-bold text-xs text-gray-900">{getUserDisplayName(currentUser)}의 주일 출석 기록</h3>
            <div className="grid grid-cols-2 gap-2">
              {monthFilteredRecords.length > 0 ? (
                monthFilteredRecords.map(rec => (
                  <div
                    key={rec.dateStr}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs border ${
                      rec.status === 'ATTEND' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                    }`}
                  >
                    <span className="font-semibold text-gray-700">{rec.dateStr.slice(5).replace('-', '/')}</span>
                    <span className={`font-bold ${rec.status === 'ATTEND' ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {rec.status === 'ATTEND' ? '✅ 출석' : '❌ 결석'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="col-span-2 text-center text-xs text-gray-400 py-6">해당 월에 등록된 출석 기록이 없습니다.</p>
              )}
            </div>

            {/* 월간 통계 */}
            {monthFilteredRecords.length > 0 && (() => {
              const attend = monthFilteredRecords.filter(s => s.status === 'ATTEND').length
              const total = monthFilteredRecords.length
              const rate = total > 0 ? Math.round((attend / total) * 100) : 0
              return (
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>출석률</span>
                    <span className="font-bold text-[#335f87]">{attend}/{total}주 ({rate}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#335f87] h-full rounded-full transition-all" style={{ width: `${rate}%` }} />
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── 2. 출석체크 (리더/관리자) ── */}
      {subTab === 'check' && isLeaderOrAdmin && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-4">
            
            {/* 1번 요청사항: 주일 날짜 좌우 이동 네비게이터 (미래 이동 제한) */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-500 font-bold">주일 날짜 선택</label>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 p-1.5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setWeekOffset(prev => prev - 1)}
                  className="p-2 bg-white hover:bg-gray-100 text-gray-700 rounded-lg shadow-2xs border border-gray-100 transition-all flex items-center gap-1 text-xs font-bold"
                  title="이전 주차 (과거)"
                >
                  <ChevronLeft size={16} />
                  <span className="hidden sm:inline">이전주</span>
                </button>

                <div className="text-center px-2">
                  <span className="font-black text-sm text-[#335f87] block">
                    {currentSunday.labelStr}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">
                    {weekOffset === 0 ? '📍 가장 최근 주일' : `${Math.abs(weekOffset)}주 전 주일`}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={weekOffset >= 0}
                  onClick={() => setWeekOffset(prev => Math.min(0, prev + 1))}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1 text-xs font-bold ${
                    weekOffset >= 0
                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed border border-transparent'
                      : 'bg-white hover:bg-gray-100 text-gray-700 shadow-2xs border border-gray-100'
                  }`}
                  title={weekOffset >= 0 ? '미래 주차로는 이동할 수 없습니다' : '다음 주차'}
                >
                  <span className="hidden sm:inline">다음주</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* 관리자: 라브리 선택 탭 버튼 바 */}
            {currentUser.role === 'ADMIN' ? (
              <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-700 font-black flex items-center gap-1">
                    🏛️ 라브리 선택 (관리자 전용)
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    현재: {checkLabri === '미정' ? '라브리 미정' : checkLabri}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: '라브리1', label: '라브리1' },
                    { id: '라브리2', label: '라브리2' },
                    { id: '라브리3', label: '라브리3' },
                    { id: '미정', label: '미정/새가족' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { setCheckLabri(tab.id); setSelections({}) }}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${
                        checkLabri === tab.id
                          ? 'bg-[#335f87] text-white shadow-xs scale-102'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between text-xs">
                <span className="text-blue-900 font-bold">🏛️ {currentUser.labriId || '라브리 미정'} 출석체크</span>
                <span className="text-[10px] bg-white text-[#335f87] font-bold px-2 py-0.5 rounded-md border border-blue-200">
                  라브리 리더 모드
                </span>
              </div>
            )}

            {/* 전원 출석 퀵 버튼 */}
            <div className="flex items-center justify-between bg-amber-50 border border-amber-100 p-2.5 rounded-xl text-xs">
              <span className="text-[11px] text-amber-900 font-medium">💡 전원 출석 선택 후 결석자만 변경하세요.</span>
              <button
                type="button"
                onClick={() => {
                  const newSel: Record<string, 'ATTEND' | 'ABSENT'> = {}
                  targetMembers.forEach(m => { newSel[m.id] = 'ATTEND' })
                  setSelections(newSel)
                }}
                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold shrink-0 hover:bg-emerald-700 transition-all shadow-xs"
              >
                ⚡ 전원 출석 선택
              </button>
            </div>

            {/* 성도별 출석 선택 목록 */}
            <div className="space-y-2">
              {targetMembers.length > 0 ? (
                targetMembers.map(member => {
                  const sel = selections[member.id]
                  return (
                    <div key={member.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{member.name}</span>
                          <span className="text-[10px] text-gray-400">{member.duty}</span>
                          <span className="text-[10px] text-[#335f87] bg-blue-50 px-1.5 py-0.5 rounded">
                            {member.labriId || '미정'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setSelections(p => ({ ...p, [member.id]: 'ATTEND' }))}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                              sel === 'ATTEND' ? 'bg-emerald-600 text-white shadow-xs scale-105' : 'bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50'
                            }`}
                          >
                            ✅ 출석
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelections(p => ({ ...p, [member.id]: 'ABSENT' }))}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                              sel === 'ABSENT' ? 'bg-rose-600 text-white shadow-xs scale-105' : 'bg-white border border-gray-200 text-gray-600 hover:bg-rose-50'
                            }`}
                          >
                            ❌ 결석
                          </button>
                        </div>
                      </div>

                      {/* 결석 사유 태그 및 입력창 */}
                      {sel === 'ABSENT' && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex gap-1 flex-wrap text-[10px]">
                            {['출장', '여행', '병가', '개인사정', '가족행사'].map(tag => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setNotes(p => ({ ...p, [member.id]: tag }))}
                                className={`px-2 py-0.5 rounded-md border transition-all ${
                                  notes[member.id] === tag ? 'bg-rose-100 border-rose-300 text-rose-800 font-bold' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
                                }`}
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            placeholder="결석 사유 직접 입력..."
                            value={notes[member.id] || ''}
                            onChange={e => setNotes(p => ({ ...p, [member.id]: e.target.value }))}
                            className="w-full text-xs p-2 bg-white rounded-lg border border-rose-200 focus:outline-none text-gray-900 font-medium"
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="py-6 text-center text-xs text-gray-400">
                  선택한 라브리에 등록된 성도가 없습니다.
                </div>
              )}
            </div>

            {/* 제출 버튼 (2번 요청사항: DB 저장 연동) */}
            <button
              disabled={!allSelected || isSubmitting}
              onClick={handleSubmit}
              className={`w-full py-3 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                allSelected && !isSubmitting
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <CheckSquare size={16} />
              {isSubmitting
                ? '⏳ 저장 중...'
                : submitted
                ? '✅ 출석체크 저장 완료 (다시 수정 가능)'
                : allSelected
                ? `✅ ${currentSunday.displayStr} 출석체크 제출하기`
                : `모든 성도의 출석/결석을 선택해주세요 (${Object.keys(selections).length}/${targetMembers.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ── 3. 주소록 ── */}
      {subTab === 'members' && (
        <div className="space-y-3">
          {/* 내 라브리 / 전체 스위치 */}
          <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-medium">
            <button
              onClick={() => setMemberFilter('my')}
              className={`flex-1 py-1.5 rounded-lg transition-all ${memberFilter === 'my' ? 'bg-gray-100 text-[#335f87] font-bold' : 'text-gray-400'}`}
            >
              {currentUser.labriId || '내 라브리'}
            </button>
            <button
              onClick={() => setMemberFilter('all')}
              className={`flex-1 py-1.5 rounded-lg transition-all ${memberFilter === 'all' ? 'bg-gray-100 text-[#335f87] font-bold' : 'text-gray-400'}`}
            >
              전체 성도
            </button>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="이름, 직분, 주소 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none text-gray-900 font-medium"
            />
          </div>

          <div className="space-y-2.5">
            {filteredMembers.map(member => (
              <div key={member.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#335f87]/10 text-[#335f87] font-bold flex items-center justify-center text-xs shrink-0">
                        {member.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-gray-900">{member.name}</span>
                          <span className="text-[10px] bg-blue-50 text-[#335f87] font-semibold px-2 py-0.5 rounded-full">{member.duty}</span>
                        </div>
                        <p className="text-[11px] text-gray-400">{member.labriId || '라브리 미정'}</p>
                      </div>
                    </div>
                  </div>
                  <a href={`tel:${member.phone}`} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-emerald-100 transition-all">
                    <Phone size={14} /> 전화
                  </a>
                </div>
                <div className="pt-2 border-t border-gray-50 space-y-1 text-[11px]">
                  {member.phone && <p className="text-gray-500 font-mono">{member.phone}</p>}
                  {member.address && (
                    <div className="flex items-start gap-1 text-gray-500">
                      <MapPin size={12} className="text-[#335f87] mt-0.5 shrink-0" />
                      <span>{member.address}</span>
                    </div>
                  )}
                  {member.familyInfo && (
                    <div className="flex items-start gap-1 text-amber-800 bg-amber-50/60 px-2 py-1 rounded-lg">
                      <Users size={12} className="text-amber-600 mt-0.5 shrink-0" />
                      <span>{member.familyInfo}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
