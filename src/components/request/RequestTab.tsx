'use client'

import { useState, useMemo } from 'react'
import { Utensils, Clock, Lock, Users, ExternalLink, Edit, Trash2, X } from 'lucide-react'
import { UserProfile } from '../../lib/mockData'
import { getUpcomingSundays, isMealRegistrationLocked } from '../../lib/dateUtils'

interface RequestTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

export default function RequestTab({ currentUser, allUsers }: RequestTabProps) {
  const isAdmin = currentUser.role === 'ADMIN'

  // ── 식사 신청 ──
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const sundayDates = upcomingSundays.map(s => s.displayStr)
  const [selectedWeek, setSelectedWeek] = useState(0)
  const selectedSundayObj = upcomingSundays[selectedWeek]?.dateObj || new Date()
  const { isLocked, remainingText } = isMealRegistrationLocked(selectedSundayObj)

  const spouse = allUsers.find(u =>
    u.familyGroupId === currentUser.familyGroupId &&
    u.id !== currentUser.id &&
    currentUser.familyGroupId
  )
  const familyId = currentUser.familyGroupId || `fam_single_${currentUser.id}`

  const [familyMealStore, setFamilyMealStore] = useState<Record<string, Record<number, {
    submitted: boolean; attending: boolean; adultCount: number; childCount: number; updatedBy: string
  }>>>({
    fam_kim: { 0: { submitted: true, attending: true, adultCount: 2, childCount: 1, updatedBy: '이사모' } }
  })

  const currentMealData = familyMealStore[familyId]?.[selectedWeek] || {
    submitted: false, attending: true, adultCount: 1, childCount: 0, updatedBy: ''
  }
  const [tempAttending, setTempAttending] = useState(true)
  const [tempAdult, setTempAdult] = useState(1)
  const [tempChild, setTempChild] = useState(0)

  // ── 토스트 (alert 대체) ──
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1000)
  }

  const handleSelectWeek = (idx: number) => {
    setSelectedWeek(idx)
    const d = familyMealStore[familyId]?.[idx]
    setTempAttending(d?.attending ?? true)
    setTempAdult(d?.adultCount ?? 1)
    setTempChild(d?.childCount ?? 0)
  }

  const handleSaveMeal = () => {
    if (isLocked) return
    setFamilyMealStore(prev => ({
      ...prev,
      [familyId]: {
        ...(prev[familyId] || {}),
        [selectedWeek]: {
          submitted: true,
          attending: tempAttending,
          adultCount: tempAttending ? tempAdult : 0,
          childCount: tempAttending ? tempChild : 0,
          updatedBy: currentUser.name,
        }
      }
    }))
    showToast(currentMealData.submitted ? '✅ 식사 신청이 수정되었습니다!' : '✅ 식사 신청이 완료되었습니다!')
  }

  // ── 행사 신청 (제목 + 내용 + URL 3필드) ──
  const [eventFormUrl, setEventFormUrl] = useState('')
  const [eventFormTitle, setEventFormTitle] = useState('')
  const [eventFormContent, setEventFormContent] = useState('') // 신설 "내용" 필드
  const [showEventEditModal, setShowEventEditModal] = useState(false)
  const [editUrl, setEditUrl] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  const handleSaveEventForm = () => {
    setEventFormUrl(editUrl.trim())
    setEventFormTitle(editTitle.trim())
    setEventFormContent(editContent.trim())
    setShowEventEditModal(false)
    showToast(editUrl.trim() ? '✅ 행사 신청 링크가 등록되었습니다!' : '행사 신청 링크가 삭제되었습니다.')
  }

  return (
    <div className="space-y-5 pb-6">
      {/* 1초 소멸 토스트 */}
      {toastMsg && (
        <div className="fixed top-[88px] left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* ─── 1. 주일 식사 신청 ─── */}
      <section className="bg-white rounded-2xl p-5 border border-blue-50 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#f1f4fa] text-[#335f87] rounded-xl"><Utensils size={18} /></span>
            <h2 className="font-bold text-gray-900 text-sm">주일 식사 신청</h2>
          </div>
          <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isLocked ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <Clock size={10} /> {remainingText}
          </span>
        </div>

        {spouse && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
            <Users size={14} className="text-emerald-600 shrink-0" />
            <span>배우자 <strong>[{spouse.name}]</strong> 성도님과 식사 신청이 연동됩니다.</span>
          </div>
        )}

        {/* 향후 4주 탭 (월요일 기준 동적) */}
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-gray-50 rounded-xl text-xs font-medium">
          {sundayDates.map((dateStr, idx) => (
            <button key={idx} onClick={() => handleSelectWeek(idx)}
              className={`py-1.5 rounded-lg transition-all ${selectedWeek === idx ? 'bg-white text-[#335f87] font-bold shadow-xs' : 'text-gray-500'}`}
            >{dateStr}</button>
          ))}
        </div>

        <div className="bg-[#f7f9ff] p-3.5 rounded-xl border border-blue-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">{sundayDates[selectedWeek]} 식사 여부</span>
            {!isLocked ? (
              <div className="flex bg-[#f1f4fa] p-1 rounded-xl text-xs font-bold">
                <button onClick={() => setTempAttending(true)} className={`px-4 py-1.5 rounded-lg transition-all ${tempAttending ? 'bg-[#335f87] text-white shadow-xs' : 'text-gray-500'}`}>식사함</button>
                <button onClick={() => setTempAttending(false)} className={`px-4 py-1.5 rounded-lg transition-all ${!tempAttending ? 'bg-gray-400 text-white shadow-xs' : 'text-gray-500'}`}>안함</button>
              </div>
            ) : (
              <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Lock size={12} /> 마감됨</span>
            )}
          </div>

          {tempAttending && (
            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
              {[{ label: '성인', val: tempAdult, set: setTempAdult, min: 1 }, { label: '어린이', val: tempChild, set: setTempChild, min: 0 }].map(({ label, val, set, min }) => (
                <div key={label} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-gray-100">
                  <span className="text-gray-600 font-bold">{label}</span>
                  <div className="flex items-center gap-2">
                    <button disabled={isLocked} onClick={() => set(Math.max(min, val - 1))} className="w-5 h-5 bg-gray-100 rounded text-gray-600 flex items-center justify-center font-bold disabled:opacity-50">-</button>
                    <span className="font-bold text-[#335f87] w-4 text-center">{val}</span>
                    <button disabled={isLocked} onClick={() => set(val + 1)} className="w-5 h-5 bg-gray-100 rounded text-gray-600 flex items-center justify-center font-bold disabled:opacity-50">+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLocked ? (
            <button
              onClick={handleSaveMeal}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                currentMealData.submitted ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-[#335f87] hover:bg-[#2b5072] text-white'
              }`}
            >
              {currentMealData.submitted ? `수정하기 (최종: ${currentMealData.updatedBy})` : '식사 신청하기'}
            </button>
          ) : (
            <div className="w-full py-2.5 bg-gray-200 text-gray-500 font-bold text-xs rounded-xl text-center flex items-center justify-center gap-1">
              <Lock size={12} /> 신청 완료 (마감시간 경과)
            </div>
          )}
        </div>
      </section>

      {/* ─── 2. 교회 행사 신청 (제목 + 내용 + URL) ─── */}
      <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">📋</span>
            <h2 className="font-bold text-gray-900 text-sm">교회 행사 신청</h2>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setEditUrl(eventFormUrl)
                setEditTitle(eventFormTitle)
                setEditContent(eventFormContent)
                setShowEventEditModal(true)
              }}
              className="px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-bold rounded-lg hover:bg-purple-100 flex items-center gap-1"
            >
              <Edit size={11} /> 링크 관리
            </button>
          )}
        </div>

        {eventFormTitle || eventFormContent || eventFormUrl ? (
          <div className="space-y-2.5">
            {/* 행사 제목 */}
            {eventFormTitle && (
              <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl text-xs">
                <p className="font-bold text-purple-800 text-sm">📌 {eventFormTitle}</p>
              </div>
            )}
            {/* 행사 내용 */}
            {eventFormContent && (
              <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-700 leading-relaxed border border-gray-100 whitespace-pre-wrap">
                {eventFormContent}
              </div>
            )}
            {/* URL 있을 때: 구글폼 버튼 */}
            {eventFormUrl ? (
              <a
                href={eventFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                <ExternalLink size={14} /> 구글 폼 신청하러 가기
              </a>
            ) : (
              // URL 없을 때: 신청안내 amber 강조 버튼
              <div className="w-full py-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800 font-bold">
                📢 담당자에게 직접 신청해 주세요
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center space-y-1.5">
            <p className="text-2xl">📭</p>
            <p className="text-sm font-bold text-gray-500">현재 진행 중인 행사가 없습니다</p>
            <p className="text-[11px] text-gray-400">행사 일정이 확정되면 신청 안내가 이곳에 게시됩니다.</p>
          </div>
        )}
      </section>

      {/* 관리자: 행사 등록/수정 모달 (제목 + 내용 + URL 3필드) */}
      {showEventEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900">📋 행사 신청 관리 (관리자)</h3>
              <button onClick={() => setShowEventEditModal(false)} className="text-gray-400"><X size={16} /></button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] text-gray-400 font-bold">행사 이름</label>
                <input
                  type="text"
                  placeholder="예: 2026 여름 수련회"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">내용 (신청 안내사항)</label>
                <textarea
                  rows={4}
                  placeholder="행사 일시, 장소, 신청 방법 등 안내 내용을 입력하세요..."
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">구글 폼 URL (없으면 빈칸)</label>
                <input
                  type="url"
                  placeholder="https://forms.google.com/..."
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]"
                />
                <p className="text-[10px] text-gray-400 mt-1">URL 미입력 시 "담당자에게 직접 신청" 안내 표시</p>
              </div>
              {(eventFormTitle || eventFormUrl) && (
                <button
                  type="button"
                  onClick={() => { setEditUrl(''); setEditTitle(''); setEditContent('') }}
                  className="w-full py-2 bg-rose-50 text-rose-600 text-xs font-bold rounded-xl flex items-center justify-center gap-1"
                >
                  <Trash2 size={12} /> 행사 신청 전체 삭제
                </button>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowEventEditModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSaveEventForm} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
