'use client'

import { useState, useMemo } from 'react'
import { Edit2, X } from 'lucide-react'
import { UserProfile, getUserDisplayName, isApprovedMember, formatAbsenceStreak } from '../../lib/mockData'
import { getMostRecentSunday } from '../../lib/dateUtils'
import { dbSaveAttendanceRecords, dbFetchChildAttendanceRecords, dbSaveChildAttendanceRecords, dbDeleteChildAttendance } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { normalizeLabriLabel } from '../../lib/adminHelpers'
import { CHILD_ATTENDANCE_GROUPS, buildDependentEntries } from '../../lib/familyInfo'
import { useCachedQuery } from '../../lib/dataCache'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'

interface StatsTabProps {
  currentUser?: UserProfile
  allUsers: UserProfile[]
  showToast: (msg: string) => void
  dbAttendanceData: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]>
  attendanceDateKeysDesc: string[]
  getAbsenceStreak: (userId: string, fromDate: string) => number
  loadAttendanceStats: () => void
}

/*
 * ⚠️ 이 화면만 글자 크기를 **숫자로 고정**해 두었습니다.
 *
 * 앱 전체 글자를 한 단계 키웠더니(본문 12→14px) 출석 통계의 표가 깨졌습니다.
 * 한 줄에 성도명·소속·출석여부·결석사유·수정 5칸이 들어가는데,
 * 글자가 커지면 칸이 서로 밀려 내용이 잘립니다.
 * → 여기만 예전 크기로 되돌립니다. 관리자만 보는 화면이라 큰 글씨가 덜 중요합니다.
 *   (나중에 "큰 글씨 모드"를 넣을 때도 이 화면은 제외 대상입니다)
 */
export default function StatsTab({
  currentUser, allUsers, showToast,
  dbAttendanceData, attendanceDateKeysDesc, getAbsenceStreak, loadAttendanceStats
}: StatsTabProps) {
  // 선생님은 자녀(교회학교) 출석만 봅니다. 어른 출석 통계는 숨깁니다.
  const isTeacher = currentUser?.role === 'TEACHER'
  // ── 출석 탭 — 기간(시작~끝) 선택 ──
  // 🐛 과거 제약: "최근 3개월" 드롭다운뿐이라 그보다 오래된 기록은 아예 볼 수 없었고,
  //    분기·반기·연간 출석률을 뽑으려면 방법이 없었습니다.
  // → 시작일/종료일을 직접 고르게 바꿨습니다. 기본값은 지금까지와 같은 느낌이 되도록
  //   "가장 최근 주일" 하루로 맞춰 둡니다.
  const defaultSunday = useMemo(() => getMostRecentSunday().dateStr, [])
  const [rangeStart, setRangeStart] = useState<string>(defaultSunday)
  const [rangeEnd, setRangeEnd] = useState<string>(defaultSunday)

  // 시작일이 종료일보다 뒤여도 통계가 사라지지 않도록 자동으로 바로잡아 사용합니다.
  const [safeStart, safeEnd] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart]

  const combinedMonthData = useMemo(() => {
    const filteredDb: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]> = {}
    Object.entries(dbAttendanceData).forEach(([date, list]) => {
      if (date >= safeStart && date <= safeEnd) {
        filteredDb[date] = list
      }
    })
    return filteredDb
  }, [safeStart, safeEnd, dbAttendanceData])

  // 상단 "선택 주일" 카드는 기간과 무관하게 **기록이 있는 모든 주일**에서 고를 수 있어야 합니다.
  // (기간을 좁혔다고 해서 보고 싶은 주일을 못 고르면 불편합니다)
  const allSundays = useMemo(() => Object.keys(dbAttendanceData).sort(), [dbAttendanceData])

  // 화면에 쓰는 기간 표기 (하루짜리면 날짜 하나만 보여줍니다)
  const rangeLabel = safeStart === safeEnd ? safeStart : `${safeStart} ~ ${safeEnd}`

  const [statsDate, setStatsDate] = useState<string>('')
  const selectedStatsDate = statsDate && allSundays.includes(statsDate) ? statsDate : (allSundays[allSundays.length - 1] || '')

  // 기간 단축 버튼 (자주 쓰는 범위를 한 번에)
  const applyQuickRange = (weeksBack: number) => {
    const end = getMostRecentSunday().dateStr
    const start = getMostRecentSunday(-weeksBack).dateStr
    setRangeStart(start)
    setRangeEnd(end)
  }

  const attendanceRows = useMemo(() => {
    // 선택한 주일은 기간과 무관하므로 원본에서 직접 가져옵니다.
    const data = dbAttendanceData[selectedStatsDate] || []
    return allUsers
      .filter(u => isApprovedMember(u.role) && u.role !== 'COUPON')
      .map(u => {
        const rec = data.find(r => r.userId === u.id)
        return { user: u, status: rec?.status || null, note: rec?.note || '' }
      })
  }, [dbAttendanceData, selectedStatsDate, allUsers])

  // 출석/결석 명단 정렬: ①이번 주 결석자를 연속결석 주수가 많은 순으로 먼저, ②그 외(출석·미기록)는
  // 한 그룹으로 묶어 뒤에, 같은 그룹 내에서는 이름 가나다순으로 정렬합니다.
  const sortedAttendanceRows = useMemo(() => {
    return attendanceRows
      .map(row => ({
        ...row,
        absenceStreak: row.status === 'ABSENT' ? getAbsenceStreak(row.user.id, selectedStatsDate) : 0
      }))
      .sort((a, b) => {
        const aAbsent = a.status === 'ABSENT'
        const bAbsent = b.status === 'ABSENT'
        if (aAbsent !== bAbsent) return aAbsent ? -1 : 1
        if (aAbsent && b.absenceStreak !== a.absenceStreak) return b.absenceStreak - a.absenceStreak
        return a.user.name.localeCompare(b.user.name, 'ko')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceRows, attendanceDateKeysDesc, dbAttendanceData, selectedStatsDate])

  // 라브리별 통계 (합계 행 포함)
  const labriStats = useMemo(() => {
    const labriGroups = ['라브리1', '라브리2', '라브리3', '라브리 미정']
    // 🐛 과거 버그: 아직 출석체크를 안 한 라브리도 "0/20명 (0%)"으로 표시되고
    // 전체 합계에도 그대로 들어갔습니다. "아무도 안 왔다"와 "아직 입력을 안 했다"가
    // 화면에서 똑같이 보여서, 목사님이 전체 출석률을 실제보다 훨씬 낮게 읽게 됐습니다.
    const rows = labriGroups.map(labri => {
      const members = attendanceRows.filter(r => normalizeLabriLabel(r.user.labriId) === labri)
      const recorded = members.filter(r => r.status !== null)
      const attend = recorded.filter(r => r.status === 'ATTEND').length
      return {
        label: labri,
        attend,
        total: recorded.length,
        memberCount: members.length,
        // 소속 성도는 있는데 기록이 하나도 없으면 "미기록"
        notRecorded: members.length > 0 && recorded.length === 0,
      }
    }).filter(r => r.memberCount > 0)

    // 합계는 실제로 기록된 라브리만 대상으로 계산합니다.
    const recordedRows = rows.filter(r => !r.notRecorded)
    const totalAttend = recordedRows.reduce((sum, r) => sum + r.attend, 0)
    const totalTotal = recordedRows.reduce((sum, r) => sum + r.total, 0)
    return { rows, totalAttend, totalTotal }
  }, [attendanceRows])

  // 그래프 채움색 — 눈이 편한 파스텔톤. 글자는 진한 색을 따로 써서 대비를 지킵니다.
  const BAR_COLORS: Record<string, string> = {
    '라브리1': '#93c5fd', '라브리2': '#fdba74', '라브리3': '#86efac', '라브리 미정': '#d8dbe2',
  }
  const TEXT_COLORS: Record<string, string> = {
    '라브리1': '#2563eb', '라브리2': '#c2570c', '라브리3': '#15803d', '라브리 미정': '#6b7280',
  }
  const TOTAL_BAR = '#a5b4fc'

  // ── 선택한 기간 전체의 라브리별 출석률 ──
  // 하루짜리 기간이면 위 labriStats 와 같은 값이 나오고,
  // 여러 주일을 고르면 그 기간 전체를 합산합니다. (분기·반기·연간 통계용)
  const rangeLabriStats = useMemo(() => {
    const members = allUsers.filter(u => isApprovedMember(u.role) && u.role !== 'COUPON')
    const labriOf = new Map(members.map(u => [u.id, normalizeLabriLabel(u.labriId)]))
    const groups = ['라브리1', '라브리2', '라브리3', '라브리 미정']

    const acc: Record<string, { attend: number; recorded: number }> = {}
    groups.forEach(g => { acc[g] = { attend: 0, recorded: 0 } })

    Object.values(combinedMonthData).forEach(list => {
      list.forEach(rec => {
        const labri = labriOf.get(rec.userId)
        if (!labri || !acc[labri]) return
        acc[labri].recorded += 1
        if (rec.status === 'ATTEND') acc[labri].attend += 1
      })
    })

    const rows = groups
      .map(label => ({
        label,
        attend: acc[label].attend,
        total: acc[label].recorded,
        memberCount: members.filter(u => normalizeLabriLabel(u.labriId) === label).length,
        notRecorded: acc[label].recorded === 0,
      }))
      .filter(r => r.memberCount > 0)

    const recordedRows = rows.filter(r => !r.notRecorded)
    return {
      rows,
      totalAttend: recordedRows.reduce((sum, r) => sum + r.attend, 0),
      totalTotal: recordedRows.reduce((sum, r) => sum + r.total, 0),
      sundayCount: Object.keys(combinedMonthData).length,
    }
  }, [combinedMonthData, allUsers])

  // ── 자녀(교회학교) 출석 ──
  // 자녀는 계정이 없어서 어른 출석표에 들어갈 수 없습니다. 별도 표에서 따로 받아옵니다.
  const { data: childRecords, refetch: refetchChildAttendance } = useCachedQuery(
    'childAttendanceRecords:all',
    () => dbFetchChildAttendanceRecords()
  )

  const childStats = useMemo(() => {
    const inRange = (childRecords || []).filter((r: any) => {
      const d = String(r.date_str || '')
      return d >= safeStart && d <= safeEnd
    })
    const rows = CHILD_ATTENDANCE_GROUPS.map(group => {
      const list = inRange.filter((r: any) => r.labri_id === group)
      const attend = list.filter((r: any) => r.status === 'ATTEND').length
      return { label: group, attend, total: list.length }
    }).filter(r => r.total > 0)
    return {
      rows,
      totalAttend: rows.reduce((sum, r) => sum + r.attend, 0),
      totalTotal: rows.reduce((sum, r) => sum + r.total, 0),
    }
  }, [childRecords, safeStart, safeEnd])

  // 선택한 주일의 교회학교 명단 (부서순 → 이름순, 성인 명단과 같은 구성)
  const childRosterRows = useMemo(() => {
    const byId = new Map<string, any>()
    ;(childRecords || []).forEach((r: any) => {
      if (String(r.date_str) === selectedStatsDate) byId.set(String(r.dependent_id), r)
    })
    const order = new Map<string, number>(CHILD_ATTENDANCE_GROUPS.map((g, i) => [g as string, i]))
    return buildDependentEntries(allUsers)
      .filter(c => (CHILD_ATTENDANCE_GROUPS as readonly string[]).includes(c.childLabriId || ''))
      .map(child => {
        const rec = byId.get(child.id.replace(/^dep_/, ''))
        return {
          child,
          status: (rec?.status as 'ATTEND' | 'ABSENT' | undefined) || null,
          note: rec?.note || '',
        }
      })
      .sort((a, b) => {
        const ga = order.get(a.child.childLabriId || '') ?? 99
        const gb = order.get(b.child.childLabriId || '') ?? 99
        return ga !== gb ? ga - gb : a.child.name.localeCompare(b.child.name, 'ko')
      })
  }, [childRecords, selectedStatsDate, allUsers])

  const CHILD_BAR: Record<string, string> = {
    '영아부': '#fbcfe8', '유아·유치부': '#fde68a', '초등부': '#a7f3d0', '중고등부': '#bfdbfe',
  }
  const CHILD_TEXT: Record<string, string> = {
    '영아부': '#be185d', '유아·유치부': '#b45309', '초등부': '#047857', '중고등부': '#1d4ed8',
  }

  // ── 개별 출석 수정 모달 상태 및 저장 핸들러 ──
  const [editingAttendanceUser, setEditingAttendanceUser] = useState<{
    user: UserProfile
    dateStr: string
    status: 'ATTEND' | 'ABSENT' | 'NONE'
    note: string
  } | null>(null)
  useModalDismiss(!!editingAttendanceUser, () => setEditingAttendanceUser(null))

  const [isSavingAttendance, setIsSavingAttendance] = useState(false)

  const handleSaveIndividualAttendance = async () => {
    if (!editingAttendanceUser) return
    if (isSavingAttendance) return

    const { user, dateStr, status, note } = editingAttendanceUser

    // 🐛 과거 버그: '미기록'은 그 사람의 출석 기록과 결석 사유를 되돌릴 수 없이 지우는데,
    // 출석/결석 버튼과 똑같이 생긴 채로 나란히 있었고 확인 창도 없었습니다.
    if (status === 'NONE') {
      if (!confirm(`${user.isDependent ? user.name : getUserDisplayName(user)}님의 ${dateStr} 출석 기록을 삭제할까요?\n결석 사유도 함께 지워지며 되돌릴 수 없습니다.`)) return
    }

    setIsSavingAttendance(true)
    try {
    // ── 자녀(교회학교)는 별도 표에 저장됩니다 ──
    if (user.isDependent) {
      const depId = user.id.replace(/^dep_/, '')
      if (status === 'NONE') {
        const { error } = await dbDeleteChildAttendance(depId, dateStr)
        if (error) {
          alert(`출석 기록 삭제 중 오류가 발생했습니다: ${error.message}\n다시 시도해 주세요.`)
          return
        }
      } else {
        const { error } = await dbSaveChildAttendanceRecords([{
          dependentId: depId,
          childName: user.name,
          familyGroupId: user.familyGroupId,
          labriId: user.childLabriId || '미지정',
          dateStr,
          status,
          note: status === 'ABSENT' ? note : '',
          recordedBy: currentUser?.id
        }])
        if (error) {
          alert(`출석 정보 저장 중 오류가 발생했습니다: ${error.message}\n다시 시도해 주세요.`)
          return
        }
      }
      refetchChildAttendance()
      setEditingAttendanceUser(null)
      showToast(status === 'NONE'
        ? `${user.name}의 ${dateStr} 출석 기록을 삭제했습니다.`
        : `✅ ${user.name}의 ${dateStr} 출석 정보가 수정되었습니다.`)
      return
    }

    if (status === 'NONE') {
      // 출석 기록 삭제 (미기록 처리)
      const { error } = await supabase
        .from('attendance_records')
        .delete()
        .eq('date_str', dateStr)
        .eq('user_id', user.id)
      if (error) {
        alert(`출석 기록 삭제 중 오류가 발생했습니다: ${error.message}\n다시 시도해 주세요.`)
        return
      }
    } else {
      // 출석/결석 기록 저장 (덮어쓰기)
      const { error } = await dbSaveAttendanceRecords([{
        userId: user.id,
        dateStr: dateStr,
        labriId: user.labriId || '미정',
        status: status,
        note: status === 'ABSENT' ? note : '',
        recordedBy: currentUser?.id
      }])
      if (error) {
        alert(`출석 정보 저장 중 오류가 발생했습니다: ${error.message}\n다시 시도해 주세요.`)
        return
      }
    }

    loadAttendanceStats()
    setEditingAttendanceUser(null)
    showToast(status === 'NONE'
      ? `${getUserDisplayName(user)}의 ${dateStr} 출석 기록을 삭제했습니다.`
      : `✅ ${getUserDisplayName(user)}의 ${dateStr} 출석 정보가 수정되었습니다.`)
    } finally {
      setIsSavingAttendance(false)
    }
  }

  // 🔒 CSV 필드 이스케이프: 쉼표/따옴표/줄바꿈이 포함된 값을 안전하게 감싸고,
  // 이름/비고 등 사용자 입력값이 '=', '+', '-', '@'로 시작해도 엑셀에서 수식으로
  // 실행되지 않도록(CSV 인젝션 방지) 앞에 작은따옴표를 붙여 문자열로 고정합니다.
  const csvField = (value: string | number | undefined | null): string => {
    let s = String(value ?? '')
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
    return s
  }

  const handleDownloadCSV = () => {
    const monthData = combinedMonthData
    let csv = '날짜,성도명,소속라브리,출석여부,결석사유\n'
    Object.entries(monthData).sort().forEach(([date, records]) => {
      records.forEach((rec: { userId: string; status: string; note: string }) => {
        const u = allUsers.find(u => u.id === rec.userId)
        if (u) {
          const row = [
            date,
            `${u.name} ${u.duty}`,
            u.labriId || '라브리 미정',
            rec.status === 'ATTEND' ? '출석' : '결석',
            rec.note || ''
          ].map(csvField)
          csv += row.join(',') + '\n'
        }
      })
    })
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    // 파일명에도 기간을 넣어, 나중에 여러 개를 받아도 구분됩니다.
    a.download = safeStart === safeEnd
      ? `더브릿지교회_출석기록_${safeStart}.csv`
      : `더브릿지교회_출석기록_${safeStart}_${safeEnd}.csv`
    a.click()
    showToast(`📥 ${rangeLabel} 출석 데이터 다운로드 시작`)
  }

  return (
    <>
      <div className="space-y-4">
        {/* ───────── 상단: 선택한 주일 하루 ───────── */}
        {!isTeacher && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-4">
          <div className="space-y-1.5">
            <h3 className="font-bold text-[12px] text-gray-900">📊 선택한 주일 출석률</h3>
            <select
              value={selectedStatsDate}
              onChange={e => setStatsDate(e.target.value)}
              className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 font-bold text-[12px] focus:outline-none"
            >
              {allSundays.length > 0
                ? [...allSundays].reverse().map(d => <option key={d} value={d}>{d}</option>)
                : <option value="">기록 없음</option>}
            </select>
          </div>
          {labriStats.rows.map(({ label, attend, total, memberCount, notRecorded }) => {
            const rate = total > 0 ? Math.round((attend / total) * 100) : 0
            const bar = BAR_COLORS[label] || '#d8dbe2'
            const textColor = TEXT_COLORS[label] || '#6b7280'
            return (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between text-[12px]">
                  <span className="font-bold text-gray-800">{label}</span>
                  {/* 아직 출석체크를 안 한 라브리는 0%가 아니라 "미기록"으로 구분해서 보여줍니다 */}
                  {notRecorded ? (
                    <span className="font-bold text-gray-400">미기록 (성도 {memberCount}명)</span>
                  ) : (
                    <span className="font-bold" style={{ color: textColor }}>{attend}/{total}명 ({rate}%)</span>
                  )}
                </div>
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                  {notRecorded ? (
                    <div className="h-full w-full bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_6px,#e5e7eb_6px,#e5e7eb_12px)]" />
                  ) : (
                    <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: bar }} />
                  )}
                </div>
              </div>
            )
          })}
          {/* 합계 행 */}
          {labriStats.rows.length > 0 && (
            <div className="pt-2 border-t border-gray-200 space-y-1.5">
              <div className="flex justify-between text-[12px]">
                <span className="font-black text-gray-900">전체 합계 <span className="font-normal text-[10px] text-gray-400">(기록된 라브리만)</span></span>
                <span className="font-black text-indigo-600">
                  {labriStats.totalAttend}/{labriStats.totalTotal}명 ({labriStats.totalTotal > 0 ? Math.round((labriStats.totalAttend / labriStats.totalTotal) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ backgroundColor: TOTAL_BAR, width: `${labriStats.totalTotal > 0 ? Math.round((labriStats.totalAttend / labriStats.totalTotal) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
        )}

        {/* 선택한 주일의 출석/결석 명단 (CSV는 아래 기간 카드에 있습니다) */}
        {!isTeacher && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
          {/* CSV 버튼은 아래 "기간 출석률" 카드로 옮겼습니다 — 받아지는 범위가 기간이라
              이 카드(선택한 주일 하루)에 있으면 어느 범위가 받아지는지 헷갈립니다. */}
          <h3 className="font-bold text-[12px] text-gray-900">{selectedStatsDate || '선택한 주일'} 출석/결석 명단</h3>
          <table className="w-full text-[12px] text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="p-2">성도명</th>
                <th className="p-2">소속</th>
                <th className="p-2 text-center">출석여부</th>
                <th className="p-2">결석사유</th>
                <th className="p-2 text-right">수정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-700">
              {sortedAttendanceRows.map(({ user, status, note, absenceStreak }) => (
                <tr key={user.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="p-2 font-bold text-gray-800">{user.name} {user.duty}</td>
                  <td className="p-2 text-gray-500">{normalizeLabriLabel(user.labriId)}</td>
                  <td className="p-2 text-center">
                    {status ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status === 'ABSENT' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {status === 'ABSENT' ? `❌ ${formatAbsenceStreak(absenceStreak)}` : '✅ 출석'}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[10px]">미기록</span>
                    )}
                  </td>
                  <td className="p-2 text-gray-500">{note || '-'}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAttendanceUser({
                          user,
                          dateStr: selectedStatsDate,
                          status: (status as 'ATTEND' | 'ABSENT') || 'NONE',
                          note: note || ''
                        })
                      }}
                      disabled={!selectedStatsDate}
                      className="px-2 py-1 bg-gray-100 hover:bg-[#335f87] hover:text-white text-gray-600 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ml-auto"
                    >
                      <Edit2 size={11} /> </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* ── 자녀(교회학교) 출석 ── */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[12px] text-gray-900">🧒 교회학교 출석</h3>
            <span className="text-[10px] text-gray-400">{rangeLabel}</span>
          </div>

          {childStats.rows.length === 0 ? (
            <p className="py-4 text-center text-[10px] text-gray-400">
              이 기간에 입력된 교회학교 출석이 없습니다.
            </p>
          ) : (
            <>
              {childStats.rows.map(({ label, attend, total }) => {
                const rate = total > 0 ? Math.round((attend / total) * 100) : 0
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="font-bold" style={{ color: CHILD_TEXT[label] }}>{label}</span>
                      <span className="font-bold text-gray-700">{attend}/{total}명 ({rate}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${rate}%`, backgroundColor: CHILD_BAR[label] }} />
                    </div>
                  </div>
                )
              })}
              <div className="pt-2 border-t border-gray-200 flex justify-between text-[12px]">
                <span className="font-black text-gray-900">교회학교 합계</span>
                <span className="font-black text-indigo-600">
                  {childStats.totalAttend}/{childStats.totalTotal}명 (
                  {childStats.totalTotal > 0 ? Math.round((childStats.totalAttend / childStats.totalTotal) * 100) : 0}%)
                </span>
              </div>
            </>
          )}
        </div>
        {/* 교회학교 명단 (선택한 주일) — 성인 명단과 같은 구성 */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
          <h3 className="font-bold text-[12px] text-gray-900">🧒 {selectedStatsDate || '선택한 주일'} 교회학교 명단</h3>

          {childRosterRows.length === 0 ? (
            <p className="py-4 text-center text-[10px] text-gray-400">
              교회학교 그룹이 지정된 자녀가 없습니다.
            </p>
          ) : (
            <table className="w-full text-[12px] text-left">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="p-2">이름</th>
                  <th className="p-2">부서</th>
                  <th className="p-2 text-center">출석여부</th>
                  <th className="p-2">결석사유</th>
                  <th className="p-2 text-right">수정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-700">
                {childRosterRows.map(row => (
                  <tr key={row.child.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="p-2 font-bold text-gray-800">{row.child.name}</td>
                    <td className="p-2 text-gray-500">{row.child.childLabriId}</td>
                    <td className="p-2 text-center">
                      {row.status ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'ABSENT' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {row.status === 'ABSENT' ? '❌ 결석' : '✅ 출석'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[10px]">미기록</span>
                      )}
                    </td>
                    <td className="p-2 text-gray-500">{row.note || '-'}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingAttendanceUser({
                          user: row.child,
                          dateStr: selectedStatsDate,
                          status: (row.status as 'ATTEND' | 'ABSENT') || 'NONE',
                          note: row.note || ''
                        })}
                        disabled={!selectedStatsDate}
                        className="px-2 py-1 bg-gray-100 hover:bg-[#335f87] hover:text-white text-gray-600 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ml-auto"
                      >
                        <Edit2 size={11} /> </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ───────── 하단: 기간 통계 ───────── */}
        <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-2xs space-y-2.5 text-[12px]">
          <h3 className="font-bold text-[12px] text-gray-900">🗓️ 기간 출석률</h3>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 font-bold block mb-1">시작일</label>
              <input
                type="date"
                value={rangeStart}
                onChange={e => setRangeStart(e.target.value)}
                className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 font-bold focus:outline-none"
              />
            </div>
            <span className="pb-2.5 text-gray-400 font-bold">~</span>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 font-bold block mb-1">종료일</label>
              <input
                type="date"
                value={rangeEnd}
                onChange={e => setRangeEnd(e.target.value)}
                className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 font-bold focus:outline-none"
              />
            </div>
          </div>

          {/* 자주 쓰는 기간을 한 번에 (기간이 길어도 전부 계산됩니다) */}
          <div className="flex gap-1.5">
            {[
              { label: '최근 주일', weeks: 0 },
              { label: '4주', weeks: 4 },
              { label: '3개월', weeks: 13 },
              { label: '6개월', weeks: 26 },
              { label: '1년', weeks: 52 },
            ].map(q => (
              <button
                key={q.label}
                onClick={() => applyQuickRange(q.weeks)}
                className="flex-1 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 transition-all"
              >
                {q.label}
              </button>
            ))}
          </div>

        </div>

        {/* 기간 출석률 결과 + CSV */}
        {!isTeacher && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-[12px] text-gray-900">기간 합산 결과</h3>
              <span className="text-[10px] text-gray-400 font-medium">
                {rangeLabel} · 기록 {rangeLabriStats.sundayCount}주일
              </span>
            </div>
            {/* CSV는 "기간" 기준으로 받아지므로 이 카드에 둡니다 */}
            <button
              onClick={handleDownloadCSV}
              title={`CSV 다운로드 (${rangeLabel})`}
              aria-label={`출석 기록 CSV 다운로드 (${rangeLabel})`}
              className="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[16px] flex items-center justify-center shadow-2xs shrink-0 active:scale-95 transition-all"
            >
              📥
            </button>
          </div>

          {rangeLabriStats.sundayCount === 0 ? (
            <p className="text-[12px] text-gray-400 py-2 text-center">이 기간에는 출석 기록이 없습니다.</p>
          ) : (
            <>
              {rangeLabriStats.rows.map(({ label, attend, total, memberCount, notRecorded }) => {
                const rate = total > 0 ? Math.round((attend / total) * 100) : 0
                const bar = BAR_COLORS[label] || '#d8dbe2'
                const textColor = TEXT_COLORS[label] || '#6b7280'
                return (
                  <div key={label} className="space-y-1.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="font-bold text-gray-800">{label}</span>
                      {notRecorded ? (
                        <span className="font-bold text-gray-400">미기록 (성도 {memberCount}명)</span>
                      ) : (
                        <span className="font-bold" style={{ color: textColor }}>{attend}/{total}회 ({rate}%)</span>
                      )}
                    </div>
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                      {notRecorded ? (
                        <div className="h-full w-full bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_6px,#e5e7eb_6px,#e5e7eb_12px)]" />
                      ) : (
                        <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: bar }} />
                      )}
                    </div>
                  </div>
                )
              })}
              {/* 교회학교 — 기간 전체 (childStats 는 이미 선택한 기간으로 계산되어 있습니다) */}
              {childStats.rows.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-500">🧒 교회학교</p>
                  {childStats.rows.map(({ label, attend, total }) => {
                    const rate = total > 0 ? Math.round((attend / total) * 100) : 0
                    return (
                      <div key={`range-${label}`} className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="font-bold" style={{ color: CHILD_TEXT[label] }}>{label}</span>
                          <span className="font-bold text-gray-700">{attend}/{total}회 ({rate}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${rate}%`, backgroundColor: CHILD_BAR[label] }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {(rangeLabriStats.rows.length > 0 || childStats.rows.length > 0) && (
                <div className="pt-2 border-t border-gray-200 space-y-1.5">
                  <div className="flex justify-between text-[12px]">
                    <span className="font-black text-gray-900">기간 합계 <span className="font-normal text-[10px] text-gray-400">(어른 + 교회학교)</span></span>
                    <span className="font-black text-indigo-600">
                      {rangeLabriStats.totalAttend + childStats.totalAttend}/{rangeLabriStats.totalTotal + childStats.totalTotal}회 ({(rangeLabriStats.totalTotal + childStats.totalTotal) > 0 ? Math.round(((rangeLabriStats.totalAttend + childStats.totalAttend) / (rangeLabriStats.totalTotal + childStats.totalTotal)) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ backgroundColor: TOTAL_BAR, width: `${(rangeLabriStats.totalTotal + childStats.totalTotal) > 0 ? Math.round(((rangeLabriStats.totalAttend + childStats.totalAttend) / (rangeLabriStats.totalTotal + childStats.totalTotal)) * 100) : 0}%` }} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        )}

      </div>

      {/* ── 개별 출석 정보 수정 모달 ── */}
      {editingAttendanceUser && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setEditingAttendanceUser(null))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-fade-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-[14px] text-gray-900">
                  ✏️ {editingAttendanceUser.user.isDependent
                        ? editingAttendanceUser.user.name
                        : getUserDisplayName(editingAttendanceUser.user)} 출석 수정
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  주일 날짜: <strong className="text-[#335f87]">{editingAttendanceUser.dateStr}</strong> ({editingAttendanceUser.user.isDependent
                    ? (editingAttendanceUser.user.childLabriId || '미지정')
                    : (editingAttendanceUser.user.labriId || '라브리 미정')})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAttendanceUser(null)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 font-bold"
              >
                <X size={16} />
              </button>
            </div>

            {/* 출석 상태 선택 (출석 / 결석 / 미기록) */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 font-bold">출석 상태 선택</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'ATTEND', label: '✅ 출석', bg: 'bg-emerald-600 text-white' },
                  { id: 'ABSENT', label: '❌ 결석', bg: 'bg-rose-600 text-white' },
                  { id: 'NONE', label: '⏳ 미기록', bg: 'bg-slate-700 text-white' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEditingAttendanceUser(prev => prev ? { ...prev, status: opt.id as any } : null)}
                    className={`py-2 rounded-xl text-[12px] font-bold transition-all border ${
                      editingAttendanceUser.status === opt.id
                        ? `${opt.bg} border-transparent shadow-xs scale-102`
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 결석일 때만 사유 입력 */}
            {editingAttendanceUser.status === 'ABSENT' && (
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <label className="text-[10px] text-gray-400 font-bold">결석 사유 (추천 태그 선택 또는 직접 입력)</label>
                <div className="flex gap-1 flex-wrap text-[10px]">
                  {['출장', '여행', '병가', '개인사정', '가족행사'].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setEditingAttendanceUser(prev => prev ? { ...prev, note: tag } : null)}
                      className={`px-2 py-1 rounded-md border transition-all ${
                        editingAttendanceUser.note === tag
                          ? 'bg-rose-100 border-rose-300 text-rose-800 font-bold'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="결석 사유를 직접 입력하세요..."
                  value={editingAttendanceUser.note}
                  onChange={e => setEditingAttendanceUser(prev => prev ? { ...prev, note: e.target.value } : null)}
                  className="w-full text-[12px] p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
                />
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditingAttendanceUser(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 text-[12px] font-bold rounded-xl hover:bg-gray-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveIndividualAttendance}
                className="flex-1 py-2.5 bg-[#335f87] text-white text-[12px] font-bold rounded-xl hover:bg-[#2b5072] shadow-xs"
              >
                출석 정보 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
