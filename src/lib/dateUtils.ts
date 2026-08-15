/**
 * 날짜 관련 동적 계산 헬퍼 함수
 */

export type SundayEntry = {
  dateStr: string
  displayStr: string
  labelStr: string
  shortLabelStr: string
  dateObj: Date
}

function buildSundayEntry(d: Date): SundayEntry {
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const date = d.getDate()

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
  const displayStr = `${month}/${date}(일)`
  const labelStr = `${year}년 ${month}월 ${date}일(일) 주일 예배`
  const shortLabelStr = `${month}월 ${date}일(일)`

  return { dateStr, displayStr, labelStr, shortLabelStr, dateObj: d }
}

// 매주 월요일을 기준으로 해당 주~향후 주의 일요일 날짜 리스트 생성
export function getUpcomingSundays(count = 4): SundayEntry[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const day = today.getDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1

  const mondayOfWeek = new Date(today)
  mondayOfWeek.setDate(today.getDate() - daysSinceMonday)

  const firstSunday = new Date(mondayOfWeek)
  firstSunday.setDate(mondayOfWeek.getDate() + 6)
  firstSunday.setHours(0, 0, 0, 0)

  const sundays: SundayEntry[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(firstSunday)
    d.setDate(firstSunday.getDate() + i * 7)
    sundays.push(buildSundayEntry(d))
  }

  return sundays
}

// 오늘 기준 가장 최근(오늘 포함 과거) 일요일 구하기 (offsetWeeks: 0=최근, -1=1주 전, -2=2주 전...)
export function getMostRecentSunday(offsetWeeks = 0): SundayEntry {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = today.getDay() // 0: Sun, 1: Mon, ...

  // 오늘이 일요일이면 오늘, 아니면 직전 일요일
  const recentSunday = new Date(today)
  recentSunday.setDate(today.getDate() - day)

  // 과거 주차 이동 (미래는 0으로 제한)
  const safeOffset = Math.min(0, offsetWeeks)
  recentSunday.setDate(recentSunday.getDate() + safeOffset * 7)
  recentSunday.setHours(0, 0, 0, 0)

  return buildSundayEntry(recentSunday)
}

// 특정 주일(일요일)의 식사 신청 마감 여부 체크 (해당 일요일 직전 토요일 14:00 마감)
export function isMealRegistrationLocked(sundayDateObj: Date): { isLocked: boolean; remainingText: string } {
  const now = new Date()
  
  // 토요일 14:00 마감 타임스탬프 계산 (일요일 - 1일 14시)
  const deadline = new Date(sundayDateObj)
  deadline.setDate(sundayDateObj.getDate() - 1)
  deadline.setHours(14, 0, 0, 0)
  
  if (now >= deadline) {
    return { isLocked: true, remainingText: '신청 마감' }
  }
  
  // 남아있는 시간 계산
  const diffMs = deadline.getTime() - now.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  const remHours = diffHours % 24
  
  let remainingText = ''
  if (diffDays > 0) {
    remainingText = `토 14시 마감 (D-${diffDays})`
  } else {
    remainingText = `마감까지 ${remHours}시간 남음`
  }
  
  return { isLocked: false, remainingText }
}

// 최근 N개 월 리스트 (YYYY-MM 형식)
export function getRecentMonths(count = 3) {
  const months: { value: string; label: string }[] = []
  const today = new Date()
  
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const value = `${year}-${String(month).padStart(2, '0')}`
    const label = `${month}월`
    months.push({ value, label })
  }
  
  return months
}
