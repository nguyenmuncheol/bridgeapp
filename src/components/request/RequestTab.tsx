'use client'

import { useState, useMemo, useEffect } from 'react'
import { Utensils, Pencil, Clock, Lock, Users, ExternalLink, Edit, Trash2, X } from 'lucide-react'
import { UserProfile, getSimpleUserName, simplifyStoredName } from '../../lib/mockData'
import { getUpcomingSundays, isMealRegistrationLocked, formatDateTimeShort } from '../../lib/dateUtils'
import { dbFetchMealRegistrations, dbSaveMealRegistration, dbCleanupStaleMealRegistrations, dbFetchLatestEventForm, dbUpsertEventForm } from '../../lib/db'
import { familyKeyOf, resolveFamilyKey, staleFamilyKeys } from '../../lib/familyKey'
import { useCachedQuery } from '../../lib/dataCache'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'

interface RequestTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  /** 알림 등에서 특정 서브탭을 열어달라고 요청할 때 ('meal' | 'event') */
  openSubTab?: string
  /** 같은 서브탭을 연달아 요청해도 다시 열리도록 하는 번호표 */
  openToken?: number
}

interface MealSlotData {
  submitted: boolean
  attending: boolean
  adultCount: number
  childCount: number
  updatedBy: string
  updatedAt: string
}

export default function RequestTab({ currentUser, allUsers, openSubTab = '', openToken = 0 }: RequestTabProps) {
  const isAdmin = currentUser.role === 'ADMIN'

  // ── 서브탭: 주일식사 | 교회행사 (다른 메뉴와 같은 모양) ──
  const [subTab, setSubTab] = useState<'meal' | 'event'>(() => {
    if (openSubTab === 'meal' || openSubTab === 'event') return openSubTab
    return 'meal'
  })

  const [prevToken, setPrevToken] = useState(openToken)
  if (openToken !== prevToken) {
    setPrevToken(openToken)
    if (openSubTab === 'meal' || openSubTab === 'event') {
      setSubTab(openSubTab)
    }
  }

  const goSubTab = (next: 'meal' | 'event') => {
    setSubTab(next)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // ── 식사 신청 ──
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const sundayDates = useMemo(() => upcomingSundays.map(s => s.displayStr), [upcomingSundays])
  const [selectedWeek, setSelectedWeek] = useState(0)
  const selectedSundayObj = upcomingSundays[selectedWeek]?.dateObj || new Date()

  const [clockTick, setClockTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setClockTick(t => t + 1), 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') setClockTick(t => t + 1) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const { isLocked, remainingText } = useMemo(
    () => isMealRegistrationLocked(selectedSundayObj),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSundayObj, clockTick]
  )

  const spouse = allUsers.find(u =>
    u.familyGroupId === currentUser.familyGroupId &&
    u.id !== currentUser.id &&
    currentUser.familyGroupId
  )
  const familyId = familyKeyOf(currentUser)

  const mealDateStrs = useMemo(() => upcomingSundays.map(s => s.dateStr), [upcomingSundays])
  const { data: mealRegistrations } = useCachedQuery(
    `mealRegistrations:${mealDateStrs[0] || ''}`,
    () => dbFetchMealRegistrations(mealDateStrs)
  )

  const derivedMealStore = useMemo(() => {
    if (!mealRegistrations || mealRegistrations.length === 0) return {}
    const newStore: Record<string, Record<number, MealSlotData>> = {}
    const stamp: Record<string, string> = {}
    mealRegistrations.forEach(r => {
      const wIdx = upcomingSundays.findIndex(s => s.dateStr === r.date_str)
      if (wIdx === -1) return
      const key = resolveFamilyKey(r.family_group_id, allUsers)
      const seenAt = String(r.updated_at || r.created_at || '')
      const slot = `${key}#${wIdx}`
      if (stamp[slot] !== undefined && stamp[slot] >= seenAt) return
      stamp[slot] = seenAt
      if (!newStore[key]) newStore[key] = {}
      newStore[key][wIdx] = {
        submitted: true,
        attending: r.attending,
        adultCount: r.adult_count,
        childCount: r.child_count,
        updatedBy: simplifyStoredName(r.registered_by_user_name),
        updatedAt: String(r.updated_at || r.created_at || '')
      }
    })
    return newStore
  }, [mealRegistrations, upcomingSundays, allUsers])

  const [familyMealStoreOverride, setFamilyMealStoreOverride] = useState<Record<string, Record<number, MealSlotData>>>({})

  const familyMealStore = useMemo(() => {
    const res: Record<string, Record<number, MealSlotData>> = {}
    Object.keys(derivedMealStore).forEach(k => {
      res[k] = { ...derivedMealStore[k] }
    })
    Object.keys(familyMealStoreOverride).forEach(k => {
      res[k] = { ...(res[k] || {}), ...familyMealStoreOverride[k] }
    })
    return res
  }, [derivedMealStore, familyMealStoreOverride])

  const currentMealData: MealSlotData = familyMealStore[familyId]?.[selectedWeek] || {
    submitted: false, attending: true, adultCount: 1, childCount: 0, updatedBy: '', updatedAt: ''
  }

  // 사용자 편집 임시 상태 (주차 전환 시 자동 초기화)
  const [customDraft, setCustomDraft] = useState<{ attending: boolean; adult: number; child: number } | null>(null)
  const tempAttending = customDraft !== null ? customDraft.attending : (currentMealData.submitted ? currentMealData.attending : true)
  const tempAdult = customDraft !== null ? customDraft.adult : (currentMealData.submitted ? currentMealData.adultCount : 1)
  const tempChild = customDraft !== null ? customDraft.child : (currentMealData.submitted ? currentMealData.childCount : 0)

  // ── 토스트 (alert 대체) ──
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  // ── 행사 신청 (제목 + 내용 + URL 3필드) ──
  const { data: latestEventForm } = useCachedQuery('eventForm:latest', () => dbFetchLatestEventForm())
  const [eventFormOverride, setEventFormOverride] = useState<{ title: string; content: string; url: string; manager: string } | null>(null)

  const eventFormTitle = eventFormOverride?.title ?? latestEventForm?.title ?? ''
  const eventFormContent = eventFormOverride?.content ?? latestEventForm?.content ?? ''
  const eventFormUrl = eventFormOverride?.url ?? latestEventForm?.url ?? ''
  const eventFormManager = eventFormOverride?.manager ?? latestEventForm?.manager ?? ''

  const [showEventEditModal, setShowEventEditModal] = useState(false)
  useModalDismiss(showEventEditModal, () => setShowEventEditModal(false))
  const [editUrl, setEditUrl] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editManager, setEditManager] = useState('')

  const handleSelectWeek = (idx: number) => {
    setSelectedWeek(idx)
    setCustomDraft(null)
  }

  const [isSavingMeal, setIsSavingMeal] = useState(false)

  const handleSaveMeal = async () => {
    if (isLocked || isSavingMeal) return
    const targetSunday = upcomingSundays[selectedWeek]?.dateStr || ''
    if (!targetSunday) {
      showToast('⚠️ 날짜를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.')
      return
    }

    setIsSavingMeal(true)
    const res = await dbSaveMealRegistration({
      familyGroupId: familyId,
      dateStr: targetSunday,
      registeredByUserId: currentUser.id,
      registeredByUserName: getSimpleUserName(currentUser),
      attending: tempAttending,
      adultCount: tempAttending ? tempAdult : 0,
      childCount: tempAttending ? tempChild : 0
    })
    setIsSavingMeal(false)

    if (res.error) {
      showToast('⚠️ 저장하지 못했습니다. 인터넷 상태를 확인하고 다시 시도해 주세요.')
      return
    }

    void dbCleanupStaleMealRegistrations(staleFamilyKeys(currentUser, allUsers), targetSunday)

    setFamilyMealStoreOverride(prev => ({
      ...prev,
      [familyId]: {
        ...(prev[familyId] || {}),
        [selectedWeek]: {
          submitted: true,
          attending: tempAttending,
          adultCount: tempAttending ? tempAdult : 0,
          childCount: tempAttending ? tempChild : 0,
          updatedBy: getSimpleUserName(currentUser),
          updatedAt: new Date().toISOString(),
        }
      }
    }))
    setCustomDraft(null)
    showToast(
      tempAttending
        ? `✅ 저장되었습니다 — 성인 ${tempAdult}명, 어린이 ${tempChild}명`
        : '✅ 저장되었습니다 — 이번 주는 식사하지 않습니다'
    )
  }

  const handleSaveEventForm = async () => {
    await dbUpsertEventForm({
      title: editTitle.trim(),
      content: editContent.trim(),
      url: editUrl.trim(),
      manager: editManager.trim()
    })
    setEventFormOverride({
      title: editTitle.trim(),
      content: editContent.trim(),
      url: editUrl.trim(),
      manager: editManager.trim()
    })
    setShowEventEditModal(false)
    showToast(editUrl.trim() ? '✅ 행사 신청 링크가 등록되었습니다!' : '행사 신청 링크가 삭제되었습니다.')
  }

  return (
    <div className="space-y-5 pb-6">
      {/* 1초 소멸 토스트 */}
      {toastMsg && (
        <div className="fixed top-[88px] left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* 서브탭 2종: 주일식사 | 교회행사 */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl text-xs font-bold text-center">
        <button
          onClick={() => goSubTab('meal')}
          className={`py-2 rounded-lg transition-all ${subTab === 'meal' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >🍚 주일식사</button>
        <button
          onClick={() => goSubTab('event')}
          className={`py-2 rounded-lg transition-all ${subTab === 'event' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >📋 교회행사</button>
      </div>

      {/* ─── 1. 주일 식사 신청 ─── */}
      <div className={subTab === 'meal' ? '' : 'hidden'}>
      <section className="bg-white rounded-2xl p-5 border border-blue-50 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#f1f4fa] text-[#335f87] rounded-xl"><Utensils size={18} /></span>
            <h2 className="font-bold text-gray-900 text-sm">주일 식사 신청</h2>
          </div>
          <span className={`text-2xs font-semibold border px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isLocked ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <Clock size={10} /> {remainingText}
          </span>
        </div>

        {/* 안내 카드 */}
        <div className={`p-3 rounded-xl border text-xs space-y-1 ${
          currentMealData.submitted
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
            : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}>
          {spouse && (
            <p className="flex items-start gap-1.5 leading-relaxed">
              <Users size={13} className="shrink-0 mt-0.5 opacity-70" />
              <span>배우자 <strong>[{getSimpleUserName(spouse)}]</strong>과 식사 신청이 연동됩니다.</span>
            </p>
          )}

          {currentMealData.submitted ? (
            <>
              <p className="flex items-start gap-1.5 leading-relaxed font-bold">
                <Utensils size={13} className="shrink-0 mt-0.5 opacity-70" />
                <span>
                  {currentMealData.attending
                    ? `현재 신청: 성인 ${currentMealData.adultCount}명 · 어린이 ${currentMealData.childCount}명`
                    : '현재 신청: 식사 안 함'}
                </span>
              </p>
              <p className="flex items-start gap-1.5 leading-relaxed text-2xs opacity-80">
                <Pencil size={13} className="shrink-0 mt-0.5 opacity-70" />
                <span>
                  최종 수정 {currentMealData.updatedBy || '성도님'}
                  {formatDateTimeShort(currentMealData.updatedAt)
                    ? ` (${formatDateTimeShort(currentMealData.updatedAt)})`
                    : ''}
                </span>
              </p>
            </>
          ) : (
            <p className="flex items-start gap-1.5 leading-relaxed font-bold">
              <Utensils size={13} className="shrink-0 mt-0.5 opacity-70" />
              <span>{sundayDates[selectedWeek]} · 아직 신청하지 않으셨습니다</span>
            </p>
          )}
        </div>

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
                <button
                  onClick={() => setCustomDraft({ attending: true, adult: tempAdult, child: tempChild })}
                  className={`px-4 py-1.5 rounded-lg transition-all ${tempAttending ? 'bg-[#335f87] text-white shadow-xs' : 'text-gray-500'}`}
                >식사함</button>
                <button
                  onClick={() => setCustomDraft({ attending: false, adult: tempAdult, child: tempChild })}
                  className={`px-4 py-1.5 rounded-lg transition-all ${!tempAttending ? 'bg-gray-400 text-white shadow-xs' : 'text-gray-500'}`}
                >안함</button>
              </div>
            ) : (
              <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Lock size={12} /> 마감됨</span>
            )}
          </div>

          {tempAttending && (
            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-1.5 text-xs">
              {[
                {
                  label: '성인',
                  val: tempAdult,
                  onChange: (v: number) => setCustomDraft({ attending: true, adult: v, child: tempChild }),
                  min: 1
                },
                {
                  label: '어린이',
                  val: tempChild,
                  onChange: (v: number) => setCustomDraft({ attending: true, adult: tempAdult, child: v }),
                  min: 0
                }
              ].map(({ label, val, onChange, min }) => (
                <div key={label} className="flex items-center justify-between gap-1 bg-white px-2 py-1.5 rounded-lg border border-gray-100">
                  <span className="text-gray-600 font-bold whitespace-nowrap shrink-0">{label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      disabled={isLocked}
                      onClick={() => onChange(Math.max(min, val - 1))}
                      aria-label={`${label} 인원 줄이기`}
                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 flex items-center justify-center font-bold text-base leading-none disabled:opacity-50 active:scale-95 transition-transform"
                    >−</button>
                    <span className="font-bold text-[#335f87] w-6 text-center text-sm tabular-nums">{val}</span>
                    <button
                      disabled={isLocked}
                      onClick={() => onChange(val + 1)}
                      aria-label={`${label} 인원 늘리기`}
                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 flex items-center justify-center font-bold text-base leading-none disabled:opacity-50 active:scale-95 transition-transform"
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLocked ? (
            <button
              onClick={handleSaveMeal}
              disabled={isSavingMeal}
              className={`w-full py-3 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-60 ${
                currentMealData.submitted ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-[#335f87] hover:bg-[#2b5072] text-white'
              }`}
            >
              {isSavingMeal
                ? '저장 중...'
                : !tempAttending
                  ? '식사 안 함으로 저장'
                  : currentMealData.submitted
                    ? '수정 내용 저장하기'
                    : '식사 신청하기'}
            </button>
          ) : (
            <div className="w-full space-y-1.5">
              {currentMealData.submitted ? (
                <div className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-xs rounded-xl text-center flex items-center justify-center gap-1">
                  <Lock size={12} />
                  {currentMealData.attending
                    ? `신청 완료 · 성인 ${currentMealData.adultCount}명, 어린이 ${currentMealData.childCount}명 (마감)`
                    : '식사 안 함으로 신청됨 (마감)'}
                </div>
              ) : (
                <div className="w-full py-2.5 bg-gray-100 text-gray-500 border border-gray-200 font-bold text-xs rounded-xl text-center flex items-center justify-center gap-1">
                  <Lock size={12} /> 이번 주는 신청하지 않으셨습니다 (마감)
                </div>
              )}
              {upcomingSundays.length > 1 && (
                <p className="text-2xs text-gray-400 text-center">
                  다음 주일은 위 날짜 탭에서 신청하실 수 있습니다.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
      </div>

      {/* ─── 2. 교회 행사 신청 (제목 + 내용 + URL) ─── */}
      <div className={subTab === 'event' ? '' : 'hidden'}>
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
                setEditManager(eventFormManager)
                setShowEventEditModal(true)
              }}
              className="px-2.5 py-1 bg-purple-50 text-purple-700 text-2xs font-bold rounded-lg hover:bg-purple-100 flex items-center gap-1"
            >
              <Edit size={11} /> 링크 관리
            </button>
          )}
        </div>

        {eventFormTitle || eventFormContent || eventFormUrl ? (
          <div className="space-y-2.5">
            {eventFormTitle && (
              <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl text-xs">
                <p className="font-bold text-purple-800 text-sm">📌 {eventFormTitle}</p>
              </div>
            )}
            {eventFormContent && (
              <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-700 leading-relaxed border border-gray-100 whitespace-pre-wrap">
                {eventFormContent}
              </div>
            )}
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
              <div className="w-full py-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800 font-bold">
                📢 {eventFormManager ? `담당자(${eventFormManager})에게 직접 신청해 주세요` : '담당자에게 직접 신청해 주세요'}
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center space-y-1.5">
            <p className="text-2xl">📭</p>
            <p className="text-sm font-bold text-gray-500">현재 진행 중인 행사가 없습니다</p>
            <p className="text-2xs text-gray-400">행사 일정이 확정되면 신청 안내가 이곳에 게시됩니다.</p>
          </div>
        )}
      </section>
      </div>

      {/* 관리자: 행사 등록/수정 모달 */}
      {showEventEditModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setShowEventEditModal(false))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900">📋 행사 신청 관리 (관리자)</h3>
              <button onClick={() => setShowEventEditModal(false)} className="text-gray-400"><X size={16} /></button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-2xs text-gray-400 font-bold">행사 이름</label>
                <input
                  type="text"
                  placeholder="예: 2026 여름 수련회"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                />
              </div>
              <div>
                <label className="text-2xs text-gray-400 font-bold">내용 (신청 안내사항)</label>
                <textarea
                  rows={4}
                  placeholder="행사 일시, 장소, 신청 방법 등 안내 내용을 입력하세요..."
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] resize-none text-gray-900 font-medium"
                />
              </div>
              <div>
                <label className="text-2xs text-gray-400 font-bold">구글 폼 URL (없으면 빈칸)</label>
                <input
                  type="url"
                  placeholder="https://forms.google.com/..."
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                />
                <p className="text-2xs text-gray-400 mt-1">URL 미입력 시 &quot;담당자에게 직접 신청&quot; 안내 표시</p>
              </div>
              <div>
                <label className="text-2xs text-gray-400 font-bold">담당자 이름 (선택)</label>
                <input
                  type="text"
                  placeholder="예: 홍길동"
                  value={editManager}
                  onChange={e => setEditManager(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                />
                <p className="text-2xs text-gray-400 mt-1">입력하면 &quot;담당자(홍길동)에게 직접 신청해 주세요&quot;로 표시됩니다</p>
              </div>
              {(eventFormTitle || eventFormUrl) && (
                <button
                  type="button"
                  onClick={() => { setEditUrl(''); setEditTitle(''); setEditContent(''); setEditManager('') }}
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
