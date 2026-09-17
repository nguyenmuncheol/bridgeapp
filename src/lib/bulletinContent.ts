/**
 * 주보 본문(structured content) 타입과 정규화.
 *
 * public/bulletin.html 의 `const 주보 = {...}` 객체와 **같은 모양**입니다.
 * 그 파일은 디자인 원본이고, 이 타입은 그것을 DB(bulletins.content jsonb)와
 * 화면(BulletinView)에서 쓰기 위한 표현입니다.
 *
 * DB에서 오는 값은 jsonb 라 무엇이든 들어올 수 있습니다. 화면이 터지지 않도록
 * 렌더링 전에 반드시 normalizeBulletinContent() 를 통과시키세요.
 */

export interface BulletinOrderItem {
  /** 순서 이름 (예: '묵    도') — 글자 사이 공백으로 폭을 맞춥니다 */
  item: string
  /**
   * 가운데에 크게 넣을 글. 설교 제목처럼 강조할 것이 있을 때만 씁니다.
   * 예) 성경봉독의 '요한복음 3:1-12'.
   *
   * undefined 면 보통 줄, 문자열(빈 문자열 포함)이면 강조 줄입니다.
   * 관리자 화면에서 [강조 순서 추가] 로 만든 줄만 이 칸을 갖습니다.
   */
  center?: string
  /** 담당 (예: '다같이', '홍길동 집사') */
  by: string
}

export interface BulletinNewsItem {
  title: string
  /** 여러 줄은 \n 으로 구분합니다. */
  body: string
}

export interface BulletinVerse {
  /** 절 번호. 없으면 배열 순서대로 1,2,3… 이 매겨집니다. */
  n: number
  t: string
}

export interface BulletinServingMonth {
  /**
   * 이 표가 어느 달인지. 'YYYY-MM' 형식입니다.
   * 주일 날짜(8/30, 9/6 …)를 뽑아내는 근거라서, 달 이름만 글자로 두면 안 됩니다.
   */
  ym: string
  /** 머리행 (예: ['9월', '대표기도', '식사 섬김']) */
  head: string[]
  /** 각 줄 (예: ['9/6', '홍길동 집사', '라브리1']) */
  rows: string[][]
}

/** 섬김표 각 칸의 열 번호 */
export const SERVING_DATE_COL = 0
export const SERVING_PRAYER_COL = 1
export const SERVING_MEAL_COL = 2

/** 식사 섬김은 라브리 세 곳이 돌아가며 맡습니다 */
export const MEAL_OPTIONS = ['라브리1', '라브리2', '라브리3']

/** 예전 표기('1라브리')를 지금 표기('라브리1')로 옮깁니다 */
const MEAL_LEGACY: Record<string, string> = {
  '1라브리': '라브리1',
  '2라브리': '라브리2',
  '3라브리': '라브리3',
}

/**
 * 대표기도자 지정 — 섬김표의 "대표기도" 칸에 들어간 사람을 **계정과 연결**합니다.
 *
 * 표에는 이름만 글자로 찍히지만, 여기에 userId 를 함께 남겨 두면
 * "이번 달 대표기도 맡으신 분들께 알림 보내기" 를 할 수 있습니다.
 * 사람을 고르지 않고 이름만 직접 타이핑한 칸은 여기에 들어오지 않습니다(알림 대상 아님).
 */
export interface BulletinPrayerAssignment {
  /** servingMonths 의 몇 번째 달인지 */
  monthIndex: number
  /** 그 달의 몇 번째 주차 줄인지 */
  rowIndex: number
  userId: string
  /** 표에 찍히는 이름 (계정 이름이 바뀌어도 그 주 주보는 그대로 두기 위해 함께 보관) */
  name: string
  /** 이 사람에게 마지막으로 알림을 보낸 시각(ISO). 같은 사람에게 두 번 보내는 것을 막습니다. */
  notifiedAt?: string
}

export interface BulletinSermon {
  /** 예배 순서 목록에 들어가는 이름 */
  label: string
  /** 설교자 */
  by: string
  /** 파란 박스 가운데 제목 */
  title: string
  /** 제목 아래 작은 줄. 비우면 표시되지 않습니다. */
  sub: string
}

export interface BulletinContent {
  churchName: string

  // 1쪽 · 표지
  date: string
  dateSub: string
  orderPre: BulletinOrderItem[]
  sermon: BulletinSermon
  orderPost: BulletinOrderItem[]

  // 2쪽 · 소식
  churchNewsLabel: string
  churchNews: BulletinNewsItem[]
  memberNewsLabel: string
  memberNews: BulletinNewsItem[]

  // 3쪽 · 성경말씀
  scriptureLabel: string
  scriptureRef: string
  verses: BulletinVerse[]

  // 4쪽 · 목회칼럼 · 섬김 · 공지 · 헌금
  messageLabel: string
  messageTitle: string
  messageBody: string
  servingTitle: string
  servingMonths: BulletinServingMonth[]
  /** 섬김표 대표기도 칸과 성도 계정의 연결 (알림 발송 대상) */
  prayerAssignments: BulletinPrayerAssignment[]
  noticeTitle: string
  notices: string[]
  offeringLabel: string
  offeringLines: string[]
  offeringQr: string
}

/**
 * 성경 본문 아래 메모 칸의 제목.
 *
 * 🐛 예전에는 이 값을 주보마다 content 에 넣어 저장했습니다. 그런데 이것을 고칠
 *    입력칸이 관리자 화면에 없습니다. 그래서 '묵상 메모' 시절에 저장된 주보는
 *    이름을 '설교 메모' 로 바꾼 뒤에도 영영 옛 이름을 달고 나왔습니다
 *    (화면에서도, 인쇄본에서도).
 * → 주보마다 다를 이유가 없는 값이므로 고정값으로 옮깁니다. 저장된 옛 값은
 *   무시되므로 지난 주보를 하나하나 다시 저장할 필요가 없습니다.
 */
export const MEMO_LABEL = '설교 메모'

/**
 * 헌금 계좌 — 메인 화면 "온라인 헌금 안내"(HomeTab)에 적힌 것과 같은 계좌입니다.
 * QR 이미지는 따로 받아 offeringQr 에 넣습니다.
 */
export const OFFERING_ACCOUNT_LINES = [
  '우리은행 100-100-299053',
  '예금주: LIMHYEYOUNG(임혜영)',
]

/**
 * 헌금 계좌 QR (우리은행 WON) — public/ 에 둔 파일을 가리킵니다.
 * 파일이 없으면 주보에는 'QR' 글자만 나오고 깨진 그림은 보이지 않습니다.
 */
export const OFFERING_QR_SRC = '/offering-qr.png'

/** 새 주보를 만들 때의 기본값. 매주 바뀌지 않는 항목은 미리 채워 둡니다. */
export const EMPTY_BULLETIN_CONTENT: BulletinContent = {
  churchName: 'THE BRIDGE CHURCH · HANOI',

  date: '',
  dateSub: '주일예배 · 오전 11:00',
  orderPre: [
    { item: '묵    도', by: '다같이' },
    { item: '찬    송', by: '' },
    { item: '신앙고백', by: '다같이' },
    { item: '기    도', by: '' },
    { item: '성경봉독', center: '', by: '' },
    { item: '찬    양', by: '찬양팀' },
  ],
  sermon: { label: '설    교', by: '', title: '', sub: '' },
  orderPost: [
    { item: '봉헌찬송', by: '다같이' },
    { item: '봉헌기도', by: '' },
    { item: '광    고', by: '인도자' },
    { item: '축    도', by: '' },
  ],

  churchNewsLabel: '교회소식',
  churchNews: [],
  memberNewsLabel: '교우소식',
  memberNews: [],

  scriptureLabel: '성경말씀',
  scriptureRef: '',
  verses: [],

  messageLabel: 'MESSAGE',
  messageTitle: '',
  messageBody: '',
  servingTitle: '기도 및 식사 섬김',
  servingMonths: [],
  prayerAssignments: [],
  noticeTitle: '공지 사항',
  notices: [],
  offeringLabel: '헌금 계좌',
  // 메인 화면(HomeTab "온라인 헌금 안내")과 같은 계좌입니다. 둘 중 하나만 바뀌면
  // 성도가 서로 다른 계좌를 보게 되므로, 계좌가 바뀌면 두 곳을 함께 고쳐야 합니다.
  offeringLines: OFFERING_ACCOUNT_LINES,
  offeringQr: OFFERING_QR_SRC,
}

// ── 아래는 jsonb → 타입 변환용 도우미들 ─────────────────────────────────

type Unknown = Record<string, unknown>

const asObj = (v: unknown): Unknown => (v && typeof v === 'object' && !Array.isArray(v) ? v as Unknown : {})
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asStr = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

const asOrderList = (v: unknown, fallback: BulletinOrderItem[]): BulletinOrderItem[] => {
  const arr = asArr(v)
  if (arr.length === 0) return fallback
  return arr.map(raw => {
    const o = asObj(raw)
    // center 는 '있고 없고' 를 구분해야 합니다. 없으면 보통 줄, 빈 문자열이면
    // 강조 줄이되 아직 안 채운 상태입니다. 그래서 asStr 로 뭉개지 않습니다.
    return {
      item: asStr(o.item),
      ...(typeof o.center === 'string' ? { center: o.center } : {}),
      by: asStr(o.by),
    }
  })
}

const asNewsList = (v: unknown): BulletinNewsItem[] =>
  asArr(v).map(raw => {
    const o = asObj(raw)
    return { title: asStr(o.title), body: asStr(o.body) }
  })

/**
 * 절 배열을 정규화합니다.
 * 문자열 배열(['바리새인 중에…', …])과 객체 배열([{n:1,t:'…'}, …])을 모두 받습니다.
 * 번호가 없으면 순서대로 1부터 매깁니다.
 */
const asVerses = (v: unknown): BulletinVerse[] =>
  asArr(v).map((raw, i) => {
    if (typeof raw === 'string') return { n: i + 1, t: raw }
    const o = asObj(raw)
    const n = typeof o.n === 'number' ? o.n : Number(o.n)
    return { n: Number.isFinite(n) && n > 0 ? n : i + 1, t: asStr(o.t) }
  })

const asServingMonths = (v: unknown): BulletinServingMonth[] =>
  asArr(v).map(raw => {
    const o = asObj(raw)
    return {
      ym: asStr(o.ym),
      head: asArr(o.head).map(h => asStr(h)),
      // 식사 섬김 칸은 옛 표기('1라브리')를 지금 표기('라브리1')로 바꿔 줍니다.
      rows: asArr(o.rows).map(r => asArr(r).map((c, i) => {
        const cell = asStr(c)
        return i === SERVING_MEAL_COL ? (MEAL_LEGACY[cell] || cell) : cell
      })),
    }
  })

const asStrList = (v: unknown): string[] => asArr(v).map(s => asStr(s))

const asPrayerAssignments = (v: unknown): BulletinPrayerAssignment[] =>
  asArr(v).flatMap(raw => {
    const o = asObj(raw)
    const userId = asStr(o.userId)
    if (!userId) return []          // 계정과 연결되지 않은 칸은 알림 대상이 아닙니다
    const mi = Number(o.monthIndex)
    const ri = Number(o.rowIndex)
    return [{
      monthIndex: Number.isFinite(mi) ? mi : 0,
      rowIndex: Number.isFinite(ri) ? ri : 0,
      userId,
      name: asStr(o.name),
      notifiedAt: asStr(o.notifiedAt) || undefined,
    }]
  })

/**
 * DB의 jsonb(무엇이든 들어올 수 있음)를 안전한 BulletinContent 로 바꿉니다.
 * 빠진 항목은 EMPTY_BULLETIN_CONTENT 의 값으로 채워집니다.
 *
 * 화면에 그리기 전에는 **반드시** 이 함수를 거치세요. content 가 null 이거나
 * 옛 형식이어도 빈 주보로 그려질 뿐 터지지 않습니다.
 */
export function normalizeBulletinContent(raw: unknown): BulletinContent {
  const c = asObj(raw)
  const d = EMPTY_BULLETIN_CONTENT
  const sermon = asObj(c.sermon)

  return {
    churchName: asStr(c.churchName, d.churchName),

    date:      asStr(c.date, d.date),
    dateSub:   asStr(c.dateSub, d.dateSub),
    orderPre:  asOrderList(c.orderPre, d.orderPre),
    sermon: {
      label: asStr(sermon.label, d.sermon.label),
      by:    asStr(sermon.by),
      title: asStr(sermon.title),
      sub:   asStr(sermon.sub),
    },
    orderPost: asOrderList(c.orderPost, d.orderPost),

    churchNewsLabel: asStr(c.churchNewsLabel, d.churchNewsLabel),
    churchNews:      asNewsList(c.churchNews),
    memberNewsLabel: asStr(c.memberNewsLabel, d.memberNewsLabel),
    memberNews:      asNewsList(c.memberNews),

    scriptureLabel: asStr(c.scriptureLabel, d.scriptureLabel),
    scriptureRef:   asStr(c.scriptureRef),
    verses:         asVerses(c.verses),

    messageLabel:  asStr(c.messageLabel, d.messageLabel),
    messageTitle:  asStr(c.messageTitle),
    messageBody:   asStr(c.messageBody),
    servingTitle:  asStr(c.servingTitle, d.servingTitle),
    servingMonths: asServingMonths(c.servingMonths),
    prayerAssignments: asPrayerAssignments(c.prayerAssignments),
    noticeTitle:   asStr(c.noticeTitle, d.noticeTitle),
    notices:       asStrList(c.notices),
    offeringLabel: asStr(c.offeringLabel, d.offeringLabel),
    offeringLines: asStrList(c.offeringLines),
    offeringQr:    asStr(c.offeringQr),
  }
}

/** content 에 사람이 읽을 내용이 하나라도 들어 있는지. 빈 껍데기 주보를 거르는 데 씁니다. */
export function isBulletinContentFilled(c: BulletinContent | null | undefined): boolean {
  if (!c) return false
  return Boolean(
    c.sermon.title.trim() ||
    c.messageTitle.trim() ||
    c.messageBody.trim() ||
    c.scriptureRef.trim() ||
    c.verses.length > 0 ||
    c.churchNews.length > 0 ||
    c.memberNews.length > 0 ||
    c.notices.length > 0
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  편집 도우미 — 관리자 주보 탭이 씁니다
// ══════════════════════════════════════════════════════════════════════════

/**
 * 성경 본문을 통째로 붙여넣으면 절 단위로 잘라 줍니다.
 *
 * 12절을 한 칸씩 타이핑하게 두면 아무도 안 씁니다. 성경 사이트에서 복사해
 * 붙여넣는 것이 실제 작업 흐름이므로, 거기서 흔히 나오는 두 가지 모양을 받습니다.
 *
 *   1) 절 번호가 붙어 있는 경우  "1 바리새인 중에… 2 그가 밤에…"
 *      → 번호를 기준으로 자르고 그 번호를 그대로 씁니다. 줄바꿈이 없어도 됩니다.
 *   2) 번호가 없는 경우          한 줄에 한 절
 *      → 줄 단위로 자르고 1부터 번호를 매깁니다.
 */
/**
 * 성경 사이트에서 복사해 오면 본문에 주석 기호가 딸려옵니다.
 *
 *   "…주가 쓰시겠다 하라 1)그리하면 즉시…"   ← 난외주 번호
 *   "ㄱ)시온 딸에게 이르기를…"                 ← 관주(다른 구절 참조)
 *
 * 주보에 실을 본문에는 필요 없으므로 떼어 냅니다. 숫자나 한글 자음(ㄱ~ㅎ)에
 * 닫는 괄호가 붙은 것만 지웁니다. "(요한복음)" 처럼 한글 음절로 끝나는 괄호는
 * 건드리지 않습니다 — 본문 안의 정상적인 괄호까지 지워 버리면 안 되니까요.
 */
function stripVerseAnnotations(t: string): string {
  return t
    .replace(/\(?(?:\d{1,3}|[ㄱ-ㅎ])\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function parseVersesFromText(raw: string): BulletinVerse[] {
  const text = (raw || '').trim()
  if (!text) return []

  // 1) "숫자 + 공백" 으로 시작하는 덩어리가 2개 이상이면 번호가 붙은 본문으로 봅니다.
  //    (줄 맨 앞이거나 공백 뒤에 오는 숫자만 절 번호로 인정합니다. 본문 중간의
  //     "3:16" 같은 숫자에 걸리지 않도록 뒤에 콜론이 오는 경우는 제외합니다.)
  const numbered = [...text.matchAll(/(?:^|\s)(\d{1,3})(?![:\d])[.\s]\s*/g)]
  if (numbered.length >= 2) {
    const out: BulletinVerse[] = []
    numbered.forEach((m, i) => {
      const start = (m.index ?? 0) + m[0].length
      const end = i + 1 < numbered.length ? (numbered[i + 1].index ?? text.length) : text.length
      const t = stripVerseAnnotations(text.slice(start, end).replace(/\s+/g, ' '))
      if (t) out.push({ n: Number(m[1]), t })
    })
    if (out.length > 0) return out
  }

  // 2) 줄 단위
  return text
    .split('\n')
    .map(l => stripVerseAnnotations(l.replace(/\s+/g, ' ')))
    .filter(Boolean)
    .map((t, i) => ({ n: i + 1, t }))
}

/** 'YYYY-MM' 을 연·월로 풉니다. 형식이 아니면 null */
function parseYm(ym: string): { year: number; month0: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '')
  if (!m) return null
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year: Number(m[1]), month0: month - 1 }
}

/** 그 달의 주일 날짜들 (네 번인 달도, 다섯 번인 달도 있습니다) */
export function sundaysOfMonth(ym: string): Date[] {
  const p = parseYm(ym)
  if (!p) return []
  const out: Date[] = []
  const lastDay = new Date(p.year, p.month0 + 1, 0).getDate()
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(p.year, p.month0, d)
    if (dt.getDay() === 0) out.push(dt)
  }
  return out
}

/** 섬김표에 찍히는 날짜 표기 — 8/30, 9/6 */
export function formatServingDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 'YYYY-MM-DD' 주일 기준 offset 달 뒤의 'YYYY-MM' (12월 다음은 이듬해 1월) */
export function ymOf(dateStr: string, offset = 0): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  const now = new Date()
  const baseYear = m ? Number(m[1]) : now.getFullYear()
  const baseMonth = m ? Number(m[2]) : now.getMonth() + 1   // 1~12
  const t = baseMonth - 1 + offset
  const year = baseYear + Math.floor(t / 12)
  const month0 = ((t % 12) + 12) % 12
  return `${year}-${String(month0 + 1).padStart(2, '0')}`
}

/**
 * 한 달치 섬김표를 만듭니다. 줄은 그 달의 **실제 주일 날짜**로 깔립니다.
 *
 * keep 을 주면 이미 적어 둔 대표기도·식사 섬김을 줄 순서대로 이어받습니다.
 * 달을 잘못 골랐다가 바로잡을 때 입력한 내용이 통째로 날아가지 않게 하려는 것입니다.
 */
export function makeServingMonth(ym: string, keep?: string[][]): BulletinServingMonth {
  const p = parseYm(ym)
  return {
    ym,
    head: [p ? `${p.month0 + 1}월` : '', '대표기도', '식사 섬김'],
    rows: sundaysOfMonth(ym).map((d, i) => [
      formatServingDate(d),
      keep?.[i]?.[SERVING_PRAYER_COL] || '',
      keep?.[i]?.[SERVING_MEAL_COL] || '',
    ]),
  }
}

/** 표에 줄을 하나 더할 때 쓸 다음 주일 날짜 */
export function nextServingDate(ym: string, rowCount: number): string {
  const sundays = sundaysOfMonth(ym)
  if (rowCount < sundays.length) return formatServingDate(sundays[rowCount])
  if (sundays.length === 0) return ''
  // 그 달의 주일을 다 쓴 뒤에는 다음 주(7일 뒤)로 이어 갑니다
  const d = new Date(sundays[sundays.length - 1])
  d.setDate(d.getDate() + 7 * (rowCount - sundays.length + 1))
  return formatServingDate(d)
}

/** 'YYYY-MM-DD' 주일을 기준으로 섬김표 두 달치(이번 달 + 다음 달)를 만듭니다. */
export function buildServingMonths(dateStr: string): BulletinServingMonth[] {
  return [0, 1].map(offset => makeServingMonth(ymOf(dateStr, offset)))
}

/**
 * 섬김표에서 이 주일에 배정된 대표기도자 이름. 배정이 없으면 빈 문자열.
 *
 * 'YYYY-MM-DD' 를 표의 ym('YYYY-MM')과 줄 이름('9/20')으로 바꿔 찾습니다.
 */
export function prayerLeaderForDate(months: BulletinServingMonth[], dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  if (!m) return ''
  const month = months.find(x => x.ym === `${m[1]}-${m[2]}`)
  if (!month) return ''
  const label = `${Number(m[2])}/${Number(m[3])}`
  const row = month.rows.find(r => (r[SERVING_DATE_COL] || '').trim() === label)
  return (row?.[SERVING_PRAYER_COL] || '').trim()
}

/**
 * 예배 순서의 '기도' 줄 담당자를 대표기도자 이름으로 채웁니다.
 *
 * 섬김표에 누구를 배정했으면 예배 순서에도 같은 이름이 들어가야 합니다. 두 곳에
 * 따로 적게 두면 한쪽만 고치고 지나가기 쉽습니다 — 실제로 헌금 계좌에서 그렇게
 * 어긋났던 적이 있습니다.
 *
 * '기도'/'대표기도' 와 정확히 같은 이름의 줄만 찾습니다('봉헌기도' 는 걸리지
 * 않습니다). 바꿀 것이 없으면 null 을 돌려줍니다.
 */
export function applyPrayerLeaderToOrder(
  order: BulletinOrderItem[],
  name: string
): BulletinOrderItem[] | null {
  if (!name) return null
  const i = order.findIndex(o => {
    const key = o.item.replace(/\s+/g, '')
    return key === '기도' || key === '대표기도'
  })
  if (i < 0 || order[i].by === name) return null
  return order.map((o, j) => (j === i ? { ...o, by: name } : o))
}

/** 섬김표가 이 주보의 달(이번 달 + 다음 달)을 이미 담고 있는지 */
export function servingMonthsMatchDate(months: BulletinServingMonth[], dateStr: string): boolean {
  return [0, 1].every((offset, i) => months[i]?.ym === ymOf(dateStr, offset))
}

/**
 * 섬김표를 주보 날짜에 맞춰 **앞으로 굴립니다.**
 *
 * 9월에 [9월, 10월] 로 만들어 둔 표로 10월 주보를 만들면 [10월, 11월] 이 되어야
 * 합니다. 이때 뒤칸에 있던 10월 표가 앞칸으로 옮겨 오고, 거기 적어 둔 대표기도·
 * 식사 섬김이 그대로 따라옵니다. 새로 생긴 11월만 빈 표로 깔립니다.
 * (그냥 새로 만들면 이미 정해 둔 10월 섬김이 통째로 날아갑니다.)
 *
 * 표가 자리를 옮기면 대표기도 배정이 가리키던 monthIndex 도 함께 옮겨 줘야 합니다.
 * 이걸 빼먹으면 10월 배정이 11월 표를 가리키게 됩니다.
 */
export function rollServingForDate(
  months: BulletinServingMonth[],
  assignments: BulletinPrayerAssignment[],
  dateStr: string
): { servingMonths: BulletinServingMonth[]; prayerAssignments: BulletinPrayerAssignment[] } {
  const want = [ymOf(dateStr, 0), ymOf(dateStr, 1)]

  const servingMonths = want.map(ym => months.find(m => m.ym === ym) ?? makeServingMonth(ym))

  // 옛 자리 → 새 자리
  const moved = new Map<number, number>()
  want.forEach((ym, newIdx) => {
    const oldIdx = months.findIndex(m => m.ym === ym)
    if (oldIdx >= 0) moved.set(oldIdx, newIdx)
  })

  const prayerAssignments = assignments.flatMap(a => {
    const newIdx = moved.get(a.monthIndex)
    if (newIdx === undefined) return []                                   // 빠진 달의 배정은 버립니다
    if (a.rowIndex >= servingMonths[newIdx].rows.length) return []        // 가리킬 줄이 없어진 배정도
    return [{ ...a, monthIndex: newIdx }]
  })

  return { servingMonths, prayerAssignments }
}

/**
 * 화면을 처음 보는 분이 "이렇게 채우면 되는구나" 를 바로 알 수 있게 하는 예시입니다.
 * 주보 탭의 [샘플 내용 채우기] 버튼이 씁니다 — 편집 중인 화면에만 들어가고,
 * 저장을 누르기 전에는 DB에 아무것도 남지 않습니다.
 */
export function sampleBulletinContent(dateStr: string, displayDate: string): BulletinContent {
  return {
    ...EMPTY_BULLETIN_CONTENT,
    date: displayDate,
    dateSub: '주일예배 · 오전 11:00',
    orderPre: [
      { item: '묵    도', by: '다같이' },
      { item: '찬    송', by: '1장' },
      { item: '신앙고백', by: '다같이' },
      { item: '기    도', by: '홍길동 집사' },
      { item: '성경봉독', center: '요한복음 3:1-12', by: '홍길동 집사' },
      { item: '찬    양', by: '찬양팀' },
    ],
    sermon: { label: '설    교', by: '김목사', title: '거듭남에 대하여', sub: '' },
    orderPost: [
      { item: '봉헌찬송', by: '다같이' },
      { item: '봉헌기도', by: '김목사' },
      { item: '광    고', by: '인도자' },
      { item: '축    도', by: '김목사' },
    ],
    churchNews: [
      {
        title: '가을 전교인 수련회',
        body: '10월 10일(금)부터 11일(토)까지 1박 2일로 진행합니다.\n신청은 9월 30일까지 각 부서 담당자에게 해주시기 바랍니다.',
      },
      {
        title: '주일학교 교사 모집',
        body: '함께 섬겨주실 교사를 기다립니다. 관심 있는 분은 교역자에게 문의해 주세요.',
      },
    ],
    memberNews: [
      { title: '새가족 환영', body: '이번 주 등록하신 ○○○ 성도님을 환영합니다.' },
      { title: '기도 부탁', body: '건강 회복 중이신 ○○○ 집사님을 위해 기도해 주세요.' },
    ],
    scriptureRef: '요한복음 3:1-12',
    verses: parseVersesFromText(
      '1 바리새인 중에 니고데모라 하는 사람이 있으니 유대인의 지도자라\n' +
      '2 그가 밤에 예수께 와서 이르되 랍비여 우리가 당신은 하나님께로부터 오신 선생인 줄 아나이다\n' +
      '3 예수께서 대답하여 이르시되 진실로 진실로 네게 이르노니 사람이 거듭나지 아니하면 하나님의 나라를 볼 수 없느니라\n' +
      '4 니고데모가 이르되 사람이 늙으면 어떻게 날 수 있사옵나이까\n' +
      '5 예수께서 대답하시되 사람이 물과 성령으로 나지 아니하면 하나님의 나라에 들어갈 수 없느니라\n' +
      '6 육으로 난 것은 육이요 영으로 난 것은 영이니\n' +
      '7 내가 네게 거듭나야 하겠다 하는 말을 놀랍게 여기지 말라\n' +
      '8 바람이 임의로 불매 네가 그 소리는 들어도 어디서 와서 어디로 가는지 알지 못하나니'
    ),
    messageTitle: '다시 태어난다는 것은\n무엇을 뜻하는가',
    messageBody:
      '니고데모는 밤에 예수님을 찾아왔습니다. 그는 율법을 아는 사람이었고,\n' +
      '사람들의 존경을 받는 지도자였습니다. 그러나 그가 가진 지식과 지위는\n' +
      '그를 하나님 나라로 데려가 주지 못했습니다.\n' +
      '주님은 다시 태어나야 한다고 말씀하셨습니다. 그것은 내가 쌓아 올린 것을\n' +
      '내려놓고, 성령께서 새롭게 하시는 일에 나를 맡기는 것입니다.',
    servingMonths: buildServingMonths(dateStr),
    prayerAssignments: [],
    notices: [
      '주보에 실을 소식은 매주 목요일까지 알려주시기 바랍니다.',
      '예배 중 휴대전화는 진동으로 전환해 주세요.',
    ],
    offeringLines: OFFERING_ACCOUNT_LINES,
  }
}
