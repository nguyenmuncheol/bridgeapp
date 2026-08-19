'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Edit2, Trash2 } from 'lucide-react'
import { UserProfile } from '../../lib/mockData'
import { birthdayMatchesCalendarDay } from '../../lib/dateUtils'
import { dbFetchChurchEvents, dbCreateChurchEvent, dbUpdateChurchEvent, dbDeleteChurchEvent } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import BirthdayList from './BirthdayList'

type EventType = 'sunday' | 'special'
interface ChurchEvent {
  id: string
  date: string
  title: string
  type: EventType
}

interface ScheduleCalendarProps {
  isLeaderOrAdmin: boolean
  addressBookEntries: UserProfile[]
  allUsers: UserProfile[]
}

// ── 교회일정 달력 (일정 편집 + 이달의 생일 성도) ──
export default function ScheduleCalendar({ isLeaderOrAdmin, addressBookEntries, allUsers }: ScheduleCalendarProps) {
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())

  const [customEvents, setCustomEvents] = useState<ChurchEvent[]>([])
  const [calEditModal, setCalEditModal] = useState<{ day: number; dateStr: string } | null>(null)
  const [editEventTitle, setEditEventTitle] = useState('')
  const [editEventType, setEditEventType] = useState<EventType>('special')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)

  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // 다른 탭 갔다 와도 반복 조회하지 않도록 캐시 사용
  const { data: churchEvents } = useCachedQuery('churchEvents', () => dbFetchChurchEvents())
  useEffect(() => {
    if (churchEvents && churchEvents.length > 0) setCustomEvents(churchEvents)
  }, [churchEvents])

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const monthLabel = `${calYear}년 ${calMonth + 1}월`

  // 주일예배는 일요일(0)마다 자동 생성 + 사용자 정의 일정 병합
  const getEventsForDate = (day: number): ChurchEvent[] => {
    const d = new Date(calYear, calMonth, day)
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const result: ChurchEvent[] = []

    // 일요일이면 주일예배 기본 자동 생성
    if (d.getDay() === 0) {
      const customSunday = customEvents.find(e => e.date === dateStr && e.type === 'sunday')
      result.push({
        id: customSunday ? customSunday.id : `auto_sunday_${dateStr}`,
        date: dateStr,
        title: customSunday ? customSunday.title : '주일 예배',
        type: 'sunday',
      })
    }

    // 커스텀 특별일정 추가
    const specials = customEvents.filter(e => e.date === dateStr && e.type === 'special')
    result.push(...specials)
    return result
  }

  // 생일 매칭 (입력 형식이 무엇이든 관대하게 파싱해서 비교). 자녀(미가입) 생일도 함께 표시.
  // 🐛 과거 버그: 2월 29일생 성도는 평년(2월이 28일까지)에는 달력에 🎂가 영영 안 떴습니다.
  // "이달의 생일" 목록에는 2월로 뜨는데 달력에는 없어서 누락된 것처럼 보였습니다.
  // → birthdayMatchesCalendarDay가 평년에는 2월 28일로 접어서 표시해 줍니다.
  //
  // 성능: 예전에는 날짜 칸마다(월 31칸 + 목록 재계산) 모든 성도의 생일을 다시 파싱해서
  // 200명 기준 월 6,000회 이상 파싱이 일어났습니다. 한 달치를 한 번만 계산해 재사용합니다.
  // 교회학교 그룹이 지정되지 않은 자녀는 생일 달력·생일 목록에서 뺍니다.
  // (생일을 안 적어도 되는 자녀라서, 빈 생일이 계속 재촉거리가 되지 않도록)
  const birthdayEntries = useMemo(
    () => addressBookEntries.filter(u => !u.isDependent || !!u.childLabriId),
    [addressBookEntries]
  )

  const birthdaysByDay = useMemo(() => {
    const map: Record<number, string[]> = {}
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate()
    for (let day = 1; day <= lastDay; day++) {
      const names = birthdayEntries
        .filter(u => birthdayMatchesCalendarDay(u.birthday, calYear, calMonth + 1, day))
        .map(u => u.name)
      if (names.length > 0) map[day] = names
    }
    return map
  }, [birthdayEntries, calYear, calMonth])

  const getBirthdaysForDate = (day: number): string[] => birthdaysByDay[day] || []

  // 달력 날짜 클릭 모달
  const handleDateClick = (day: number) => {
    if (!isLeaderOrAdmin) return
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setCalEditModal({ day, dateStr })
    setEditEventTitle('')
    setEditEventType('special')
    setEditingEventId(null)
  }

  const handleSaveEvent = async () => {
    if (!editEventTitle.trim() || !calEditModal) return
    // 🐛 과거 버그: 달력의 "주일 예배"는 DB에 없는 자동 생성 항목인데(id가 auto_sunday_...),
    // 연필 아이콘으로 이름을 바꾸면 존재하지 않는 행을 수정하려 해서 저장이 되지 않았습니다.
    // 화면상 오류만 나거나(또는 조용히 아무 일도 안 일어나고) 이름은 그대로였습니다.
    // → 자동 항목이면 수정 대신 새로 만듭니다.
    if (editingEventId && editingEventId.startsWith('auto_sunday_')) {
      const res = await dbCreateChurchEvent(calEditModal.dateStr, editEventTitle.trim(), 'sunday')
      if (res.error || !res.data?.id) {
        showToast('일정 저장 중 오류가 발생했습니다. 다시 시도해 주세요.', true)
        return
      }
      setCustomEvents(prev => [...prev, { id: res.data.id, date: calEditModal.dateStr, title: editEventTitle.trim(), type: 'sunday' }])
    } else if (editingEventId) {
      // 기존 일정 수정 (DB)
      const { error } = await dbUpdateChurchEvent(editingEventId, editEventTitle.trim())
      if (error) {
        showToast('일정 저장 중 오류가 발생했습니다. 다시 시도해 주세요.', true)
        return
      }
      setCustomEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, title: editEventTitle.trim() } : e))
    } else {
      // 신규 일정 등록 (DB)
      const res = await dbCreateChurchEvent(calEditModal.dateStr, editEventTitle.trim(), editEventType)
      if (res.error) {
        showToast('일정 등록 중 오류가 발생했습니다. 다시 시도해 주세요.', true)
        return
      }
      const newEv: ChurchEvent = {
        id: res.data?.id || `ev_${Date.now()}`,
        date: calEditModal.dateStr,
        title: editEventTitle.trim(),
        type: editEventType,
      }
      setCustomEvents(prev => [...prev, newEv])
    }
    setEditEventTitle('')
    setEditingEventId(null)
  }

  const handleDeleteEvent = async (evId: string) => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return
    const { error } = await dbDeleteChurchEvent(evId)
    if (error) {
      showToast('일정 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.', true)
      return
    }
    setCustomEvents(prev => prev.filter(e => e.id !== evId))
  }

  return (
    <div className="space-y-3">
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
        <div className="bg-[#335f87] text-white px-4 py-3 flex items-center justify-between">
          <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }} className="p-1 hover:bg-white/20 rounded-lg"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <span className="font-black text-sm">{monthLabel}</span>
            {isLeaderOrAdmin && <p className="text-[10px] text-blue-200 mt-0.5">날짜 클릭 시 일정 수정/추가 가능</p>}
          </div>
          <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }} className="p-1 hover:bg-white/20 rounded-lg"><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`text-center text-[10px] font-bold py-1.5 ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 p-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} className="aspect-square" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day
            const isSunday = (firstDay + i) % 7 === 0
            const isSat = (firstDay + i) % 7 === 6
            const dayEvents = getEventsForDate(day)
            const birthdays = getBirthdaysForDate(day)
            return (
              <div
                key={day}
                onClick={() => handleDateClick(day)}
                className={`aspect-square flex flex-col items-center justify-start pt-0.5 rounded-lg transition-all ${
                  isToday ? 'bg-[#335f87]/10 ring-1 ring-[#335f87]/30' : ''
                } ${isLeaderOrAdmin ? 'cursor-pointer hover:bg-blue-50/50' : ''}`}
              >
                <span className={`text-[11px] font-bold ${
                  isToday ? 'text-[#335f87]' : isSunday ? 'text-rose-500' : isSat ? 'text-blue-500' : 'text-gray-700'
                }`}>{day}</span>
                <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                  {dayEvents.map((ev, ei) => (
                    <span key={ei} className={`w-1.5 h-1.5 rounded-full ${ev.type === 'sunday' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                  ))}
                  {birthdays.length > 0 && <span className="text-[8px] leading-none">🎂</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 이달 일정 리스트 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs p-4 space-y-2">
        <h3 className="font-bold text-xs text-gray-900">이달 교회 일정</h3>
        <div className="space-y-1.5">
          {Array.from({ length: daysInMonth }).flatMap((_, i) => getEventsForDate(i + 1)).map((ev, idx) => (
            <div key={idx} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
              <span className={`w-2 h-2 rounded-full shrink-0 ${ev.type === 'sunday' ? 'bg-blue-400' : 'bg-amber-400'}`} />
              <span className="text-xs text-gray-500 font-mono shrink-0">{ev.date.slice(5).replace('-', '/')}</span>
              <span className="text-xs font-bold text-gray-800 flex-1">{ev.title}</span>
              {ev.type === 'special' && <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full">특별일정</span>}
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2 text-[10px] text-gray-500 border-t border-gray-100">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />주일예배</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />특별일정</span>
          <span className="flex items-center gap-1">🎂 생일</span>
        </div>
      </div>

      <BirthdayList addressBookEntries={birthdayEntries} allUsers={allUsers} calMonth={calMonth} />

      {/* ── 일정 텍스트 직접 수정/추가 모달 (관리자/리더) ── */}
      {calEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">📅 {calEditModal.dateStr} 일정 편집</h3>
              <button onClick={() => setCalEditModal(null)} className="text-gray-400 font-bold">✕</button>
            </div>

            {/* 해당 날짜 일정 목록 */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-400 font-bold">등록된 일정 목록 (클릭하여 수정)</p>
              {getEventsForDate(calEditModal.day).map(ev => (
                <div key={ev.id} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${ev.type === 'sunday' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                    <span className="font-bold text-gray-800">{ev.title}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingEventId(ev.id)
                        setEditEventTitle(ev.title)
                        setEditEventType(ev.type)
                      }}
                      className="text-blue-600 font-bold text-xs p-1 hover:bg-blue-50 rounded"
                    ><Edit2 size={12} /></button>
                    {ev.type !== 'sunday' && (
                      <button onClick={() => handleDeleteEvent(ev.id)} className="text-rose-500 font-bold text-xs p-1 hover:bg-rose-50 rounded"><Trash2 size={12} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 일정 이름 수정 또는 추가 */}
            <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
              <p className="text-[10px] text-gray-400 font-bold">{editingEventId ? '✏️ 일정 내용 수정' : '+ 새 일정 추가'}</p>
              <input
                type="text"
                placeholder="일정 이름 입력 (예: 주일 예배 + 세례식)"
                value={editEventTitle}
                onChange={e => setEditEventTitle(e.target.value)}
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
              />
              <div className="flex gap-2">
                {editingEventId && (
                  <button onClick={() => { setEditingEventId(null); setEditEventTitle('') }} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
                )}
                <button onClick={handleSaveEvent} disabled={!editEventTitle.trim()} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl disabled:opacity-40">
                  {editingEventId ? '저장하기' : '+ 추가하기'}
                </button>
              </div>
            </div>

            <button onClick={() => setCalEditModal(null)} className="w-full py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl">닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
