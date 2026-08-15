'use client'

import { useState } from 'react'
import { Calendar, CheckCircle2, Phone, Search, MapPin, Users, ChevronDown } from 'lucide-react'
import { UserProfile } from '../../lib/mockData'

interface AttendanceTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

// Mock 출석 기록 (월별)
const MOCK_MY_ATTENDANCE: Record<string, 'ATTEND' | 'ABSENT' | null> = {
  '2026-07-06': 'ATTEND',
  '2026-07-13': 'ATTEND',
  '2026-07-20': 'ABSENT',
  '2026-07-27': 'ATTEND',
  '2026-08-02': 'ATTEND',
  '2026-08-09': null,
}

// Mock 전체 출석 기록 (라브리원)
const MOCK_FULL_ATTENDANCE: { userId: string; userName: string; labriId: string; dateStr: string; status: 'ATTEND' | 'ABSENT'; note?: string }[] = [
  { userId: 'u1', userName: '김목사', labriId: '라브리1', dateStr: '2026-08-02', status: 'ATTEND' },
  { userId: 'u1_wife', userName: '이사모', labriId: '라브리1', dateStr: '2026-08-02', status: 'ATTEND' },
  { userId: 'u2', userName: '이리더', labriId: '라브리1', dateStr: '2026-08-02', status: 'ATTEND' },
  { userId: 'u3', userName: '박성도', labriId: '라브리1', dateStr: '2026-08-02', status: 'ABSENT', note: '해외 출장' },
  { userId: 'u4', userName: '최리더', labriId: '라브리2', dateStr: '2026-08-02', status: 'ATTEND' },
  { userId: 'u5', userName: '정성도', labriId: '라브리3', dateStr: '2026-08-02', status: 'ABSENT', note: '병가' },
]

const SUNDAY_DATES = ['2026-08-09', '2026-08-02', '2026-07-27', '2026-07-20']

export default function AttendanceTab({ currentUser, allUsers }: AttendanceTabProps) {
  const [subTab, setSubTab] = useState<'myattend' | 'check' | 'members'>('myattend')
  const isLeaderOrAdmin = currentUser.role === 'LEADER' || currentUser.role === 'ADMIN'

  // ── 본인 출석 달력 ──
  const [calViewMonth, setCalViewMonth] = useState('2026-08')
  const monthDates = Object.entries(MOCK_MY_ATTENDANCE)
    .filter(([d]) => d.startsWith(calViewMonth))

  // ── 출석체크 (리더/관리자) ──
  const [checkDate, setCheckDate] = useState('2026-08-09')
  const [checkLabri, setCheckLabri] = useState(currentUser.labriId || '라브리1')
  const [selections, setSelections] = useState<Record<string, 'ATTEND' | 'ABSENT' | null>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const targetMembers = allUsers.filter(u =>
    u.role !== 'PENDING' &&
    (currentUser.role === 'ADMIN' ? u.labriId === checkLabri : u.labriId === currentUser.labriId)
  )
  const allSelected = targetMembers.length > 0 && targetMembers.every(u => selections[u.id] != null)

  const handleSubmit = () => {
    if (!allSelected) return
    setSubmitted(true)
    alert(`${checkDate} 출석체크 제출 완료!`)
  }

  // ── 주소록 ──
  const [memberFilter, setMemberFilter] = useState<'my' | 'all'>('my')
  const [search, setSearch] = useState('')
  const filteredMembers = allUsers.filter(u => {
    if (u.role === 'PENDING') return false
    if (memberFilter === 'my' && currentUser.labriId && u.labriId !== currentUser.labriId) return false
    if (search) return u.name.includes(search) || u.duty.includes(search) || (u.address || '').includes(search)
    return true
  })

  return (
    <div className="space-y-4 pb-6">
      {/* 서브탭 */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold">
        <button onClick={() => setSubTab('myattend')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'myattend' ? 'bg-[#335f87] text-white' : 'text-gray-500'}`}>
          본인 출석 확인
        </button>
        {isLeaderOrAdmin && (
          <button onClick={() => setSubTab('check')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'check' ? 'bg-[#335f87] text-white' : 'text-gray-500'}`}>
            출석체크
          </button>
        )}
        <button onClick={() => setSubTab('members')} className={`flex-1 py-2 rounded-lg transition-all ${subTab === 'members' ? 'bg-[#335f87] text-white' : 'text-gray-500'}`}>
          주소록
        </button>
      </div>

      {/* ── 1. 본인 출석 확인 ── */}
      {subTab === 'myattend' && (
        <div className="space-y-4">
          {/* 월 선택 */}
          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-2xs text-xs">
            <button onClick={() => setCalViewMonth('2026-07')} className={`px-3 py-1.5 rounded-lg font-bold ${calViewMonth === '2026-07' ? 'bg-[#335f87] text-white' : 'text-gray-500 bg-gray-100'}`}>7월</button>
            <span className="font-bold text-gray-900">{calViewMonth} 주일 출석 현황</span>
            <button onClick={() => setCalViewMonth('2026-08')} className={`px-3 py-1.5 rounded-lg font-bold ${calViewMonth === '2026-08' ? 'bg-[#335f87] text-white' : 'text-gray-500 bg-gray-100'}`}>8월</button>
          </div>

          {/* 내 출석 기록 */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
            <h3 className="font-bold text-xs text-gray-900">{currentUser.name} 성도의 주일 출석 기록</h3>
            <div className="grid grid-cols-2 gap-2">
              {monthDates.length > 0 ? monthDates.map(([date, status]) => (
                <div key={date} className={`flex items-center justify-between p-2.5 rounded-xl text-xs border ${status === 'ATTEND' ? 'bg-emerald-50 border-emerald-100' : status === 'ABSENT' ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100'}`}>
                  <span className="font-semibold text-gray-700">{date.slice(5).replace('-', '/')}</span>
                  <span className={`font-bold ${status === 'ATTEND' ? 'text-emerald-700' : status === 'ABSENT' ? 'text-rose-600' : 'text-gray-400'}`}>
                    {status === 'ATTEND' ? '✅ 출석' : status === 'ABSENT' ? '❌ 결석' : '⏳ 예정'}
                  </span>
                </div>
              )) : (
                <p className="col-span-2 text-center text-xs text-gray-400 py-4">해당 월 기록이 없습니다.</p>
              )}
            </div>

            {/* 월간 통계 */}
            {monthDates.length > 0 && (() => {
              const attend = monthDates.filter(([, s]) => s === 'ATTEND').length
              const total = monthDates.filter(([, s]) => s !== null).length
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

          {/* 전체 출석 현황 (리더 및 관리자만 열람 가능하여 성도 개인정보/사생활 보호) */}
          {isLeaderOrAdmin && (
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
              <h3 className="font-bold text-xs text-gray-900">소속 성도 최근 출석 현황 (리더/관리자 전용)</h3>
              <div className="space-y-2">
                {MOCK_FULL_ATTENDANCE.filter(r => r.dateStr === '2026-08-02').map(rec => (
                  <div key={rec.userId} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl text-xs">
                    <div>
                      <span className="font-bold text-gray-800">{rec.userName}</span>
                      <span className="text-[10px] text-gray-400 ml-1.5">{rec.labriId}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${rec.status === 'ATTEND' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {rec.status === 'ATTEND' ? '출석' : '결석'}
                      </span>
                      {rec.note && <p className="text-[10px] text-gray-400">{rec.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 2. 출석체크 (리더/관리자) ── */}
      {subTab === 'check' && isLeaderOrAdmin && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
            {/* 날짜 선택 */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 font-bold">주일 날짜 선택</label>
              <select value={checkDate} onChange={e => { setCheckDate(e.target.value); setSelections({}); setSubmitted(false) }}
                className="w-full text-xs bg-gray-50 border border-gray-200 p-2 rounded-lg font-bold text-[#335f87]">
                {SUNDAY_DATES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* 관리자: 라브리 선택 (라브리 미정 옵션 포함) */}
            {currentUser.role === 'ADMIN' && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold">라브리 선택</label>
                <select value={checkLabri} onChange={e => { setCheckLabri(e.target.value); setSelections({}) }}
                  className="w-full text-xs bg-slate-900 text-amber-300 border border-slate-700 p-2 rounded-lg font-bold">
                  <option value="라브리1">라브리1</option>
                  <option value="라브리2">라브리2</option>
                  <option value="라브리3">라브리3</option>
                  <option value="미정">라브리 미정/새가족</option>
                </select>
              </div>
            )}

            <div className="flex items-center justify-between bg-amber-50 border border-amber-100 p-2.5 rounded-xl text-xs">
              <span className="text-[11px] text-amber-900 font-medium">💡 빠르게 체킹하려면 전원 출석 선택을 활용하세요.</span>
              <button
                type="button"
                onClick={() => {
                  const newSel: Record<string, 'ATTEND' | 'ABSENT'> = {}
                  targetMembers.forEach(m => { newSel[m.id] = 'ATTEND' })
                  setSelections(newSel)
                }}
                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold shrink-0 hover:bg-emerald-700"
              >
                ⚡ 전원 출석 선택
              </button>
            </div>

            {/* 성도별 출석 선택 */}
            <div className="space-y-2">
              {targetMembers.map(member => {
                const sel = selections[member.id]
                return (
                  <div key={member.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{member.name}</span>
                        <span className="text-[10px] text-gray-400">{member.duty}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setSelections(p => ({ ...p, [member.id]: 'ATTEND' }))}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${sel === 'ATTEND' ? 'bg-emerald-600 text-white shadow-xs scale-105' : 'bg-white border border-gray-200 text-gray-600 hover:bg-emerald-50'}`}>
                          ✅ 출석
                        </button>
                        <button onClick={() => setSelections(p => ({ ...p, [member.id]: 'ABSENT' }))}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${sel === 'ABSENT' ? 'bg-rose-600 text-white shadow-xs scale-105' : 'bg-white border border-gray-200 text-gray-600 hover:bg-rose-50'}`}>
                          ❌ 결석
                        </button>
                      </div>
                    </div>
                    {sel === 'ABSENT' && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex gap-1 flex-wrap text-[10px]">
                          {['출장', '여행', '병가', '개인사정'].map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setNotes(p => ({ ...p, [member.id]: tag }))}
                              className={`px-2 py-0.5 rounded-md border transition-all ${notes[member.id] === tag ? 'bg-rose-100 border-rose-300 text-rose-800 font-bold' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                        <input type="text" placeholder="결석 사유 직접 입력..."
                          value={notes[member.id] || ''}
                          onChange={e => setNotes(p => ({ ...p, [member.id]: e.target.value }))}
                          className="w-full text-xs p-2 bg-white rounded-lg border border-rose-200 focus:outline-none" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 제출 버튼 */}
            <button disabled={!allSelected} onClick={handleSubmit}
              className={`w-full py-3 rounded-xl text-xs font-bold transition-all shadow-sm ${allSelected ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
              {allSelected ? '✅ 출석체크 제출하기' : `모든 성도의 출석/결석을 선택해주세요 (${Object.keys(selections).length}/${targetMembers.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ── 3. 주소록 ── */}
      {subTab === 'members' && (
        <div className="space-y-3">
          {/* 내 라브리 / 전체 스위치 */}
          <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-medium">
            <button onClick={() => setMemberFilter('my')} className={`flex-1 py-1.5 rounded-lg transition-all ${memberFilter === 'my' ? 'bg-gray-100 text-[#335f87] font-bold' : 'text-gray-400'}`}>
              {currentUser.labriId || '내 라브리'}
            </button>
            <button onClick={() => setMemberFilter('all')} className={`flex-1 py-1.5 rounded-lg transition-all ${memberFilter === 'all' ? 'bg-gray-100 text-[#335f87] font-bold' : 'text-gray-400'}`}>
              전체 성도
            </button>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input type="text" placeholder="이름, 직분, 주소 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none" />
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
