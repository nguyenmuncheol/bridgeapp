'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Users, Smartphone, Bell, BellOff, Clock, Search, RefreshCw,
  Home, Shield, TrendingUp, AlertTriangle, Monitor, ExternalLink,
  CheckCircle2, Flame, Calendar, Laptop, ChevronDown, Filter,
  Copy, Check, Database
} from 'lucide-react'
import { UserProfile, getUserDisplayName, isApprovedMember } from '../../lib/mockData'
import {
  dbFetchProfiles, dbFetchAllPushSubscriptions, dbFetchUserAccessLogs,
  dbFetchMemberActivityCounts, PushSubscriptionInfo, AccessLogItem
} from '../../lib/db'
import { trackUserActivity } from '../../lib/activityTracker'
import { matchesKoreanSearch } from '../../lib/koreanSearch'
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
  const [activityCounts, setActivityCounts] = useState<{
    postsByAuthor: Record<string, number>
    commentsByAuthor: Record<string, number>
    lastActivityByAuthor: Record<string, string>
  }>({
    postsByAuthor: {},
    commentsByAuthor: {},
    lastActivityByAuthor: {},
  })

  const [isLoading, setIsLoading] = useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'posts' | 'created'>('recent')
  const [copiedSql, setCopiedSql] = useState(false)

  // 데이터 로딩
  const loadData = async () => {
    setIsLoading(true)
    try {
      const [pList, pSubs, aLogs, actCounts] = await Promise.all([
        dbFetchProfiles().catch(() => []),
        dbFetchAllPushSubscriptions().catch(() => []),
        dbFetchUserAccessLogs().catch(() => []),
        dbFetchMemberActivityCounts().catch(() => ({ postsByAuthor: {}, commentsByAuthor: {}, lastActivityByAuthor: {} })),
      ])

      setProfiles(pList || [])
      setPushSubs(pSubs || [])
      setAccessLogs(aLogs || [])
      setActivityCounts(actCounts || { postsByAuthor: {}, commentsByAuthor: {}, lastActivityByAuthor: {} })
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

    actualMembers.forEach(p => {
      if (p.isPwa) pwaInstalledCount++
      if (pushSubUserMap.has(p.id)) pushEnabledCount++

      if (p.lastActiveAt) {
        const diff = now - new Date(p.lastActiveAt).getTime()
        if (diff <= oneDayMs) activeTodayCount++
        if (diff <= sevenDaysMs) active7DaysCount++
        if (diff >= thirtyDaysMs) inactive30DaysCount++
      } else {
        inactive30DaysCount++
      }
    })

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
    }
  }, [actualMembers, pushSubUserMap])

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

    // accessLogs가 있으면 활용하고, 없으면 lastActiveAt 시간대 기반으로 보조 집계
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

  // ── 4. 성도 목록 필터링 및 정렬 ──
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
        if (!matchName && !matchDuty && !matchPhone) return false
      }

      // 탭 필터
      const memberTime = p.lastActiveAt || activityCounts.lastActivityByAuthor[p.id] || p.createdAt
      const memberTimeMs = memberTime ? new Date(memberTime).getTime() : 0

      if (filterType === 'pwa') return p.isPwa === true
      if (filterType === 'push') return pushSubUserMap.has(p.id)
      if (filterType === 'today') {
        return memberTimeMs > 0 && (now - memberTimeMs <= oneDayMs)
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
      if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return 0
    })
  }, [actualMembers, searchQuery, filterType, sortBy, pushSubUserMap, activityCounts])

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
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">성도 이용 현황 & 활동 분석</h1>
              <span className="text-2xs bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-500/30">Admin Secret</span>
            </div>
            <p className="text-2xs text-slate-400 mt-0.5">
              접속 패턴 · PWA 앱 설치율 · 푸시 알림 허용 여부 종합 리포트
              {lastRefreshedAt && <span className="ml-2 text-slate-500">(동기화: {lastRefreshedAt})</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
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

      {/* ─── 2. 핵심 요약 카드 (KPI Cards) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 총 성도 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-2xs font-semibold">총 등록 성도</span>
            <Users size={16} className="text-blue-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">{metrics.total}<span className="text-xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-2xs text-slate-400">승인 {metrics.approved} · 대기 {metrics.pending}</div>
        </div>

        {/* 7일 활성 성도 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-2xs font-semibold">7일 내 활동</span>
            <TrendingUp size={16} className="text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">{metrics.active7DaysCount}<span className="text-xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-2xs text-emerald-400/80 font-semibold">활성률 {metrics.active7DaysRate}%</div>
        </div>

        {/* PWA 앱 설치율 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-2xs font-semibold">홈화면 앱(PWA)</span>
            <Smartphone size={16} className="text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-300">{metrics.pwaInstalledCount}<span className="text-xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-2xs text-indigo-400/80 font-semibold">설치율 {metrics.pwaInstalledRate}%</div>
        </div>

        {/* 푸시 알림 허용 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-2xs font-semibold">푸시 알림 ON</span>
            <Bell size={16} className="text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300">{metrics.pushEnabledCount}<span className="text-xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-2xs text-amber-400/80 font-semibold">허용율 {metrics.pushEnabledRate}%</div>
        </div>

        {/* 오늘 접속 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-2xs font-semibold">오늘 접속자</span>
            <Flame size={16} className="text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-300">{metrics.activeTodayCount}<span className="text-xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-2xs text-slate-400">24시간 내 접속</div>
        </div>

        {/* 30일+ 장기 미접속 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl space-y-1.5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-2xs font-semibold">장기 미접속</span>
            <AlertTriangle size={16} className="text-orange-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-orange-300">{metrics.inactive30DaysCount}<span className="text-xs font-normal text-slate-400 ml-1">명</span></div>
          <div className="text-2xs text-orange-400/80">30일 이상 미방문</div>
        </div>
      </div>

      {/* ─── 3. 통계 시각화 섹션 (시간대 피크 & 기기/OS 점유율) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* 시간대별 접속 피크 (24시간 막대 차트) */}
        <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/60 p-4 sm:p-5 rounded-2xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-blue-400" />
              <h2 className="text-sm font-bold text-white">시간대별 접속 피크 (00:00 ~ 23:00)</h2>
            </div>
            <span className="text-2xs text-slate-400">성도들이 가장 자주 접속하는 시간대</span>
          </div>

          {/* 24시간 바 차트 */}
          <div className="flex items-end gap-1 sm:gap-1.5 h-36 pt-4 pb-2 px-1 bg-slate-900/60 rounded-xl border border-slate-700/40 overflow-x-auto">
            {hourlyStats.hours.map(h => {
              const heightPercent = Math.round((h.count / hourlyStats.maxCount) * 100)
              const isPeak = h.count > 0 && h.count === hourlyStats.maxCount
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 min-w-[14px] sm:min-w-[18px] group relative">
                  {/* 호버 시 툴팁 */}
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
                  <span className={`text-3xs font-mono ${h.hour % 3 === 0 ? 'text-slate-400' : 'text-transparent'}`}>
                    {h.hour}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between text-2xs text-slate-400 px-1">
            <span>새벽 (00~06시)</span>
            <span>오전 (06~12시)</span>
            <span>오후 (12~18시)</span>
            <span>저녁/밤 (18~24시)</span>
          </div>
        </div>

        {/* 기기 및 실행 환경 점유율 */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 sm:p-5 rounded-2xl space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Smartphone size={16} className="text-emerald-400" />
              <h2 className="text-sm font-bold text-white">기기 및 실행 방식 점유율</h2>
            </div>

            {/* 실행 방식 (앱 vs 웹) */}
            <div className="space-y-2 mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
              <span className="text-2xs font-semibold text-slate-400">실행 방식 (PWA 설치 여부)</span>
              <div className="flex items-center gap-2 text-xs font-bold">
                <div className="flex-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 p-2 rounded-lg text-center">
                  📱 홈화면 앱 {platformStats.pwa.app.rate}% ({platformStats.pwa.app.count}명)
                </div>
                <div className="flex-1 bg-slate-700/40 text-slate-300 border border-slate-600/30 p-2 rounded-lg text-center">
                  🌐 웹 브라우저 {platformStats.pwa.web.rate}% ({platformStats.pwa.web.count}명)
                </div>
              </div>
            </div>

            {/* OS 플랫폼 점유율 바 */}
            <div className="space-y-2">
              <span className="text-2xs font-semibold text-slate-400">OS 플랫폼 점유율</span>
              <div className="space-y-1.5 text-2xs">
                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-0.5">
                    <span>🍎 iPhone / iPad (iOS)</span>
                    <span>{platformStats.os.iOS.count}명 ({platformStats.os.iOS.rate}%)</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-400 h-full rounded-full" style={{ width: `${platformStats.os.iOS.rate}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-0.5">
                    <span>🤖 Galaxy / Android</span>
                    <span>{platformStats.os.Android.count}명 ({platformStats.os.Android.rate}%)</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${platformStats.os.Android.rate}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-0.5">
                    <span>💻 Windows PC</span>
                    <span>{platformStats.os.Windows.count}명 ({platformStats.os.Windows.rate}%)</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-400 h-full rounded-full" style={{ width: `${platformStats.os.Windows.rate}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-0.5">
                    <span>🖥️ Mac</span>
                    <span>{platformStats.os.Mac.count}명 ({platformStats.os.Mac.rate}%)</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-purple-400 h-full rounded-full" style={{ width: `${platformStats.os.Mac.rate}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-3xs text-slate-500 pt-2 border-t border-slate-700/40">
            * 성도가 앱을 켤 때 브라우저 환경을 자동 인식하여 집계됩니다.
          </p>
        </div>
      </div>

      {/* ─── 4. 성도별 상세 이용 현황 테이블 ─── */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-400" />
            <h2 className="text-sm font-bold text-white">성도별 상세 이용 현황 ({filteredMembers.length}명)</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 검색창 */}
            <div className="relative min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="이름/직분/전화번호 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-medium"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">✕</button>
              )}
            </div>

            {/* 정렬 셀렉트 */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-900/80 border border-slate-700 text-xs text-slate-200 font-semibold px-2.5 py-1.5 rounded-xl focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="recent">⏱️ 최근 접속순</option>
              <option value="name">🔤 이름 가나다순</option>
              <option value="posts">📝 활동(글/댓글)순</option>
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
            { key: 'inactive14', label: `⚠️ 14일+ 미접속` },
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

        {/* 성도 목록 테이블 */}
        <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/40">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 text-2xs font-bold border-b border-slate-700/80">
              <tr>
                <th className="p-3">성도 정보</th>
                <th className="p-3">최근 접속 시간</th>
                <th className="p-3">실행 방식</th>
                <th className="p-3">기기 / 브라우저</th>
                <th className="p-3">푸시 알림</th>
                <th className="p-3">활동 참여도</th>
                <th className="p-3">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                    조건에 해당하는 성도가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredMembers.map(member => {
                  const lastPostOrCommentTime = activityCounts.lastActivityByAuthor[member.id]
                  const isRealtime = Boolean(member.lastActiveAt)
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
                            <Smartphone size={11} /> 홈화면 앱(PWA)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md text-2xs font-medium">
                            <Monitor size={11} /> 웹 브라우저
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
                            <Bell size={12} /> 켜짐 ({pushCount}대)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 text-2xs">
                            <BellOff size={12} /> 꺼짐
                          </span>
                        )}
                      </td>

                      {/* 활동 참여도 */}
                      <td className="p-3 whitespace-nowrap text-2xs text-slate-300">
                        <div className="flex items-center gap-2">
                          <span>📝 글 {postsCount}</span>
                          <span className="text-slate-600">|</span>
                          <span>💬 댓글 {commentsCount}</span>
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
      </div>
    </div>
  )
}
