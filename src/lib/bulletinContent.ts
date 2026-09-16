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
  /** 순서 이름 (예: '묵    도') */
  item: string
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
  /** 머리행 (예: ['9월', '대표기도', '식사 섬김']) */
  head: string[]
  /** 각 줄 (예: ['1주', '홍길동 집사', '1구역']) */
  rows: string[][]
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
  memoLabel: string

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
    { item: '성경봉독', by: '' },
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
  memoLabel: '묵상 메모',

  messageLabel: 'MESSAGE',
  messageTitle: '',
  messageBody: '',
  servingTitle: '기도 및 식사 섬김',
  servingMonths: [],
  prayerAssignments: [],
  noticeTitle: '공지 사항',
  notices: [],
  offeringLabel: '헌금 계좌',
  offeringLines: [],
  offeringQr: '',
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
    return { item: asStr(o.item), by: asStr(o.by) }
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
      head: asArr(o.head).map(h => asStr(h)),
      rows: asArr(o.rows).map(r => asArr(r).map(c => asStr(c))),
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
    memoLabel:      asStr(c.memoLabel, d.memoLabel),

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
      const t = text.slice(start, end).replace(/\s+/g, ' ').trim()
      if (t) out.push({ n: Number(m[1]), t })
    })
    if (out.length > 0) return out
  }

  // 2) 줄 단위
  return text
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t, i) => ({ n: i + 1, t }))
}

/**
 * 'YYYY-MM-DD' 주일을 기준으로 섬김표 두 달치(이번 달 + 다음 달) 틀을 만듭니다.
 * 이름은 비워 두고 주차 줄만 깔아 둡니다.
 */
export function buildServingMonths(dateStr: string, weeks = 5): BulletinServingMonth[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  const now = new Date()
  const year = m ? Number(m[1]) : now.getFullYear()
  const month = m ? Number(m[2]) : now.getMonth() + 1

  const monthLabel = (offset: number) => {
    const total = month - 1 + offset
    return `${((total % 12) + 12) % 12 + 1}월`
  }
  void year

  return [0, 1].map(offset => ({
    head: [monthLabel(offset), '대표기도', '식사 섬김'],
    rows: Array.from({ length: weeks }, (_, i) => [`${i + 1}주`, '', '']),
  }))
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
      { item: '성경봉독', by: '요한복음 3:1-12' },
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
    offeringLines: ['○○은행 000-0000-0000', '예금주 : 더브릿지교회'],
  }
}
