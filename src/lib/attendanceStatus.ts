'use client'

import { useEffect, useMemo, useState } from 'react'
import { UserProfile, isApprovedMember, canEditChildAttendance } from './mockData'
import { dbFetchAttendanceRecords, dbFetchChildAttendanceRecords } from './db'
import { CHILD_ATTENDANCE_GROUPS, buildDependentEntries, parseTeachGroups } from './familyInfo'
import { useCachedQuery } from './dataCache'

// ─────────────────────────────────────────────────────────────────────────────
// 출석체크(출첵) 공용 규칙
//
// 관리 화면의 출첵 탭(admin/AttendanceCheckTab)과, "아직 출첵을 안 했다"는 빨간 점
// (맨 위 헤더·출첵 탭 이름)이 **같은 기준**을 쓰도록 여기 한 곳에 모았습니다.
// ─────────────────────────────────────────────────────────────────────────────

export const ADULT_GROUPS = ['라브리1', '라브리2', '라브리3', '미정']

/** 출석을 체크하는 자녀 그룹인지 ("출석 미적용"은 여기서 빠집니다) */
export function isChildGroup(group: string): boolean {
  return (CHILD_ATTENDANCE_GROUPS as readonly string[]).includes(group)
}

/** 출석체크 대상 주일 = 가장 최근 지난 주일(오늘이 주일이면 오늘) 'YYYY-MM-DD' */
export function lastSundayStr(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 출석체크 대상 성도 (승인대기자·쿠폰 담당 제외) */
export function attendanceMembers(allUsers: UserProfile[]): UserProfile[] {
  return allUsers.filter(u => isApprovedMember(u.role) && u.role !== 'COUPON')
}

/** 교회학교 그룹이 정해진 자녀들 */
export function attendanceChildren(allUsers: UserProfile[]) {
  return buildDependentEntries(allUsers).filter(c => isChildGroup(c.childLabriId || ''))
}

/**
 * 이 사람이 출석을 입력하는 그룹(방문자 제외).
 *  · 관리자: 모든 어른 그룹 + 자녀가 있는 교회학교 그룹
 *  · 리더: 자기 라브리
 *  · 선생님: 맡은 교회학교 그룹(정해지지 않았으면 모든 교회학교 그룹)
 */
export function checkGroupsFor(user: UserProfile, children: ReturnType<typeof attendanceChildren>): string[] {
  const activeChildGroups = CHILD_ATTENDANCE_GROUPS.filter(g => children.some(c => c.childLabriId === g))
  if (user.role === 'TEACHER') {
    const mine = parseTeachGroups(user.teachGroup)
    return mine.length > 0 ? activeChildGroups.filter(g => mine.includes(g)) : [...activeChildGroups]
  }
  if (user.role === 'ADMIN') return [...ADULT_GROUPS, ...activeChildGroups]
  if (user.role === 'LEADER') return [user.labriId || '미정']
  return []
}

/** 한 그룹의 출석체크 대상 id 목록 (자녀는 'dep_<id>') */
export function groupMemberIds(group: string, members: UserProfile[], children: ReturnType<typeof attendanceChildren>): string[] {
  if (isChildGroup(group)) return children.filter(c => c.childLabriId === group).map(c => c.id)
  const list = group === '미정'
    ? members.filter(u => !u.labriId || u.labriId === '미정')
    : members.filter(u => u.labriId === group)
  return list.map(u => u.id)
}

/** 지난 주일 날짜를 들고 있다가, 날이 바뀌면(주일이 지나면) 알아서 바꿉니다. */
export function useLastSunday(): string {
  const [dateStr, setDateStr] = useState(() => lastSundayStr())
  useEffect(() => {
    const sync = () => setDateStr(lastSundayStr())
    const timer = setInterval(sync, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return dateStr
}

/**
 * 지난 주일 출석체크를 다 했는지.
 * 맡은 그룹의 **모든** 대상에게 출석/결석이 저장돼 있어야 "완료"입니다(방문자는 선택 사항이라 제외).
 * 출첵 탭에서 저장하면 같은 조회 결과(캐시)를 쓰므로 빨간 점도 바로 사라집니다.
 */
export function useAttendanceCheckStatus(currentUser: UserProfile | undefined, allUsers: UserProfile[]) {
  const role = currentUser?.role
  const canCheck = !!currentUser && canEditChildAttendance(role)
  const isTeacher = role === 'TEACHER'
  const dateStr = useLastSunday()

  const { data: adultRecords } = useCachedQuery(
    `attendanceRecords:${dateStr}`,
    () => dbFetchAttendanceRecords(dateStr),
    { enabled: canCheck && !isTeacher }
  )
  const { data: childRecords } = useCachedQuery(
    `childAttendanceRecords:${dateStr}`,
    () => dbFetchChildAttendanceRecords(dateStr),
    { enabled: canCheck }
  )

  return useMemo(() => {
    if (!canCheck || !currentUser) return { applicable: false, loaded: false, done: true, pendingGroups: [] as string[] }
    const loaded = (isTeacher || adultRecords !== undefined) && childRecords !== undefined
    // 서버의 미완료 알림(notify_attendance_pending)과 같게, 그 주일 저녁 6시(베트남) 뒤에 가입한 분은 뺍니다.
    const cutoff = new Date(`${dateStr}T18:00:00+07:00`).getTime()
    const members = attendanceMembers(allUsers).filter(u => !u.createdAt || new Date(u.createdAt).getTime() <= cutoff)
    const children = attendanceChildren(allUsers)
    const recorded = new Set<string>()
    ;(adultRecords || []).forEach((r: { user_id?: string }) => { if (r.user_id) recorded.add(r.user_id) })
    ;(childRecords || []).forEach((r: { dependent_id?: string }) => { if (r.dependent_id) recorded.add(`dep_${r.dependent_id}`) })
    const pendingGroups = checkGroupsFor(currentUser, children).filter(g => {
      const ids = groupMemberIds(g, members, children)
      return ids.length > 0 && !ids.every(id => recorded.has(id))
    })
    // 불러오기 전에는 "완료"로 보고 빨간 점을 띄우지 않습니다(깜빡임 방지).
    return { applicable: true, loaded, done: !loaded || pendingGroups.length === 0, pendingGroups }
  }, [canCheck, currentUser, isTeacher, allUsers, adultRecords, childRecords, dateStr])
}
