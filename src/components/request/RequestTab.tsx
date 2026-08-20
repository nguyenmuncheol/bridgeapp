'use client'

import { useState, useMemo, useEffect } from 'react'
import { Utensils, Pencil, Clock, Lock, Users, ExternalLink, Edit, Trash2, X } from 'lucide-react'
import { UserProfile, getSimpleUserName, simplifyStoredName } from '../../lib/mockData'
import { getUpcomingSundays, isMealRegistrationLocked, formatDateTimeShort } from '../../lib/dateUtils'
import { dbFetchMealRegistrations, dbSaveMealRegistration, dbCleanupStaleMealRegistrations, dbFetchLatestEventForm, dbUpsertEventForm } from '../../lib/db'
import { familyKeyOf, resolveFamilyKey, staleFamilyKeys } from '../../lib/familyKey'
import { useCachedQuery } from '../../lib/dataCache'

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
  // 🐛 과거 버그: 마감 여부를 화면이 그려질 때 딱 한 번만 계산했습니다. 홈 화면 앱을
  // 켜둔 채로 시간이 지나면(토요일 아침에 열어두고 오후에 다시 보는 경우) 이미 마감된
  // 시간인데도 "마감까지 3시간" 표시가 그대로였고, 저장 버튼도 그대로 눌렸습니다.
  // → 1분마다, 그리고 앱을 다시 볼 때마다 다시 계산합니다.
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
    // clockTick이 바뀔 때마다 다시 계산합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedSundayObj, clockTick]
  )

  const spouse = allUsers.find(u =>
    u.familyGroupId === currentUser.familyGroupId &&
    u.id !== currentUser.id &&
    currentUser.familyGroupId
  )
  // 가정 키는 familyKey.ts 한 곳에서만 만듭니다(화면·주방 집계가 같은 기준을 쓰도록).
  const familyId = familyKeyOf(currentUser)

  const [familyMealStore, setFamilyMealStore] = useState<Record<string, Record<number, {
    submitted: boolean; attending: boolean; adultCount: number; childCount: number; updatedBy: string; updatedAt: string
  }>>>({})

  const currentMealData = familyMealStore[familyId]?.[selectedWeek] || {
    submitted: false, attending: true, adultCount: 1, childCount: 0, updatedBy: '', updatedAt: ''
  }
  const [tempAttending, setTempAttending] = useState(true)
  const [tempAdult, setTempAdult] = useState(1)
  const [tempChild, setTempChild] = useState(0)

  // ── 토스트 (alert 대체) ──
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  // ── 행사 신청 (제목 + 내용 + URL 3필드) ──
  const [eventFormUrl, setEventFormUrl] = useState('')
  const [eventFormTitle, setEventFormTitle] = useState('')
  const [eventFormContent, setEventFormContent] = useState('')
  const [eventFormManager, setEventFormManager] = useState('')
  const [showEventEditModal, setShowEventEditModal] = useState(false)
  const [editUrl, setEditUrl] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editManager, setEditManager] = useState('')

  // Supabase DB에서 식사 신청 및 행사 신청 로드 (관리자 "식사" 탭과 캐시를 공유해 반복 조회하지 않음)
  // 화면에서 쓰는 4주치만 받아옵니다(과거 기록은 쓰지 않습니다).
  // 캐시 키에 첫 주일을 넣어, 주가 넘어가면 자동으로 새로 받아옵니다.
  const mealDateStrs = useMemo(() => upcomingSundays.map(s => s.dateStr), [upcomingSundays])
  const { data: mealRegistrations } = useCachedQuery(
    `mealRegistrations:${mealDateStrs[0] || ''}`,
    () => dbFetchMealRegistrations(mealDateStrs)
  )
  const { data: latestEventForm } = useCachedQuery('eventForm:latest', () => dbFetchLatestEventForm())

  useEffect(() => {
    if (!mealRegistrations || mealRegistrations.length === 0) return
    const newStore: Record<string, Record<number, any>> = {}
    const stamp: Record<string, string> = {}
    mealRegistrations.forEach(r => {
      const wIdx = upcomingSundays.findIndex(s => s.dateStr === r.date_str)
      if (wIdx === -1) return
      // 옛날 키로 저장된 줄도 지금 이 가정의 것으로 인식되게 변환합니다.
      const key = resolveFamilyKey(r.family_group_id, allUsers)
      const seenAt = String(r.updated_at || r.created_at || '')
      const slot = `${key}#${wIdx}`
      // 같은 가정에 옛/새 줄이 둘 다 있으면 가장 최근에 저장한 것만 씁니다.
      if (stamp[slot] !== undefined && stamp[slot] >= seenAt) return
      stamp[slot] = seenAt
      if (!newStore[key]) newStore[key] = {}
      newStore[key][wIdx] = {
        submitted: true,
        attending: r.attending,
        adultCount: r.adult_count,
        childCount: r.child_count,
        // 예전 기록은 '임진재 성도님'처럼 직분이 붙어 있어, 화면 표기를 '임진재님'으로 통일합니다.
        updatedBy: simplifyStoredName(r.registered_by_user_name),
        updatedAt: String(r.updated_at || r.created_at || '')
      }
    })
    setFamilyMealStore(prev => ({ ...prev, ...newStore }))
  }, [mealRegistrations, upcomingSundays, allUsers])

  useEffect(() => {
    if (!latestEventForm) return
    setEventFormTitle(latestEventForm.title)
    setEventFormContent(latestEventForm.content)
    setEventFormUrl(latestEventForm.url)
    setEventFormManager(latestEventForm.manager || '')
    setEditTitle(latestEventForm.title)
    setEditContent(latestEventForm.content)
    setEditUrl(latestEventForm.url)
  }, [latestEventForm])

  // 🐛 과거 버그(가장 심각): 저장된 인원을 화면 입력칸에 넣어주는 코드가
  // "주차 탭을 손으로 눌렀을 때"에만 실행됐습니다. 앱을 열면 이번 주 탭이 기본 선택인데
  // 그 경로로는 실행되지 않아서, 이미 성인 2 / 어린이 3으로 신청해둔 가정도 화면에는
  // 항상 "성인 1, 어린이 0"으로 보였습니다.
  // 배우자가 그걸 보고 "한 명만 신청했네" 하며 고쳐서 저장하면 **어린이 3명이 사라졌습니다.**
  // ("식사 안 함"으로 신청한 가정도 화면에는 "식사함"이 선택된 것처럼 보였습니다.)
  // → 주차가 바뀌거나 서버 데이터가 도착하면 항상 저장값을 화면에 반영합니다.
  useEffect(() => {
    const d = familyMealStore[familyId]?.[selectedWeek]
    setTempAttending(d ? d.attending : true)
    setTempAdult(d ? d.adultCount : 1)
    setTempChild(d ? d.childCount : 0)
  }, [familyMealStore, familyId, selectedWeek])

  const handleSelectWeek = (idx: number) => {
    setSelectedWeek(idx)
  }

  const [isSavingMeal, setIsSavingMeal] = useState(false)

  const handleSaveMeal = async () => {
    if (isLocked || isSavingMeal) return
    const targetSunday = upcomingSundays[selectedWeek]?.dateStr || ''
    if (!targetSunday) {
      showToast('\u26a0\ufe0f \ub0a0\uc9dc\ub97c \ud655\uc778\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc0c8\ub85c\uace0\uce68 \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.')
      return
    }

    setIsSavingMeal(true)
    // \ud83d\udc1b \uacfc\uac70 \ubc84\uadf8: \uc800\uc7a5 \uacb0\uacfc\ub97c \ud655\uc778\ud558\uc9c0 \uc54a\uace0 \ubb34\uc870\uac74 "\u2705 \uc2e0\uccad \uc644\ub8cc" \ud1a0\uc2a4\ud2b8\ub97c \ub744\uc6e0\uc2b5\ub2c8\ub2e4.
    // \uad50\ud68c \uc9c0\ud558\uc2e4 \uc640\uc774\ud30c\uac00 \ub04a\uae30\uac70\ub098 \uad8c\ud55c \uc124\uc815\uc774 \ub9de\uc9c0 \uc54a\uc73c\uba74, \uc131\ub3c4\ub294 \uc2e0\uccad\ub41c \uc904 \uc54c\uace0
    // \ub3cc\uc544\uac00\uc9c0\ub9cc \uc8fc\ubc29 \uba85\ub2e8\uc5d0\ub294 \uc5c6\ub294 \uc0c1\ud669\uc774 \ub429\ub2c8\ub2e4.
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
      showToast('\u26a0\ufe0f \uc800\uc7a5\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc778\ud130\ub137 \uc0c1\ud0dc\ub97c \ud655\uc778\ud558\uace0 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.')
      return
    }

    // 가족 연결 전에 혼자 신청해둔 옛날 줄이 남아 있으면 주방 집계가 두 배로 잡힙니다.
    // 저장이 성공한 뒤 같은 날짜의 옛날 줄을 정리합니다. (실패해도 신청 자체는 유효)
    void dbCleanupStaleMealRegistrations(staleFamilyKeys(currentUser, allUsers), targetSunday)

    setFamilyMealStore(prev => ({
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
    showToast(
      tempAttending
        ? `\u2705 \uc800\uc7a5\ub418\uc5c8\uc2b5\ub2c8\ub2e4 \u2014 \uc131\uc778 ${tempAdult}\uba85, \uc5b4\ub9b0\uc774 ${tempChild}\uba85`
        : '\u2705 \uc800\uc7a5\ub418\uc5c8\uc2b5\ub2c8\ub2e4 \u2014 \uc774\ubc88 \uc8fc\ub294 \uc2dd\uc0ac\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4'
    )
  }

  const handleSaveEventForm = async () => {
    await dbUpsertEventForm({
      title: editTitle.trim(),
      content: editContent.trim(),
      url: editUrl.trim(),
      manager: editManager.trim()
    })
    setEventFormUrl(editUrl.trim())
    setEventFormTitle(editTitle.trim())
    setEventFormContent(editContent.trim())
    setEventFormManager(editManager.trim())
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
          <span className={`text-2xs font-semibold border px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isLocked ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <Clock size={10} /> {remainingText}
          </span>
        </div>

        {/* 안내 카드 — 예전에는 "배우자 연동 안내"와 "현재 신청 상태"가 따로 두 칸이라
            화면을 많이 차지하고 눈이 두 번 이동해야 했습니다. 한 칸으로 합쳤습니다. */}
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

          {/* 아이콘 폭(13px)을 모든 줄에 맞춰, 글이 같은 열에서 시작하도록 했습니다 */}
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
                <button onClick={() => setTempAttending(true)} className={`px-4 py-1.5 rounded-lg transition-all ${tempAttending ? 'bg-[#335f87] text-white shadow-xs' : 'text-gray-500'}`}>식사함</button>
                <button onClick={() => setTempAttending(false)} className={`px-4 py-1.5 rounded-lg transition-all ${!tempAttending ? 'bg-gray-400 text-white shadow-xs' : 'text-gray-500'}`}>안함</button>
              </div>
            ) : (
              <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Lock size={12} /> 마감됨</span>
            )}
          </div>

          {tempAttending && (
            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-1.5 text-xs">
              {[{ label: '성인', val: tempAdult, set: setTempAdult, min: 1 }, { label: '어린이', val: tempChild, set: setTempChild, min: 0 }].map(({ label, val, set, min }) => (
                // 🐛 화면 깨짐: 좁은 휴대폰에서 한 칸에 "어린이" + 버튼 3개가 다 안 들어가
                //    글자가 아래로 밀리거나 줄바꿈됐습니다. 여백·간격을 줄이고
                //    글자는 줄바꿈되지 않도록 고정했습니다.
                <div key={label} className="flex items-center justify-between gap-1 bg-white px-2 py-1.5 rounded-lg border border-gray-100">
                  <span className="text-gray-600 font-bold whitespace-nowrap shrink-0">{label}</span>
                  {/* 버튼 크기: 원래 20px로 너무 작아 오조작이 잦았고, 44px는 휴대폰에서 과했습니다 → 28px */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      disabled={isLocked}
                      onClick={() => set(Math.max(min, val - 1))}
                      aria-label={`${label} 인원 줄이기`}
                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 flex items-center justify-center font-bold text-base leading-none disabled:opacity-50 active:scale-95 transition-transform"
                    >−</button>
                    <span className="font-bold text-[#335f87] w-6 text-center text-sm tabular-nums">{val}</span>
                    <button
                      disabled={isLocked}
                      onClick={() => set(val + 1)}
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
              {/* 🐛 과거 버그: "안 함"을 골라도 버튼이 계속 "식사 신청하기"였습니다(정반대 의미).
                  또 저장 중 표시가 없어서 반응이 없어 보이면 여러 번 누르게 됐습니다. */}
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
              {/* 🐛 과거 버그: 마감된 주에는 신청 여부와 관계없이 무조건
                  "신청 완료 (마감시간 경과)"가 떴습니다. 토요일 오후 2시부터 월요일 새벽까지
                  약 34시간 동안, 신청을 깜빡한 분에게도 "신청 완료"라고 알려준 셈입니다.
                  그분은 식사하러 오시는데 밥이 없습니다. */}
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

      {/* 관리자: 행사 등록/수정 모달 (제목 + 내용 + URL 3필드) */}
      {showEventEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
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
                <p className="text-2xs text-gray-400 mt-1">URL 미입력 시 "담당자에게 직접 신청" 안내 표시</p>
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
                <p className="text-2xs text-gray-400 mt-1">입력하면 "담당자(홍길동)에게 직접 신청해 주세요"로 표시됩니다</p>
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
