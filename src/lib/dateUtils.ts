/**
 * 날짜 관련 동적 계산 헬퍼 함수
 */

// ────────────────────────────────────────────────────────────────
// 표시용 날짜 변환
//
// ⚠️ 주의: `new Date().toISOString().slice(0,10)` 은 세계표준시(UTC) 기준입니다.
// 한국(UTC+9)/베트남(UTC+7)에서는 새벽에 쓴 글이 "어제" 날짜로 표시되는 문제가
// 생기므로, 화면에 보여줄 날짜는 반드시 아래 toLocalDateStr()를 쓰세요.
// ────────────────────────────────────────────────────────────────

/** Date 또는 ISO 문자열을 사용자의 현지 시간대 기준 'YYYY-MM-DD' 로 변환 */
export function toLocalDateStr(input?: string | Date | null): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) {
    // 파싱 실패 시(예: 이미 'YYYY-MM-DD' 형태) 앞 10글자만 그대로 사용
    return typeof input === 'string' ? input.slice(0, 10) : ''
  }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

/** 오늘 날짜를 현지 기준 'YYYY-MM-DD' 로 */
export function todayLocalDateStr(): string {
  return toLocalDateStr(new Date())
}

// ────────────────────────────────────────────────────────────────
// 주보 날짜
//
// 🐛 과거 버그: 주보 날짜를 "8/17(일)" 같은 표시용 문자열로 저장하고 그걸
// 문자 정렬해서 최신 주보를 골랐습니다. 문자 정렬은 "9/28(일)" > "10/5(일)"
// 이므로 10월이 되면 9월 주보에서 화면이 멈춥니다.
// → 이제는 'YYYY-MM-DD' 로 저장하고, 화면에 보여줄 때만 "8/17(일)"로 바꿉니다.
//   구버전 데이터도 계속 읽을 수 있도록 두 형식을 모두 해석합니다.
// ────────────────────────────────────────────────────────────────

/** 저장된 주보 날짜(신형 'YYYY-MM-DD' 또는 구형 '8/17(일)')를 정렬 가능한 'YYYY-MM-DD'로 */
export function bulletinDateToSortable(raw?: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()

  // 신형: 2026-08-17
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }

  // 구형: 8/17(일)  — 연도 정보가 없어서 추정해야 합니다.
  // 오늘보다 6개월 이상 미래로 계산되면 작년 것으로 봅니다(연말/연초 경계 대응).
  const legacy = trimmed.match(/^(\d{1,2})\/(\d{1,2})/)
  if (legacy) {
    const month = Number(legacy[1])
    const date = Number(legacy[2])
    const now = new Date()
    let year = now.getFullYear()
    const candidate = new Date(year, month - 1, date)
    const sixMonthsMs = 1000 * 60 * 60 * 24 * 183
    if (candidate.getTime() - now.getTime() > sixMonthsMs) year -= 1
    return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
  }

  return ''
}

/** 저장된 주보 날짜를 화면 표시용 '8/17(일)' 형태로 */
export function formatBulletinDisplay(raw?: string | null): string {
  if (!raw) return ''
  const sortable = bulletinDateToSortable(raw)
  if (!sortable) return raw
  const [, m, d] = sortable.split('-')
  return `${Number(m)}/${Number(d)}(일)`
}

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

// ── 생일 파싱/표시 헬퍼 ──
// 관리자/부모가 생일을 다양한 형식으로 입력할 수 있어(20230909, 2023-09-09, 2023/09/09,
// 230909, 08-15 등) 관대하게 파싱해서 화면에는 항상 "YYYY년 M월 D일"(연도 모르면 "M월 D일")로,
// 달력 매칭용으로는 "MM-DD"로 정규화합니다.
export interface ParsedBirthday {
  year: number | null
  month: number
  day: number
}

/** 해당 연/월에 실제로 존재하는 날짜 수. 연도를 모르면 윤년(2000)을 기준으로 해서 2월 29일을 허용합니다. */
export function daysInMonth(year: number | null, month: number): number {
  return new Date(year ?? 2000, month, 0).getDate()
}

function isValidBirthdayParts(year: number | null, month: number, day: number): boolean {
  if (!Number.isFinite(month) || !Number.isFinite(day)) return false
  if (month < 1 || month > 12) return false
  // 🐛 과거 버그: day를 1~31로만 검사해서 2월 31일, 4월 31일 같은 값이 "정상"으로 저장됐습니다.
  // 그런 생일은 달력에 실제로 존재하지 않는 날이라 🎂 표시가 영영 안 뜨는데,
  // 주소록에는 "4월 31일"로 멀쩡히 보여서 원인을 찾기 어려웠습니다.
  if (day < 1 || day > daysInMonth(year, month)) return false
  if (year !== null && (year < 1900 || year > 2100)) return false
  return true
}

export function parseBirthdayFlexible(raw?: string | null): ParsedBirthday | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // 구분자가 있는 경우: 2023-09-09 / 2023/09/09 / 09-09 (연도 없음) / 09-09-2023
  const sepParts = trimmed.split(/[-./]/).map(p => p.trim()).filter(Boolean)
  if (sepParts.length === 3) {
    const [a, b, c] = sepParts
    if (a.length === 4) {
      const year = parseInt(a, 10)
      const month = parseInt(b, 10)
      const day = parseInt(c, 10)
      if (isValidBirthdayParts(year, month, day)) return { year, month, day }
    } else if (c.length === 4) {
      const month = parseInt(a, 10)
      const day = parseInt(b, 10)
      const year = parseInt(c, 10)
      if (isValidBirthdayParts(year, month, day)) return { year, month, day }
    }
  } else if (sepParts.length === 2) {
    const month = parseInt(sepParts[0], 10)
    const day = parseInt(sepParts[1], 10)
    if (isValidBirthdayParts(null, month, day)) return { year: null, month, day }
  }

  // 구분자 없이 숫자만: 20230909 / 230909 / 0915
  const digits = trimmed.replace(/[^0-9]/g, '')
  if (digits.length === 8) {
    const year = parseInt(digits.slice(0, 4), 10)
    const month = parseInt(digits.slice(4, 6), 10)
    const day = parseInt(digits.slice(6, 8), 10)
    if (isValidBirthdayParts(year, month, day)) return { year, month, day }
  } else if (digits.length === 6) {
    const yy = parseInt(digits.slice(0, 2), 10)
    const month = parseInt(digits.slice(2, 4), 10)
    const day = parseInt(digits.slice(4, 6), 10)
    const year = yy <= 30 ? 2000 + yy : 1900 + yy
    if (isValidBirthdayParts(year, month, day)) return { year, month, day }
  } else if (digits.length === 4) {
    const month = parseInt(digits.slice(0, 2), 10)
    const day = parseInt(digits.slice(2, 4), 10)
    if (isValidBirthdayParts(null, month, day)) return { year: null, month, day }
  }

  return null
}

// 화면 표시용: "2023년 9월 9일" (연도를 모르면 "9월 9일"). 파싱 실패 시 원본 문자열 그대로 반환.
export function formatBirthdayDisplay(raw?: string | null): string {
  if (!raw) return ''
  const parsed = parseBirthdayFlexible(raw)
  if (!parsed) return raw
  return parsed.year
    ? `${parsed.year}년 ${parsed.month}월 ${parsed.day}일`
    : `${parsed.month}월 ${parsed.day}일`
}

// 달력/이달의 생일 매칭용: "MM-DD" 정규화. 파싱 실패 시 null.
export function getBirthdayMonthDay(raw?: string | null): string | null {
  const parsed = parseBirthdayFlexible(raw)
  if (!parsed) return null
  return `${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`
}

/**
 * 달력의 특정 날짜(year/month/day)가 이 생일에 해당하는지 판정.
 *
 * 🐛 과거 버그: 2월 29일생 성도는 평년(2월이 28일까지)에는 달력에 🎂가 영영 안 떴습니다.
 * "이달의 생일" 목록에는 2월로 뜨는데 달력에는 없어서 누락된 것처럼 보였습니다.
 * → 평년에는 2월 28일에 표시되도록 접어서 매칭합니다.
 */
export function birthdayMatchesCalendarDay(
  raw: string | null | undefined,
  year: number,
  month: number, // 1~12
  day: number
): boolean {
  const parsed = parseBirthdayFlexible(raw)
  if (!parsed) return false
  if (parsed.month !== month) return false
  if (parsed.day === day) return true

  // 2월 29일생 → 평년에는 2월 말일(28일)에 표시
  const lastDayOfThisMonth = daysInMonth(year, month)
  if (parsed.day > lastDayOfThisMonth && day === lastDayOfThisMonth) return true

  return false
}

// 만 나이 계산 (생일에 연도 정보가 없으면 계산 불가 → null)
export function calculateAge(raw?: string | null): number | null {
  const parsed = parseBirthdayFlexible(raw)
  if (!parsed || parsed.year === null) return null
  const today = new Date()
  let age = today.getFullYear() - parsed.year
  const hasHadBirthdayThisYear =
    (today.getMonth() + 1 > parsed.month) ||
    (today.getMonth() + 1 === parsed.month && today.getDate() >= parsed.day)
  if (!hasHadBirthdayThisYear) age -= 1
  return age >= 0 ? age : null
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

/**
 * '2026-08-18T21:30:00Z' → '8/18 21:30' (보는 사람의 시간대 기준)
 * 식사 신청의 "최종 수정" 시각처럼, 날짜와 시각을 짧게 보여줄 때 씁니다.
 */
export function formatDateTimeShort(input?: string | Date | null): string {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return ''
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}
