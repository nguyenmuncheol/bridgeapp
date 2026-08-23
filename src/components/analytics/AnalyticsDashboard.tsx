'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Users, Smartphone, Bell, BellOff, Clock, Search, RefreshCw,
  Home, Shield, TrendingUp, AlertTriangle, Monitor, ExternalLink,
  CheckCircle2, Flame, Calendar, Laptop, ChevronDown, Filter,
  Copy, Check, Database, Download, Heart, Utensils, CalendarCheck,
  UserCheck, Users2, Eye, FileSpreadsheet, Layers, Activity
} from 'lucide-react'
import { UserProfile, getUserDisplayName, isApprovedMember } from '../../lib/mockData'
import {
  dbFetchProfiles, dbFetchAllPushSubscriptions, dbFetchUserAccessLogs,
  dbFetchMemberActivityCounts, dbFetchAttendanceRecords, dbFetchMealRegistrations,
  PushSubscriptionInfo, AccessLogItem
} from '../../lib/db'
import { trackUserActivity } from '../../lib/activityTracker'
import { matchesKoreanSearch } from '../../lib/koreanSearch'
import { buildFamilyUnits, resolveFamilyKey, familyKeyOf, FamilyUnit } from '../../lib/familyKey'
import { getUpcomingSundays } from '../../lib/dateUtils'
import Avatar from '../news/Avatar'

interface AnalyticsDashboardProps {
  currentUser: UserProfile
  onGoHome?: () => void
}

/** 상대 시간 계산 헬퍼 (예: 방금 전, 5분 전, 3시간 전, 어제, 14일 전) */
function formatRelativeTime(isoStr?: string | null): { text: string; level: 'recent' | 'today' | 'week' | 'old' | 'none' } {
  if (!isoStr) return { text: '접속 기록 없음', level: 'none' }

  const diffMs = Date.now() - new Date(isoStr).getTime()
  if (isNaN(diffMs) || diffMs < 0) return { text: '방금 전', level: 'recent' }

  const diffMin = Math.floor(diffMs / (60 * 1000))
  const diffHour = Math.floor(diffMs / (60 * 60 * 1000))
  const diffDay = Math.floor(diffMs / (24 * 60 * 60 * 1000))

  if (diffMin < 2) return { text: '방금 전', level: 'recent' }
  if (diffMin < 60) return { text: `${diffMin}분 전`, level: 'recent' }
  if (diffHour < 24) return { text: `${diffHour}시간 전`, level: 'today' }
  if (diffDay === 1) return { text: '어제', level: 'today' }
  if (diffDay < 7) return { text: `${diffDay}일 전`, level: 'week' }
  if (diffDay < 30) return { text: `${diffDay}일 전`, level: 'old' }
  return { text: `${diffDay}일 전 (장기미접속)`, level: 'old' }
}

export default function AnalyticsDashboard({ currentUser, onGoHome }: AnalyticsDashboardProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [pushSubs, setPushSubs] = useState<PushSubscriptionInfo[]>([])
  const [accessLogs, setAccessLogs] = useState<AccessLogItem[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([])
  const [mealRegistrations, setMealRegistrations] = useState<any[]>([])
  const [activityCounts, setActivityCounts] = useState<{
    postsByAuthor: Record<string, number>
    commentsByAuthor: Record<string, number>
    lastActivityByAuthor: Record<string, string>
    reactionsByUser: Record<string, number>
  }>({
    postsByAuthor: {},
    commentsByAuthor: {},
    lastActivityByAuthor: {},
    reactionsByUser: {},
  })

  const [isLoading, setIsLoading] = useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'posts' | 'reactions' | 'absence' | 'created'>('recent')
  const [viewMode, setViewMode] = useState<'individual' | 'family'>('individual')
  const [copiedSql, setCopiedSql] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // 다가오는 주일 날짜들 (식사 신청용)
  const upcomingSundays = useMemo(() => getUpcomingSundays(4), [])
  const upcomingSundayDateStrs = useMemo(() => upcomingSundays.map(s => s.dateStr), [upcomingSundays])

  // 데이터 로딩
  const loadData = async () => {
    setIsLoading(true)
    try {
      const [pList, pSubs, aLogs, actCounts, attendList, mealList] = await Promise.all([
        dbFetchProfiles().catch(() => []),
        dbFetchAllPushSubscriptions().catch(() => []),
        dbFetchUserAccessLogs().catch(() => []),
        dbFetchMemberActivityCounts().catch(() => ({
          postsByAuthor: {},
          commentsByAuthor: {},
          lastActivityByAuthor: {},
          reactionsByUser: {}
        })),
        dbFetchAttendanceRecords().catch(() => []),
        dbFetchMealRegistrations(upcomingSundayDateStrs).catch(() => []),
      ])

      setProfiles(pList || [])
      setPushSubs(pSubs || [])
      setAccessLogs(aLogs || [])
      setActivityCounts(actCounts || {
        postsByAuthor: {},
        commentsByAuthor: {},
        lastActivityByAuthor: {},
        reactionsByUser: {}
      })
      setAttendanceRecords(attendList || [])
      setMealRegistrations(mealList || [])
      setLastRefreshedAt(new Date().toLocaleTimeString('ko-KR'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (currentUser?.id) {
      trackUserActivity(currentUser.id)
    }
    loadData()
  }, [currentUser])

  // 푸시 구독자 Map (userId -> 구독 수)
  const pushSubUserMap = useMemo(() => {
    const map = new Map<string, number>()
    pushSubs.forEach(s => {
      map.set(s.userId, (map.get(s.userId) || 0) + 1)
    })
    return map
  }, [pushSubs])

  // 실제 성도 (COUPON 관리자 제외)
  const actualMembers = useMemo(() => {
    return profiles.filter(p => !p.isDependent && p.role !== 'COUPON')
  }, [profiles])

  // ── 출석 데이터 가공 & 연속 결석 주수 계산 ──
  const { attendanceByDate, attendanceDatesDesc, memberAttendanceStats } = useMemo(() => {
    const byDate: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]> = {}
    attendanceRecords.forEach(r => {
      if (!byDate[r.date_str]) byDate[r.date_str] = []
      byDate[r.date_str].push({
        userId: r.user_id,
        status: r.status,
        note: r.note || ''
      })
    })

    const datesDesc = Object.keys(byDate).sort().reverse()
    const recent4Dates = datesDesc.slice(0, 4)

    // 각 성도별 최근 4주 출석 현황 및 연속 결석 주수
    const memberStats: Record<string, {
      recent4Statuses: ('ATTEND' | 'ABSENT' | 'NONE')[]
      attendedCount4Weeks: number
      recordedCount4Weeks: number
      absenceStreak: number
    }> = {}

    actualMembers.forEach(m => {
      const statuses: ('ATTEND' | 'ABSENT' | 'NONE')[] = []
      let attended = 0
      let recorded = 0

      recent4Dates.forEach(date => {
        const rec = (byDate[date] || []).find(r => r.userId === m.id)
        if (rec) {
          statuses.push(rec.status)
          recorded++
          if (rec.status === 'ATTEND') attended++
        } else {
          statuses.push('NONE')
        }
      })

      // 연속 결석 streak 계산 (최신 주일부터 과거로 거슬러 올라감)
      let streak = 0
      for (let i = 0; i < datesDesc.length; i++) {
        const rec = (byDate[datesDesc[i]] || []).find(r => r.userId === m.id)
        if (!rec || rec.status !== 'ABSENT') break
        streak++
      }

      memberStats[m.id] = {
        recent4Statuses: statuses,
        attendedCount4Weeks: attended,
        recordedCount4Weeks: recorded,
        absenceStreak: streak
      }
    })

    return {
      attendanceByDate: byDate,
      attendanceDatesDesc: datesDesc,
      memberAttendanceStats: memberStats
    }
  }, [attendanceRecords, actualMembers])

  // ── 식사 신청 데이터 가공 (이번 주 주일 기준) ──
  const familyUnits = useMemo(() => buildFamilyUnits(profiles), [profiles])

  const mealStats = useMemo(() => {
    const targetSunday = upcomingSundays[0]?.dateStr || ''
    const sameDay = mealRegistrations.filter(r => r.date_str === targetSunday)

    const byFamily = new Map<string, any>()
    sameDay.forEach(r => {
      const key = resolveFamilyKey(r.family_group_id, profiles) || `row_${r.id}`
      const prev = byFamily.get(key)
      const cur = String(r.updated_at || r.created_at || '')
      if (!prev || String(prev.updated_at || prev.created_at || '') <= cur) {
        byFamily.set(key, r)
      }
    })

    let adultCount = 0
    let childCount = 0
    let attendingFamilyCount = 0
    let absentFamilyCount = 0

    familyUnits.forEach(u => {
      const reg = byFamily.get(u.key)
      if (reg) {
        if (reg.attending) {
          attendingFamilyCount++
          adultCount += (reg.adult_count || 0)
          childCount += (reg.child_count || 0)
        } else {
          absentFamilyCount++
        }
      }
    })

    const pendingFamilyCount = Math.max(0, familyUnits.length - (attendingFamilyCount + absentFamilyCount))

    return {
      targetSunday,
      adultCount,
      childCount,
      totalMeals: adultCount + childCount,
      attendingFamilyCount,
      absentFamilyCount,
      pendingFamilyCount,
      totalFamilies: familyUnits.length,
      byFamilyMap: byFamily
    }
  }, [upcomingSundays, mealRegistrations, profiles, familyUnits])

  // ── 1. 핵심 요약 지표 (KPIs) ──
  const metrics = useMemo(() => {
    const total = actualMembers.length
    const approved = actualMembers.filter(p => isApprovedMember(p.role)).length
    const pending = actualMembers.filter(p => p.role === 'PENDING').length

    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const sevenDaysMs = 7 * oneDayMs
    const thirtyDaysMs = 30 * oneDayMs

    let activeTodayCount = 0
    let active7DaysCount = 0
    let inactive30DaysCount = 0
    let pwaInstalledCount = 0
    let pushEnabledCount = 0
    let careNeededCount = 0 // 앱은 접속하지만 2주 이상 연속 결석 중인 성도

    actualMembers.forEach(p => {
      if (p.isPwa) pwaInstalledCount++
      if (pushSubUserMap.has(p.id)) pushEnabledCount++

      const stats = memberAttendanceStats[p.id]
      const isAbsentStreak = stats && stats.absenceStreak >= 2

      const timeStr = p.lastActiveAt || activityCounts.lastActivityByAuthor[p.id]
      const hasRecentAppActivity = timeStr ? (now - new Date(timeStr).getTime() <= 14 * oneDayMs) : false

      if (isAbsentStreak && hasRecentAppActivity) {
        careNeededCount++
      }

      if (p.lastActiveAt) {
        const diff = now - new Date(p.lastActiveAt).getTime()
        if (diff <= oneDayMs) activeTodayCount++
        if (diff <= sevenDaysMs) active7DaysCount++
        if (diff >= thirtyDaysMs) inactive30DaysCount++
      } else {
        inactive30DaysCount++
      }
    })

    // 최근 주일 출석률
    const latestDate = attendanceDatesDesc[0]
    let latestAttendanceRate = 0
    let latestAttendCount = 0
    if (latestDate && attendanceByDate[latestDate]) {
      const records = attendanceByDate[latestDate]
      latestAttendCount = records.filter(r => r.status === 'ATTEND').length
      const totalRecorded = records.length
      latestAttendanceRate = totalRecorded > 0 ? Math.round((latestAttendCount / totalRecorded) * 100) : 0
    }

    return {
      total,
      approved,
      pending,
      activeTodayCount,
      active7DaysCount,
      active7DaysRate: total > 0 ? Math.round((active7DaysCount / total) * 100) : 0,
      pwaInstalledCount,
      pwaInstalledRate: total > 0 ? Math.round((pwaInstalledCount / total) * 100) : 0,
      pushEnabledCount,
      pushEnabledRate: total > 0 ? Math.round((pushEnabledCount / total) * 100) : 0,
      inactive30DaysCount,
      careNeededCount,
      latestAttendanceRate,
      latestAttendCount,
    }
  }, [actualMembers, pushSubUserMap, memberAttendanceStats, activityCounts, attendanceDatesDesc, attendanceByDate])

  // ── 2. 기기 및 플랫폼 점유율 통계 ──
  const platformStats = useMemo(() => {
    const osCount: Record<string, number> = { iOS: 0, Android: 0, Windows: 0, Mac: 0, Other: 0 }
    const pwaCount: Record<string, number> = { pwa: 0, web: 0 }

    actualMembers.forEach(p => {
      const os = p.devicePlatform || 'Other'
      if (os in osCount) osCount[os]++
      else osCount['Other']++

      if (p.isPwa) pwaCount.pwa++
      else pwaCount.web++
    })

    const total = actualMembers.length || 1
    return {
      os: {
        iOS: { count: osCount.iOS, rate: Math.round((osCount.iOS / total) * 100) },
        Android: { count: osCount.Android, rate: Math.round((osCount.Android / total) * 100) },
        Windows: { count: osCount.Windows, rate: Math.round((osCount.Windows / total) * 100) },
        Mac: { count: osCount.Mac, rate: Math.round((osCount.Mac / total) * 100) },
        Other: { count: osCount.Other, rate: Math.round((osCount.Other / total) * 100) },
      },
      pwa: {
        app: { count: pwaCount.pwa, rate: Math.round((pwaCount.pwa / total) * 100) },
        web: { count: pwaCount.web, rate: Math.round((pwaCount.web / total) * 100) },
      }
    }
  }, [actualMembers])

  // ── 3. 시간대별 접속 피크 통계 (0 ~ 23시) ──
  const hourlyStats = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))

    if (accessLogs.length > 0) {
      accessLogs.forEach(l => {
        if (l.hourOfDay >= 0 && l.hourOfDay <= 23) {
          hours[l.hourOfDay].count++
        }
      })
    } else {
      actualMembers.forEach(p => {
        if (p.lastActiveAt) {
          const h = new Date(p.lastActiveAt).getHours()
          if (h >= 0 && h <= 23) hours[h].count++
        }
      })
    }

    const maxCount = Math.max(...hours.map(h => h.count), 1)
    return { hours, maxCount }
  }, [accessLogs, actualMembers])

  // ── 4. 최근 4주 출석 트렌드 통계 ──
  const recentAttendanceTrend = useMemo(() => {
    const dates = attendanceDatesDesc.slice(0, 4).reverse()
    return dates.map(date => {
      const records = attendanceByDate[date] || []
      const attend = records.filter(r => r.status === 'ATTEND').length
      const absent = records.filter(r => r.status === 'ABSENT').length
      const total = attend + absent
      const rate = total > 0 ? Math.round((attend / total) * 100) : 0
      return {
        date,
        shortDate: date.slice(5),
        attend,
        absent,
        total,
        rate
      }
    })
  }, [attendanceDatesDesc, attendanceByDate])

  // ── 5. 성도 목록 필터링 및 정렬 ──
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim()
    const oneDayMs = 24 * 60 * 60 * 1000
    const now = Date.now()

    let list = actualMembers.filter(p => {
      // 검색어 필터
      if (q) {
        const matchName = matchesKoreanSearch(p.name, q)
        const matchDuty = (p.duty || '').includes(q)
        const matchPhone = (p.phone || '').includes(q)
        const matchLabri = (p.labriId || '').includes(q)
        if (!matchName && !matchDuty && !matchPhone && !matchLabri) return false
      }

      // 탭 필터
      const memberTime = p.lastActiveAt || activityCounts.lastActivityByAuthor[p.id] || p.createdAt
      const memberTimeMs = memberTime ? new Date(memberTime).getTime() : 0

      const postsCount = activityCounts.postsByAuthor[p.id] || 0
      const commentsCount = activityCounts.commentsByAuthor[p.id] || 0
      const reactionsCount = activityCounts.reactionsByUser[p.id] || 0
      const stats = memberAttendanceStats[p.id]

      if (filterType === 'pwa') return p.isPwa === true
      if (filterType === 'push') return pushSubUserMap.has(p.id)
      if (filterType === 'today') {
        return memberTimeMs > 0 && (now - memberTimeMs <= oneDayMs)
      }
      if (filterType === 'quiet') {
        // 조용한 독자: 글/댓글 작성은 0이지만 반응(좋아요/아멘)은 1개 이상 누른 성도
        return postsCount === 0 && commentsCount === 0 && reactionsCount > 0
      }
      if (filterType === 'care') {
        // 관심 필요 성도: 앱은 최근 14일 내 접속했으나 주일 출석은 2주 이상 연속 결석
        const hasRecentApp = memberTimeMs > 0 && (now - memberTimeMs <= 14 * oneDayMs)
        return (stats?.absenceStreak || 0) >= 2 && hasRecentApp
      }
      if (filterType === 'streak2') {
        // 2주 이상 결석
        return (stats?.absenceStreak || 0) >= 2
      }
      if (filterType === 'inactive14') {
        if (memberTimeMs === 0) return true
        return (now - memberTimeMs >= 14 * oneDayMs)
      }
      if (filterType === 'pending') return p.role === 'PENDING'
      if (filterType === 'labri1') return p.labriId === '라브리1'
      if (filterType === 'labri2') return p.labriId === '라브리2'
      if (filterType === 'labri3') return p.labriId === '라브리3'

      return true
    })

    // 정렬
    return list.sort((a, b) => {
      if (sortBy === 'recent') {
        const timeA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : (activityCounts.lastActivityByAuthor[a.id] ? new Date(activityCounts.lastActivityByAuthor[a.id]).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0))
        const timeB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : (activityCounts.lastActivityByAuthor[b.id] ? new Date(activityCounts.lastActivityByAuthor[b.id]).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0))
        return timeB - timeA
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '', 'ko')
      }
      if (sortBy === 'posts') {
        const postsA = (activityCounts.postsByAuthor[a.id] || 0) + (activityCounts.commentsByAuthor[a.id] || 0)
        const postsB = (activityCounts.postsByAuthor[b.id] || 0) + (activityCounts.commentsByAuthor[b.id] || 0)
        return postsB - postsA
      }
      if (sortBy === 'reactions') {
        const rA = activityCounts.reactionsByUser[a.id] || 0
        const rB = activityCounts.reactionsByUser[b.id] || 0
        return rB - rA
      }
      if (sortBy === 'absence') {
        const sA = memberAttendanceStats[a.id]?.absenceStreak || 0
        const sB = memberAttendanceStats[b.id]?.absenceStreak || 0
        return sB - sA
      }
      if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return 0
    })
  }, [actualMembers, searchQuery, filterType, sortBy, pushSubUserMap, activityCounts, memberAttendanceStats])

  // ── 6. 가족 단위 뷰용 가공 ──
  const familyViewUnits = useMemo(() => {
    const q = searchQuery.trim()
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000

    return familyUnits.map(unit => {
      // 가족 구성원들의 앱 접속 상태 분석
      let activeMembersCount = 0
      let pwaMembersCount = 0
      let pushMembersCount = 0
      let maxLastActiveMs = 0

      unit.members.forEach(m => {
        if (m.isPwa) pwaMembersCount++
        if (pushSubUserMap.has(m.id)) pushMembersCount++

        const t = m.lastActiveAt || activityCounts.lastActivityByAuthor[m.id]
        if (t) {
          const ms = new Date(t).getTime()
          if (ms > maxLastActiveMs) maxLastActiveMs = ms
          if (now - ms <= sevenDaysMs) activeMembersCount++
        }
      })

      // 가족 활성 상태 평가
      let status: 'all_active' | 'partial_active' | 'inactive' = 'inactive'
      if (activeMembersCount === unit.members.length && unit.members.length > 0) {
        status = 'all_active'
      } else if (activeMembersCount > 0 || (maxLastActiveMs > 0 && now - maxLastActiveMs <= fourteenDaysMs)) {
        status = 'partial_active'
      } else {
        status = 'inactive'
      }

      // 이번주 식사 신청 상태
      const mealReg = mealStats.byFamilyMap.get(unit.key)

      return {
        ...unit,
        status,
        activeMembersCount,
        pwaMembersCount,
        pushMembersCount,
        maxLastActiveMs,
        mealReg,
      }
    }).filter(unit => {
      if (q) {
        const matchLabel = matchesKoreanSearch(unit.label, q)
        const matchMember = unit.members.some(m => matchesKoreanSearch(m.name, q) || (m.duty || '').includes(q))
        if (!matchLabel && !matchMember) return false
      }
      return true
    }).sort((a, b) => {
      if (sortBy === 'name') return a.label.localeCompare(b.label, 'ko')
      if (sortBy === 'recent') return b.maxLastActiveMs - a.maxLastActiveMs
      return a.label.localeCompare(b.label, 'ko')
    })
  }, [familyUnits, searchQuery, sortBy, pushSubUserMap, activityCounts, mealStats])

  // ── 7. 엑셀(CSV) 원클릭 다운로드 ──
  const handleExportCsv = () => {
    setIsExporting(true)
    try {
      const headers = [
        '이름', '직분', '소속(라브리)', '승인상태',
        '최근접속시간', '접속방식(PWA)', '기기/OS', '브라우저',
        '푸시알림', '글작성수', '댓글수', '반응(좋아요)수',
        '최근4주출석', '연속결석주수', '가입일'
      ]

      const rows = filteredMembers.map(m => {
        const rel = m.lastActiveAt
          ? formatRelativeTime(m.lastActiveAt).text
          : activityCounts.lastActivityByAuthor[m.id]
          ? `${formatRelativeTime(activityCounts.lastActivityByAuthor[m.id]).text} (글/댓글)`
          : '기록 없음'

        const pushCount = pushSubUserMap.get(m.id) || 0
        const pushText = pushCount > 0 ? `ON (${pushCount}대)` : 'OFF'
        const postsCount = activityCounts.postsByAuthor[m.id] || 0
        const commentsCount = activityCounts.commentsByAuthor[m.id] || 0
        const reactionsCount = activityCounts.reactionsByUser[m.id] || 0
        const stats = memberAttendanceStats[m.id]
        const attendText = stats ? `${stats.attendedCount4Weeks}/${stats.recordedCount4Weeks}주` : '미기록'
        const streakText = stats && stats.absenceStreak > 0 ? `${stats.absenceStreak}주 연속 결석` : '정상'

        return [
          `"${m.name || ''}"`,
          `"${m.duty || '성도'}"`,
          `"${m.labriId || '미정'}"`,
          `"${m.role || ''}"`,
          `"${rel}"`,
          `"${m.isPwa ? '홈화면 PWA 앱' : '웹 브라우저'}"`,
          `"${m.devicePlatform || '미상'}"`,
          `"${m.browserName || '미상'}"`,
          `"${pushText}"`,
          postsCount,
          commentsCount,
          reactionsCount,
          `"${attendText}"`,
          `"${streakText}"`,
          `"${m.createdAt || ''}"`
        ].join(',')
      })

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      a.href = url
      a.download = `더브릿지_성도이용현황_${todayStr}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-6 space-y-6">
      {/* ─── 1. 상단 네비게이션 & 헤더 ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Shield size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">성도 이용 현황 & 목회 돌봄 종합 분석</h1>
              <span className="text-2xs bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-500/30">Admin Secret</span>
            </div>
            <p className="text-2xs text-slate-400 mt-0.5">
              접속 패턴 · 예배 출석 & 식사 연동 · PWA 설치율 · 푸시 알림 종합 리포트
              {lastRefreshedAt && <span className="ml-2 text-slate-500">(동기화: {lastRefreshedAt})</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {/* CSV 내보내기 버튼 */}
          <button
            onClick={handleExportCsv}
            disabled={isLoading || isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
            title="현재 목록을 엑셀(CSV) 파일로 다운로드합니다"
          >
            <FileSpreadsheet size={14} />
            <span>{isExporting ? '생성 중...' : '엑셀(CSV) 저장'}</span>
          </button>

          {/* 새로고침 */}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? '조회 중...' : '새로고침'}</span>
          </button>

          {onGoHome && (
            <button
              onClick={onGoHome}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#335f87] hover:bg-[#2b5072] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <Home size={14} />
              <span>홈으로</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── DB 컬럼 미생성 안내 배너 (최초 1회 설정 안내) ─── */}
      {!isLoading && actualMembers.length > 0 && actualMembers.every(p => !p.lastActiveAt) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Database size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-300">💡 Supabase 데이터베이스 접속 분석 컬럼 생성이 필요합니다</h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Supabase의 <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-200">profiles</code> 테이블에 <code className="text-amber-200">last_active_at</code> 등의 분석 컬럼이 아직 생성되지 않았습니다.<br />
                아래 버튼을 눌러 SQL 명령어를 복사한 후, Supabase 대시보드 <strong>SQL Editor</strong>에서 1회 실행(Run)해 주세요!
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const sql = `-- 1. profiles 테이블에 접속 및 환경 정보 컬럼 추가\nALTER TABLE public.profiles\n  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,\n  ADD COLUMN IF NOT EXISTS is_pwa BOOLEAN DEFAULT FALSE,\n  ADD COLUMN IF NOT EXISTS device_platform TEXT,\n  ADD COLUMN IF NOT EXISTS browser_name TEXT;\n\n-- 2. 시간대별/요일별 접속 통계 집계용 테이블 생성\nCREATE TABLE IF NOT EXISTS public.user_access_logs (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,\n  hour_of_day INT NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),\n  day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),\n  is_pwa BOOLEAN DEFAULT FALSE,\n  device_platform TEXT,\n  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nALTER TABLE public.user_access_logs ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS "모든 로그인 사용자 접속 로그 등록" ON public.user_access_logs;\nCREATE POLICY "모든 로그인 사용자 접속 로그 등록" ON public.user_access_logs\n  FOR INSERT WITH CHECK (auth.uid() = user_id);\n\nDROP POLICY IF EXISTS "관리자 접속 로그 조회" ON public.user_access_logs;\nCREATE POLICY "관리자 접속 로그 조회" ON public.user_access_logs\n  FOR SELECT USING (\n    EXISTS (\n      SELECT 1 FROM public.profiles\n      WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'\n    )\n  );`
              navigator.clipboard.writeText(sql)
              setCopiedSql(true)
              setTimeout(() => setCopiedSql(false), 3000)
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-md"
          >
            {copiedSql ? <Check size={14} className="text-emerald-950" /> : <Copy size={14} />}
            <span>{copiedSql ? 'SQL 복사 완료!' : '📋 SQL 마이그레이션 복사'}</span>
          </button>
        </div>
      )}

      {/* ─── 2. 핵심 요약 카드 (KPI Cards - 6종) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {/* 총 성도 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3 sm:p-3.5 rounded-2xl space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-3xs sm:text-2xs font-semibold">총 등록 성도</span>
            <Users size={14} className="text-blue-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-white">{metrics.total}<span className="text-3xs sm:text-2xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-3xs text-slate-400">승인 {metrics.approved} · 대기 {metrics.pending}</div>
        </div>

        {/* 7일 활성 성도 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3 sm:p-3.5 rounded-2xl space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-3xs sm:text-2xs font-semibold">7일 내 앱 활동</span>
            <TrendingUp size={14} className="text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-emerald-400">{metrics.active7DaysCount}<span className="text-3xs sm:text-2xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-3xs text-emerald-400/80 font-semibold">활성률 {metrics.active7DaysRate}%</div>
        </div>

        {/* 주일 출석 현황 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3 sm:p-3.5 rounded-2xl space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-3xs sm:text-2xs font-semibold">최근 주일 출석</span>
            <CalendarCheck size={14} className="text-teal-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-teal-300">
            {metrics.latestAttendCount}<span className="text-3xs sm:text-2xs font-normal text-slate-400 ml-1">명</span>
          </div>
          <div className="text-3xs text-teal-400/80 font-semibold">출석률 {metrics.latestAttendanceRate}%</div>
        </div>

        {/* 이번주 식사 신청 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3 sm:p-3.5 rounded-2xl space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-3xs sm:text-2xs font-semibold">이번주 식사</span>
            <Utensils size={14} className="text-amber-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-amber-300">
            {mealStats.totalMeals}<span className="text-3xs sm:text-2xs font-normal text-slate-400 ml-1">명</span>
          </div>
          <div className="text-3xs text-amber-400/80 font-semibold truncate">
            {mealStats.attendingFamilyCount}가정 (어른{mealStats.adultCount}+아이{mealStats.childCount})
          </div>
        </div>

        {/* PWA 앱 설치율 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3 sm:p-3.5 rounded-2xl space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-3xs sm:text-2xs font-semibold">홈화면 앱(PWA)</span>
            <Smartphone size={14} className="text-indigo-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-indigo-300">{metrics.pwaInstalledCount}<span className="text-3xs sm:text-2xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-3xs text-indigo-400/80 font-semibold">설치율 {metrics.pwaInstalledRate}%</div>
        </div>

        {/* 목회 관심 성도 / 2주+ 결석 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3 sm:p-3.5 rounded-2xl space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-3xs sm:text-2xs font-semibold">관심 돌봄 성도</span>
            <AlertTriangle size={14} className="text-rose-400" />
          </div>
          <div className="text-base sm:text-lg font-bold text-rose-300">
            {metrics.careNeededCount}<span className="text-3xs sm:text-2xs font-normal text-slate-400 ml-1">명</span>
          </div>
          <div className="text-3xs text-rose-400/80">앱 접속 중 2주+ 결석</div>
        </div>
      </div>

      {/* ─── 3. 통계 시각화 섹션 (시간대 피크 + 출석/식사 트렌드 + 기기 점유율) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* 시간대별 접속 피크 (24시간 막대 차트) */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3.5 sm:p-4 rounded-2xl space-y-3 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-blue-400" />
                <h2 className="text-xs font-bold text-white">시간대별 접속 피크 (0~23시)</h2>
              </div>
              <span className="text-3xs text-slate-400">자주 찾는 시간대</span>
            </div>

            {/* 24시간 바 차트 */}
            <div className="flex items-end gap-1 sm:gap-1.5 h-24 pt-3 pb-1.5 px-1 bg-slate-900/60 rounded-xl border border-slate-700/40 overflow-x-auto">
              {hourlyStats.hours.map(h => {
                const heightPercent = Math.round((h.count / hourlyStats.maxCount) * 100)
                const isPeak = h.count > 0 && h.count === hourlyStats.maxCount
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 min-w-[10px] sm:min-w-[12px] group relative">
                    <div className="absolute -top-7 bg-slate-950 text-white text-3xs px-2 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 border border-slate-700">
                      {h.hour}시: {h.count}건
                    </div>
                    <div className="w-full bg-slate-800 rounded-t-sm flex-1 flex items-end">
                      <div
                        style={{ height: `${Math.max(heightPercent, 4)}%` }}
                        className={`w-full rounded-t-sm transition-all duration-300 ${
                          isPeak
                            ? 'bg-gradient-to-t from-blue-600 to-amber-400'
                            : h.count > 0
                              ? 'bg-gradient-to-t from-blue-600 to-blue-400 group-hover:from-blue-500 group-hover:to-blue-300'
                              : 'bg-slate-700/40'
                        }`}
                      />
                    </div>
                    <span className={`text-3xs font-mono ${h.hour % 4 === 0 ? 'text-slate-400' : 'text-transparent'}`}>
                      {h.hour}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-3xs text-slate-400 pt-1.5 border-t border-slate-700/40">
            <span>새벽 (00~06시)</span>
            <span>오전 (06~12시)</span>
            <span>오후 (12~18시)</span>
            <span>저녁/밤 (18~24시)</span>
          </div>
        </div>

        {/* 주일 예배 출석률 & 식사 신청 현황 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3.5 sm:p-4 rounded-2xl space-y-3 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <CalendarCheck size={14} className="text-teal-400" />
                <h2 className="text-xs font-bold text-white">주일 예배 출석 & 식사 통계</h2>
              </div>
              <span className="text-3xs text-slate-400">최근 4주 현황</span>
            </div>

            {/* 최근 4주 출석률 트렌드 */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/40 space-y-1.5 mb-2.5">
              <div className="flex items-center justify-between text-3xs font-semibold text-slate-400">
                <span>최근 주차별 출석률</span>
                <span className="text-teal-400 font-bold">평균 {recentAttendanceTrend.length > 0 ? Math.round(recentAttendanceTrend.reduce((acc, t) => acc + t.rate, 0) / recentAttendanceTrend.length) : 0}%</span>
              </div>
              {recentAttendanceTrend.length === 0 ? (
                <div className="text-center py-2 text-slate-500 text-3xs">등록된 출석 이력이 없습니다.</div>
              ) : (
                <div className="space-y-1">
                  {recentAttendanceTrend.map(t => (
                    <div key={t.date} className="space-y-0.5">
                      <div className="flex justify-between text-3xs text-slate-300 font-medium">
                        <span>{t.date} 주일</span>
                        <span className="font-mono text-teal-300">{t.attend}명 출석 ({t.rate}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
                        <div className="bg-teal-400 h-full rounded-full transition-all duration-500" style={{ width: `${t.rate}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 이번 주 식사 신청 현황 바 */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/40 space-y-1">
              <div className="flex items-center justify-between text-3xs font-semibold text-slate-300">
                <span className="flex items-center gap-1">
                  <Utensils size={12} className="text-amber-400" />
                  <span>이번 주 식사 신청 ({mealStats.targetSunday})</span>
                </span>
                <span className="text-amber-300 font-bold font-mono">총 {mealStats.totalMeals}명</span>
              </div>
              <div className="flex items-center gap-1.5 text-3xs text-slate-400 pt-0.5">
                <span className="text-emerald-400">🍚 {mealStats.attendingFamilyCount}가정</span>
                <span>·</span>
                <span className="text-slate-400">❌ {mealStats.absentFamilyCount}가정</span>
                <span>·</span>
                <span className="text-orange-400 font-medium">⏳ {mealStats.pendingFamilyCount}가정</span>
              </div>
            </div>
          </div>

          <p className="text-3xs text-slate-500 pt-1.5 border-t border-slate-700/40">
            * 출석 체크 및 식사 신청 탭과 실시간 연동됩니다.
          </p>
        </div>

        {/* 기기 및 실행 환경 점유율 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-3.5 sm:p-4 rounded-2xl space-y-3 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Smartphone size={14} className="text-emerald-400" />
                <h2 className="text-xs font-bold text-white">기기 및 실행 환경 점유율</h2>
              </div>
              <span className="text-3xs text-slate-400">PWA vs 웹</span>
            </div>

            {/* 실행 방식 (앱 vs 웹) */}
            <div className="flex items-center gap-2 text-2xs font-bold mb-2.5">
              <div className="flex-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 p-2 rounded-xl text-center">
                📱 홈화면 앱 {platformStats.pwa.app.rate}% ({platformStats.pwa.app.count}명)
              </div>
              <div className="flex-1 bg-slate-700/40 text-slate-300 border border-slate-600/30 p-2 rounded-xl text-center">
                🌐 웹 브라우저 {platformStats.pwa.web.rate}% ({platformStats.pwa.web.count}명)
              </div>
            </div>

            {/* OS 플랫폼 점유율 바 */}
            <div className="space-y-1 text-2xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/40">
              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-0.5 text-3xs">
                  <span>🍎 iPhone / iPad (iOS)</span>
                  <span>{platformStats.os.iOS.count}명 ({platformStats.os.iOS.rate}%)</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-1 overflow-hidden">
                  <div className="bg-blue-400 h-full rounded-full" style={{ width: `${platformStats.os.iOS.rate}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-0.5 text-3xs">
                  <span>🤖 Galaxy / Android</span>
                  <span>{platformStats.os.Android.count}명 ({platformStats.os.Android.rate}%)</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-1 overflow-hidden">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${platformStats.os.Android.rate}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-0.5 text-3xs">
                  <span>💻 Windows PC</span>
                  <span>{platformStats.os.Windows.count}명 ({platformStats.os.Windows.rate}%)</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-1 overflow-hidden">
                  <div className="bg-amber-400 h-full rounded-full" style={{ width: `${platformStats.os.Windows.rate}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-semibold mb-0.5 text-3xs">
                  <span>🖥️ Mac</span>
                  <span>{platformStats.os.Mac.count}명 ({platformStats.os.Mac.rate}%)</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-1 overflow-hidden">
                  <div className="bg-purple-400 h-full rounded-full" style={{ width: `${platformStats.os.Mac.rate}%` }} />
                </div>
              </div>
            </div>
          </div>

          <p className="text-3xs text-slate-500 pt-1.5 border-t border-slate-700/40">
            * 성도 접속 시 자동 집계됩니다.
          </p>
        </div>
      </div>

      {/* ─── 4. 목회 돌봄 관심 성도 알림 배너 (앱 접속 중이지만 2주+ 결석) ─── */}
      {metrics.careNeededCount > 0 && (
        <div className="bg-gradient-to-r from-rose-950/60 to-slate-900 border border-rose-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 border border-rose-500/30">
              <AlertTriangle size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-rose-300">목회적 돌봄 관심 성도 ({metrics.careNeededCount}명)</h3>
                <span className="text-3xs bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded border border-rose-500/30">심방 권장</span>
              </div>
              <p className="text-2xs text-slate-300 mt-0.5 leading-relaxed">
                앱 접속 중이지만 주일 예배에 <strong>2주 이상 연속 결석</strong> 중인 성도입니다. 따뜻한 안부 권장을 추천합니다.
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilterType('care')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-2xs font-bold transition-all shrink-0 cursor-pointer shadow-md"
          >
            <Users size={12} />
            <span>관심 성도 보기</span>
          </button>
        </div>
      )}

      {/* ─── 5. 상세 현황 뷰 (개인별 테이블 vs 가족별 뷰 전환) ─── */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Users size={15} className="text-blue-400" />
              <h2 className="text-xs font-bold text-white">
                {viewMode === 'individual'
                  ? `성도별 상세 이용 현황 (${filteredMembers.length}명)`
                  : `가족 단위 통합 접속 뷰 (${familyViewUnits.length}가정)`
                }
              </h2>
            </div>

            {/* 뷰 모드 스위처 (개인별 / 가족별) */}
            <div className="flex bg-slate-900/80 p-0.5 rounded-xl border border-slate-700">
              <button
                onClick={() => setViewMode('individual')}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-2xs font-bold transition-all cursor-pointer ${
                  viewMode === 'individual'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users size={11} />
                <span>개인별</span>
              </button>
              <button
                onClick={() => setViewMode('family')}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-2xs font-bold transition-all cursor-pointer ${
                  viewMode === 'family'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users2 size={11} />
                <span>가족별</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 검색창 */}
            <div className="relative min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="이름/직분/라브리 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-xl text-2xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-medium"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">✕</button>
              )}
            </div>

            {/* 정렬 셀렉트 */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-900/80 border border-slate-700 text-2xs text-slate-200 font-semibold px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="recent">⏱️ 최근 접속순</option>
              <option value="name">🔤 이름 가나다순</option>
              <option value="posts">📝 글/댓글 활동순</option>
              <option value="reactions">🤍 좋아요/반응순</option>
              <option value="absence">⚠️ 연속 결석순</option>
              <option value="created">📅 가입일순</option>
            </select>
          </div>
        </div>

        {/* 필터 칩 */}
        <div className="flex gap-1.5 flex-wrap text-2xs font-semibold">
          {[
            { key: 'all', label: `전체 (${actualMembers.length})` },
            { key: 'pwa', label: `📱 PWA 앱 (${metrics.pwaInstalledCount})` },
            { key: 'push', label: `🔔 알림 ON (${metrics.pushEnabledCount})` },
            { key: 'today', label: `⚡ 오늘 접속 (${metrics.activeTodayCount})` },
            { key: 'quiet', label: `👀 조용한 독자 (반응만)` },
            { key: 'care', label: `⚠️ 목회 관심 (${metrics.careNeededCount})` },
            { key: 'streak2', label: `⚠️ 2주+ 결석` },
            { key: 'inactive14', label: `💤 14일+ 미접속` },
            { key: 'labri1', label: `라브리1` },
            { key: 'labri2', label: `라브리2` },
            { key: 'labri3', label: `라브리3` },
            { key: 'pending', label: `⏳ 승인 대기 (${metrics.pending})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key)}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                filterType === f.key
                  ? 'bg-blue-600 text-white shadow-md font-bold'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ─── 5-A. 개인별 성도 목록 테이블 ─── */}
        {viewMode === 'individual' && (
          <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/40">
            <table className="w-full text-left text-2xs">
              <thead className="bg-slate-900/90 text-slate-400 text-2xs font-bold border-b border-slate-700/80">
                <tr>
                  <th className="p-3">성도 정보</th>
                  <th className="p-3">최근 접속</th>
                  <th className="p-3">실행 방식</th>
                  <th className="p-3">기기 / 브라우저</th>
                  <th className="p-3">푸시 알림</th>
                  <th className="p-3">주일 출석 (최근 4주)</th>
                  <th className="p-3">활동 참여도</th>
                  <th className="p-3">가입일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500 text-xs">
                      조건에 해당하는 성도가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map(member => {
                    const lastPostOrCommentTime = activityCounts.lastActivityByAuthor[member.id]
                    const rel = member.lastActiveAt
                      ? formatRelativeTime(member.lastActiveAt)
                      : lastPostOrCommentTime
                      ? { text: `${formatRelativeTime(lastPostOrCommentTime).text} (글/댓글)`, level: 'week' as const }
                      : member.createdAt
                      ? { text: `${formatRelativeTime(member.createdAt).text} (가입일)`, level: 'old' as const }
                      : { text: '기록 없음', level: 'none' as const }

                    const pushCount = pushSubUserMap.get(member.id) || 0
                    const postsCount = activityCounts.postsByAuthor[member.id] || 0
                    const commentsCount = activityCounts.commentsByAuthor[member.id] || 0
                    const reactionsCount = activityCounts.reactionsByUser[member.id] || 0
                    const attendStats = memberAttendanceStats[member.id]
                    const streak = attendStats?.absenceStreak || 0

                    return (
                      <tr key={member.id} className="hover:bg-slate-800/50 transition-colors">
                        {/* 성도 정보 */}
                        <td className="p-3">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Avatar allUsers={profiles} authorId={member.id} authorName={member.name} size="w-7 h-7 text-2xs" />
                            <div className="min-w-0">
                              <div className="font-bold text-white flex items-center gap-1.5 truncate">
                                <span>{member.name}</span>
                                {member.duty && (
                                  <span className="text-3xs bg-slate-700 text-slate-300 px-1 py-0.2 rounded font-normal shrink-0">
                                    {member.duty}
                                  </span>
                                )}
                              </div>
                              <div className="text-3xs text-slate-400 mt-0.5">
                                {member.labriId || '라브리 미정'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 최근 접속 시간 */}
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${
                            rel.level === 'recent' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            rel.level === 'today' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                            rel.level === 'week' ? 'bg-slate-700 text-slate-300' :
                            rel.level === 'old' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                            'bg-slate-800 text-slate-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              rel.level === 'recent' ? 'bg-emerald-400 animate-pulse' :
                              rel.level === 'today' ? 'bg-blue-400' :
                              rel.level === 'week' ? 'bg-slate-400' :
                              rel.level === 'old' ? 'bg-orange-400' :
                              'bg-slate-600'
                            }`} />
                            {rel.text}
                          </span>
                        </td>

                        {/* 실행 방식 */}
                        <td className="p-3 whitespace-nowrap">
                          {member.isPwa ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md text-2xs font-bold">
                              <Smartphone size={11} /> PWA 앱
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md text-2xs font-medium">
                              <Monitor size={11} /> 웹
                            </span>
                          )}
                        </td>

                        {/* 기기 / 브라우저 */}
                        <td className="p-3 whitespace-nowrap text-2xs text-slate-300">
                          <div className="flex items-center gap-1 font-medium">
                            <span>{member.devicePlatform || '미상'}</span>
                            {member.browserName && (
                              <>
                                <span className="text-slate-500">·</span>
                                <span className="text-slate-400">{member.browserName}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* 푸시 알림 */}
                        <td className="p-3 whitespace-nowrap">
                          {pushCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-2xs">
                              <Bell size={12} /> ON ({pushCount}대)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-500 text-2xs">
                              <BellOff size={12} /> OFF
                            </span>
                          )}
                        </td>

                        {/* 주일 출석 (최근 4주) */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {attendStats?.recent4Statuses && attendStats.recent4Statuses.length > 0 ? (
                              <div className="flex items-center gap-1">
                                {attendStats.recent4Statuses.map((st, idx) => (
                                  <span
                                    key={idx}
                                    title={st === 'ATTEND' ? '출석' : st === 'ABSENT' ? '결석' : '기록없음'}
                                    className={`w-2.5 h-2.5 rounded-full ${
                                      st === 'ATTEND' ? 'bg-teal-400' :
                                      st === 'ABSENT' ? 'bg-rose-500/70' :
                                      'bg-slate-700'
                                    }`}
                                  />
                                ))}
                              </div>
                            ) : (
                              <span className="text-3xs text-slate-500">기록없음</span>
                            )}

                            {streak >= 2 && (
                              <span className="text-3xs bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded border border-rose-500/30">
                                {streak}주 결석
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 활동 참여도 (글/댓글/반응) */}
                        <td className="p-3 whitespace-nowrap text-2xs text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span title="작성 글 수">📝 {postsCount}</span>
                            <span className="text-slate-600">|</span>
                            <span title="작성 댓글 수">💬 {commentsCount}</span>
                            <span className="text-slate-600">|</span>
                            <span title="좋아요/아멘 반응 수" className={reactionsCount > 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                              🤍 {reactionsCount}
                            </span>
                          </div>
                        </td>

                        {/* 가입일 */}
                        <td className="p-3 whitespace-nowrap text-2xs text-slate-500 font-mono">
                          {member.createdAt}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── 5-B. 가족 단위 통합 접속 뷰 ─── */}
        {viewMode === 'family' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {familyViewUnits.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500 text-xs">
                조건에 해당하는 가정이 없습니다.
              </div>
            ) : (
              familyViewUnits.map(unit => {
                const isAllActive = unit.status === 'all_active'
                const isPartial = unit.status === 'partial_active'

                return (
                  <div
                    key={unit.key}
                    className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-4 space-y-3.5 hover:border-slate-600 transition-all shadow-md flex flex-col justify-between"
                  >
                    <div>
                      {/* 카드 상단: 가정명 & 활성도 배지 */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2">
                          <Users2 size={16} className="text-blue-400" />
                          <h3 className="font-bold text-xs text-white">{unit.label}</h3>
                        </div>
                        <span className={`text-3xs font-bold px-2 py-0.5 rounded-full border ${
                          isAllActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                          isPartial ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                          'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {isAllActive ? '🟢 전원 활동' : isPartial ? '🟡 일부 활동' : '⚪ 전원 미접속'}
                        </span>
                      </div>

                      {/* 구성원 개별 상태 리스트 */}
                      <div className="space-y-2 pt-2">
                        {unit.members.map(m => {
                          const rel = m.lastActiveAt
                            ? formatRelativeTime(m.lastActiveAt)
                            : activityCounts.lastActivityByAuthor[m.id]
                            ? { text: formatRelativeTime(activityCounts.lastActivityByAuthor[m.id]).text, level: 'week' as const }
                            : { text: '기록 없음', level: 'none' as const }

                          const hasPush = pushSubUserMap.has(m.id)

                          return (
                            <div key={m.id} className="flex items-center justify-between text-2xs bg-slate-800/40 p-2 rounded-xl border border-slate-700/30">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar allUsers={profiles} authorId={m.id} authorName={m.name} size="w-6 h-6 text-3xs" />
                                <div className="truncate">
                                  <div className="font-semibold text-white flex items-center gap-1">
                                    <span>{m.name}</span>
                                    {m.familyRole && (
                                      <span className="text-3xs text-slate-400 font-normal">({m.familyRole})</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 text-3xs">
                                {m.isPwa && (
                                  <span className="bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">
                                    PWA
                                  </span>
                                )}
                                {hasPush ? (
                                  <span className="text-emerald-400" title="푸시 알림 ON">
                                    <Bell size={11} />
                                  </span>
                                ) : (
                                  <span className="text-slate-600" title="푸시 알림 OFF">
                                    <BellOff size={11} />
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded font-mono ${
                                  rel.level === 'recent' ? 'bg-emerald-500/20 text-emerald-300 font-bold' :
                                  rel.level === 'today' ? 'bg-blue-500/20 text-blue-300 font-bold' :
                                  'bg-slate-800 text-slate-400'
                                }`}>
                                  {rel.text}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* 카드 하단: 이번 주 식사 신청 현황 */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-2xs">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Utensils size={12} className="text-amber-400" />
                        <span>이번 주 식사</span>
                      </span>
                      {unit.mealReg ? (
                        unit.mealReg.attending ? (
                          <span className="text-emerald-400 font-bold">
                            식사 {(unit.mealReg.adult_count || 0) + (unit.mealReg.child_count || 0)}명
                            <span className="text-3xs text-slate-400 font-normal ml-1">
                              (어른{unit.mealReg.adult_count || 0}, 아이{unit.mealReg.child_count || 0})
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">❌ 식사 안 함</span>
                        )
                      ) : (
                        <span className="text-orange-400 font-medium">⏳ 아직 미신청</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
