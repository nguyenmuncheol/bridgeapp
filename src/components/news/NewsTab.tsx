'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Phone, MapPin, CheckSquare, Users, Search, Plus, Heart, MessageSquare, Edit2, Trash2 } from 'lucide-react'
import { UserProfile, getUserDisplayName, PostItem } from '../../lib/mockData'
import {
  dbFetchPosts,
  dbCreatePost,
  dbUpdatePost,
  dbDeletePost,
  dbAddComment,
  dbFetchChurchEvents,
  dbCreateChurchEvent,
  dbUpdateChurchEvent,
  dbDeleteChurchEvent,
  dbFetchAttendanceRecords,
  dbSaveAttendanceRecords
} from '../../lib/db'

interface NewsTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

type EventType = 'sunday' | 'special'
interface ChurchEvent {
  id: string
  date: string
  title: string
  type: EventType
}

const ABSENCE_TAGS = ['출근/출장', '여행', '아파요', '개인사정', '가족방문']

export default function NewsTab({ currentUser, allUsers }: NewsTabProps) {
  // ── 서브탭 3종: 교우소식 | 교회일정 | 주소록 ──
  const [subTab, setSubTab] = useState<'memberNews' | 'schedule' | 'members'>('memberNews')
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const isLeaderOrAdmin = currentUser.role === 'LEADER' || currentUser.role === 'ADMIN'

  // ── 교우소식 상태 ──
  const [memberNewsList, setMemberNewsList] = useState<PostItem[]>([])
  const [showAddNewsModal, setShowAddNewsModal] = useState(false)
  const [newNewsTitle, setNewNewsTitle] = useState('')
  const [newNewsContent, setNewNewsContent] = useState('')
  const [newsComments, setNewsComments] = useState<Record<string, string>>({})
  const [editingNews, setEditingNews] = useState<PostItem | null>(null)
  const [editNewsTitle, setEditNewsTitle] = useState('')
  const [editNewsContent, setEditNewsContent] = useState('')

  // ── 달력 상태 ──
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())

  // ── 일정 편집 ──
  const [customEvents, setCustomEvents] = useState<ChurchEvent[]>([])
  const [calEditModal, setCalEditModal] = useState<{ day: number; dateStr: string } | null>(null)
  const [editEventTitle, setEditEventTitle] = useState('')
  const [editEventType, setEditEventType] = useState<EventType>('special')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)

  // ── 주소록 ──
  const [showAllLabri, setShowAllLabri] = useState(false)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // ── 에러/토스트 ──
  const [toastMsg, setToastMsg] = useState('')
  const showToast = (msg: string, isErr = false) => {
    setToastMsg((isErr ? '⚠️ ' : '') + msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  // ── 출석체크 ──
  const [checkSelections, setCheckSelections] = useState<Record<string, 'ATTEND' | 'ABSENT'>>({})
  const [checkNotes, setCheckNotes] = useState<Record<string, string>>({})
  const [checkSubmitted, setCheckSubmitted] = useState(false)
  const [hasSubmittedAttendance, setHasSubmittedAttendance] = useState(false)
  const [adminLabriFilter, setAdminLabriFilter] = useState<string>('라브리1')

  // 가장 최근 지난 주일 날짜 계산 (오늘이 일요일이면 오늘, 월~토요일이면 직전 일요일)
  const targetSundayDateStr = useMemo(() => {
    const d = new Date()
    const dayOfWeek = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToLastSunday = dayOfWeek === 0 ? 0 : dayOfWeek
    const lastSun = new Date(d)
    lastSun.setDate(d.getDate() - daysToLastSunday)
    return `${lastSun.getFullYear()}-${String(lastSun.getMonth() + 1).padStart(2, '0')}-${String(lastSun.getDate()).padStart(2, '0')}`
  }, [])

  const targetSundayShortLabel = useMemo(() => {
    const parts = targetSundayDateStr.split('-')
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`
  }, [targetSundayDateStr])

  // DB에서 출석체크 데이터 로드
  const loadAttendanceRecords = async () => {
    const records = await dbFetchAttendanceRecords(targetSundayDateStr)
    if (records && records.length > 0) {
      const selections: Record<string, 'ATTEND' | 'ABSENT'> = {}
      const notes: Record<string, string> = {}
      records.forEach((r: any) => {
        selections[r.user_id] = r.status as 'ATTEND' | 'ABSENT'
        if (r.note) notes[r.user_id] = r.note
      })
      setCheckSelections(selections)
      setCheckNotes(notes)
      setHasSubmittedAttendance(true)
    }
  }

  // DB에서 교우소식 및 교회일정, 출석 로드
  useEffect(() => {
    dbFetchPosts('MEMBER_NEWS').then(dbNews => {
      if (dbNews && dbNews.length > 0) {
        setMemberNewsList(dbNews)
      }
    })

    dbFetchChurchEvents().then(dbEvs => {
      if (dbEvs && dbEvs.length > 0) {
        setCustomEvents(dbEvs)
      }
    })

    loadAttendanceRecords()
  }, [targetSundayDateStr])

  // 주소록 및 출석체크: 승인대기자 및 쿠폰 관리자(COUPON) 제외
  const members = allUsers.filter(u => u.role !== 'PENDING' && u.role !== 'COUPON')
  const myLabriMembers = members.filter(u => u.labriId === currentUser.labriId && currentUser.labriId)
  const targetMembers = isLeaderOrAdmin
    ? (currentUser.role === 'ADMIN'
        ? (adminLabriFilter === '미정' ? members.filter(u => !u.labriId || u.labriId === '미정') : members.filter(u => u.labriId === adminLabriFilter))
        : myLabriMembers)
    : []
  const attendedCount = Object.values(checkSelections).filter(v => v === 'ATTEND').length

  // ── 달력 날짜 계산 ──
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

  // 생일 매칭 (YYYY-MM-DD 또는 MM-DD 형식 모두 호환)
  const getBirthdaysForDate = (day: number): string[] => {
    const mmdd = `${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return members.filter(u => u.birthday && u.birthday.endsWith(mmdd)).map(u => u.name)
  }

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
    if (editingEventId) {
      // 기존 일정 수정 (DB)
      await dbUpdateChurchEvent(editingEventId, editEventTitle.trim())
      setCustomEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, title: editEventTitle.trim() } : e))
    } else {
      // 신규 일정 등록 (DB)
      const res = await dbCreateChurchEvent(calEditModal.dateStr, editEventTitle.trim(), editEventType)
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
    await dbDeleteChurchEvent(evId)
    setCustomEvents(prev => prev.filter(e => e.id !== evId))
  }

  // 교우소식 축하/좋아요 1인 1회 (DB 동기화)
  const handleNewsLike = async (newsId: string) => {
    const target = memberNewsList.find(n => n.id === newsId)
    if (!target) return
    const likedUsers = target.likedUserIds || []
    const isLiked = likedUsers.includes(currentUser.id)
    const newLikes = isLiked ? Math.max(0, target.likes - 1) : target.likes + 1
    const newLikedUsers = isLiked ? likedUsers.filter(uid => uid !== currentUser.id) : [...likedUsers, currentUser.id]

    // 낙관적 UI 업데이트
    setMemberNewsList(prev => prev.map(n => n.id === newsId ? { ...n, likes: newLikes, likedUserIds: newLikedUsers } : n))
    try {
      const { error } = await dbUpdatePost(newsId, { likes: newLikes, likedUserIds: newLikedUsers })
      if (error) throw error
    } catch {
      // 실패 시 롤백
      setMemberNewsList(prev => prev.map(n => n.id === newsId ? { ...n, likes: target.likes, likedUserIds: likedUsers } : n))
      showToast('축하 처리 중 오류가 발생했습니다.', true)
    }
  }

  // 교우소식 작성 (DB 동기화)
  const handleCreateNews = async () => {
    if (!newNewsTitle.trim() || !newNewsContent.trim()) return
    const postData: Partial<PostItem> = {
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
      title: newNewsTitle.trim(),
      content: newNewsContent.trim(),
      category: 'MEMBER_NEWS',
    }
    const res = await dbCreatePost(postData)
    const newItem: PostItem = {
      id: res.data?.id || `mn_${Date.now()}`,
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
      title: newNewsTitle.trim(),
      content: newNewsContent.trim(),
      category: 'MEMBER_NEWS',
      createdAt: new Date().toISOString().slice(0, 10),
      likes: 0,
      comments: []
    }
    setMemberNewsList(prev => [newItem, ...prev])
    setNewNewsTitle('')
    setNewNewsContent('')
    setShowAddNewsModal(false)
  }

  // 교우소식 댓글 등록 (DB 동기화)
  const handleAddNewsComment = async (newsId: string) => {
    const text = newsComments[newsId]?.trim()
    if (!text) return
    // 낙관적 UI: 먼저 화면에 추가
    const tempId = `c_${Date.now()}`
    setMemberNewsList(prev => prev.map(n => n.id === newsId ? {
      ...n,
      comments: [...(n.comments || []), { id: tempId, authorName: getUserDisplayName(currentUser), content: text, createdAt: '방금 전' }]
    } : n))
    setNewsComments(prev => ({ ...prev, [newsId]: '' }))
    try {
      const { error } = await dbAddComment(newsId, currentUser.id, getUserDisplayName(currentUser), text)
      if (error) throw error
    } catch {
      // 실패 시 댓글 롤백
      setMemberNewsList(prev => prev.map(n => n.id === newsId ? {
        ...n,
        comments: (n.comments || []).filter(c => c.id !== tempId)
      } : n))
      showToast('댓글 등록 중 오류가 발생했습니다.', true)
    }
  }

  // 교우소식 수정 저장
  const handleSaveNewsEdit = async () => {
    if (!editingNews) return
    await dbUpdatePost(editingNews.id, {
      title: editNewsTitle.trim(),
      content: editNewsContent.trim()
    })
    setMemberNewsList(prev => prev.map(n => n.id === editingNews.id
      ? { ...n, title: editNewsTitle.trim(), content: editNewsContent.trim() }
      : n
    ))
    setEditingNews(null)
  }

  // 교우소식 삭제
  const handleDeleteNews = async (newsId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await dbDeletePost(newsId)
    setMemberNewsList(prev => prev.filter(n => n.id !== newsId))
  }

  // 주소록 필터
  const displayedMembers = useMemo(() => {
    return searchQuery.trim()
      ? members.filter(m => m.name.includes(searchQuery.trim()))
      : (showAllLabri ? members : (myLabriMembers.length > 0 ? myLabriMembers : members))
  }, [members, myLabriMembers, showAllLabri, searchQuery])

  // 출석체크 제출 (DB 동기화)
  const handleSubmitAttendance = async () => {
    const records = targetMembers.map(m => ({
      userId: m.id,
      dateStr: targetSundayDateStr,
      labriId: m.labriId || '미정',
      status: (checkSelections[m.id] || 'ATTEND') as 'ATTEND' | 'ABSENT',
      note: checkNotes[m.id] || '',
      recordedBy: currentUser.id
    }))

    await dbSaveAttendanceRecords(records)
    setCheckSubmitted(true)
    setHasSubmittedAttendance(true)
    setTimeout(() => {
      setCheckSubmitted(false)
      setShowAttendanceModal(false)
    }, 1200)
  }

  // 실시간 아바타 렌더러 헬퍼
  const renderAvatar = (authorId: string, authorName: string, size = 'w-6 h-6 text-[10px]') => {
    const user = allUsers.find(u => u.id === authorId || u.name === authorName)
    return (
      <div className={`${size} rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden`}>
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          (authorName || '성').slice(0, 1)
        )}
      </div>
    )
  }

  // ── 이달의 생일 성도 필터 (10번) ──
  const monthBirthdays = useMemo(() => {
    const targetMonth = String(calMonth + 1).padStart(2, '0')
    return members
      .filter(u => {
        if (!u.birthday) return false
        const parts = u.birthday.split('-')
        const m = parts.length === 3 ? parts[1] : parts[0]
        return m === targetMonth
      })
      .sort((a, b) => {
        const getDay = (bStr?: string) => {
          if (!bStr) return 99
          const p = bStr.split('-')
          return parseInt(p.length === 3 ? p[2] : p[1], 10) || 99
        }
        return getDay(a.birthday) - getDay(b.birthday)
      })
  }, [members, calMonth])

  // ── 1. 교우소식 (기도제목 형태 카드) ──
  return (
    <div className="space-y-5 pb-6 relative">
      {/* 토스트 메시지 */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* 상단 헤더 + 출석체크 버튼 */}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-gray-900 text-base">우리소식</h2>
        {isLeaderOrAdmin && (
          <button
            onClick={() => {
              loadAttendanceRecords()
              setShowAttendanceModal(true)
            }}
            className={`px-2.5 py-1.5 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1 transition-all ${
              hasSubmittedAttendance ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-500 hover:bg-rose-600 animate-pulse'
            }`}
          >
            <CheckSquare size={13} />
            {hasSubmittedAttendance ? `✅ ${targetSundayShortLabel} 출첵완료` : `🚨 ${targetSundayShortLabel} 출첵하기`}
          </button>
        )}
      </div>

      {/* 서브탭 3종: 교우소식 | 교회일정 | 주소록 */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl text-xs font-bold text-center">
        <button
          onClick={() => setSubTab('memberNews')}
          className={`py-2 rounded-lg transition-all ${subTab === 'memberNews' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >📣 교우소식</button>
        <button
          onClick={() => setSubTab('schedule')}
          className={`py-2 rounded-lg transition-all ${subTab === 'schedule' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >📅 교회일정</button>
        <button
          onClick={() => setSubTab('members')}
          className={`py-2 rounded-lg transition-all ${subTab === 'members' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}
        >📖 주소록</button>
      </div>

      {/* ── 1. 교우소식 ── */}
      {subTab === 'memberNews' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500 font-semibold">더브릿지 가족 News</span>
            <button
              onClick={() => setShowAddNewsModal(true)}
              className="px-2.5 py-1 bg-[#335f87] text-white text-[11px] font-bold rounded-lg hover:bg-[#2b5072] flex items-center gap-1"
            ><Plus size={12} /> 소식 나누기</button>
          </div>

          {memberNewsList.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-blue-50 p-4 shadow-2xs space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  {renderAvatar(item.authorId, item.authorName, 'w-6 h-6 text-[10px]')}
                  <span className="font-bold text-xs text-gray-900">{item.authorName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400">{item.createdAt}</span>
                  {(item.authorId === currentUser.id || isLeaderOrAdmin) && (
                    <>
                      <button
                        onClick={() => {
                          setEditingNews(item)
                          setEditNewsTitle(item.title)
                          setEditNewsContent(item.content)
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded"
                        title="수정"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteNews(item.id)}
                        className="p-1 text-gray-400 hover:text-rose-500 rounded"
                        title="삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-gray-900 leading-snug">{item.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{item.content}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs">
                <button
                  onClick={() => handleNewsLike(item.id)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 ${
                    (item.likedUserIds || []).includes(currentUser.id)
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                  }`}
                >
                  <Heart size={12} className={(item.likedUserIds || []).includes(currentUser.id) ? 'fill-rose-600' : ''} />
                  축하/응원 ({item.likes})
                </button>
              </div>

              {/* 댓글 나눔 */}
              {item.comments && item.comments.length > 0 && (
                <div className="bg-gray-50 p-2.5 rounded-xl space-y-1.5 text-xs">
                  {item.comments.map(c => (
                    <div key={c.id} className="flex justify-between items-start text-[11px]">
                      <div className="flex items-center gap-1.5 flex-1">
                        {renderAvatar('', c.authorName, 'w-4 h-4 text-[8px]')}
                        <span className="font-bold text-gray-800 shrink-0">{c.authorName}:</span>
                        <span className="text-gray-600 ml-1">{c.content}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="축하와 응원의 한마디를 나누세요..."
                  value={newsComments[item.id] || ''}
                  onChange={e => setNewsComments({ ...newsComments, [item.id]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAddNewsComment(item.id)}
                  className="flex-1 text-xs p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none"
                />
                <button onClick={() => handleAddNewsComment(item.id)} className="px-3 py-1 bg-[#335f87] text-white text-xs font-bold rounded-lg">등록</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 2. 교회일정 달력 ── */}
      {subTab === 'schedule' && (
        <div className="space-y-3">
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

            {/* 9번 항목: 주일예배 범례 텍스트 수정 */}
            <div className="flex gap-3 pt-2 text-[10px] text-gray-500 border-t border-gray-100">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />주일예배</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />특별일정</span>
              <span className="flex items-center gap-1">🎂 생일</span>
            </div>
          </div>

          {/* ── 10번 항목: 이달의 생일자 리스트 ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                <span>🎂</span> {calMonth + 1}월 생일 성도
              </h3>
              <span className="text-[10px] bg-pink-50 text-pink-600 font-bold px-2 py-0.5 rounded-full">
                총 {monthBirthdays.length}명
              </span>
            </div>

            {monthBirthdays.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {monthBirthdays.map(m => {
                  const parts = (m.birthday || '').split('-')
                  const dayStr = parts.length === 3 ? `${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일` : `${parseInt(parts[0], 10)}월 ${parseInt(parts[1], 10)}일`
                  return (
                    <div key={m.id} className="p-2.5 bg-pink-50/40 border border-pink-100 rounded-xl flex items-center gap-2.5">
                      {renderAvatar(m.id, m.name, 'w-8 h-8 text-xs')}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-gray-900 truncate">{m.name}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{m.duty}</span>
                        </div>
                        <p className="text-[10px] font-bold text-pink-600 mt-0.5">🎉 {dayStr}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl">
                {calMonth + 1}월에는 등록된 생일 성도가 없습니다.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── 3. 주소록 ── */}
      {subTab === 'members' && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="성도 이름으로 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 bg-white rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87] shadow-2xs"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">✕</button>}
          </div>

          {currentUser.labriId && !searchQuery && (
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl text-xs font-bold">
              <button onClick={() => setShowAllLabri(false)} className={`flex-1 py-2 rounded-lg transition-all ${!showAllLabri ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}>내 라브리 ({currentUser.labriId})</button>
              <button onClick={() => setShowAllLabri(true)} className={`flex-1 py-2 rounded-lg transition-all ${showAllLabri ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'}`}>전체 성도 ({members.length}명)</button>
            </div>
          )}

          <div className="space-y-2">
            {displayedMembers.map(member => (
              <div key={member.id} className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
                <button onClick={() => setExpandedMember(expandedMember === member.id ? null : member.id)} className="w-full p-3.5 flex items-center justify-between text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                      {member.avatarUrl ? <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" /> : member.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-900 text-sm">{member.name}</span>
                        <span className="text-[10px] text-gray-400">{member.duty}</span>
                      </div>
                      <span className="text-[10px] text-[#335f87]">{member.labriId || '라브리 미정'}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className={`text-gray-400 transition-transform ${expandedMember === member.id ? 'rotate-90' : ''}`} />
                </button>
                {expandedMember === member.id && (
                  <div className="px-4 pb-3.5 space-y-2 text-xs border-t border-gray-50 pt-2">
                    {member.phone && <div className="flex items-center gap-2 text-gray-600"><Phone size={12} className="text-gray-400" /><a href={`tel:${member.phone}`} className="font-bold text-[#335f87] hover:underline">{member.phone}</a></div>}
                    {member.address && <div className="flex items-start gap-2 text-gray-600"><MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" /><span>{member.address}</span></div>}
                    {member.familyInfo && <div className="flex items-center gap-2 text-gray-600"><Users size={12} className="text-gray-400" /><span>{member.familyInfo}</span></div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 일정 텍스트 직접 수정/추가 모달 (관리자/리더) ── */}
      {calEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87]"
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

      {/* ── 교우소식 작성 모달 ── */}
      {showAddNewsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <h3 className="font-bold text-sm text-gray-900">📣 교우소식 작성</h3>
            <input
              type="text"
              placeholder="소식 제목 (예: 박성도 성도님 득남 축하)"
              value={newNewsTitle}
              onChange={e => setNewNewsTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
            />
            <textarea
              rows={4}
              placeholder="상세 내용을 작성해 주세요..."
              value={newNewsContent}
              onChange={e => setNewNewsContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddNewsModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleCreateNews} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">등록하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 교우소식 수정 모달 ── */}
      {editingNews && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900">✏️ 교우소식 수정</h3>
              <button onClick={() => setEditingNews(null)} className="text-gray-400 font-bold">✕</button>
            </div>
            <input
              type="text"
              value={editNewsTitle}
              onChange={e => setEditNewsTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
              placeholder="제목"
            />
            <textarea
              rows={4}
              value={editNewsContent}
              onChange={e => setEditNewsContent(e.target.value)}
              className="w-full text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none"
              placeholder="내용"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingNews(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSaveNewsEdit} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 출석체크 모달 (화면 중앙 정중앙 팝업 배치 + 제출 버튼) ── */}
      {showAttendanceModal && isLeaderOrAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                          onClick={() => setCheckSelections(p => ({ ...p, [member.id]: 'ATTEND' }))}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            sel === 'ATTEND' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border border-gray-200 text-gray-600'
                          }`}
                        >✅ 출석</button>
                        <button
                          onClick={() => setCheckSelections(p => ({ ...p, [member.id]: 'ABSENT' }))}
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
                          className="w-full text-xs p-2 bg-white rounded-lg border border-rose-200 focus:outline-none"
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
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckSquare size={16} /> {hasSubmittedAttendance ? '✅ 출석체크 수정 완료하기' : '✅ 출석체크 최종 제출하기'} ({attendedCount}명 출석)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
