// REJECTED: 가입이 거절된 계정. 예전에는 profiles 행을 아예 삭제했는데, 로그인 계정은
// 남아있어서 그분이 앱을 다시 열면 승인 대기 목록에 무한히 다시 올라왔습니다.
// TEACHER: 자녀(교회학교) 출석만 담당하는 선생님. 성도 자격은 일반 성도와 똑같습니다.
export type Role = 'PENDING' | 'MEMBER' | 'LEADER' | 'ADMIN' | 'COUPON' | 'REJECTED' | 'TEACHER'

/** 승인이 끝나 실제로 교회 명단에 포함되는 성도인지 (주소록/출석/통계 대상) */
export function isApprovedMember(role: Role | undefined | null): boolean {
  return role !== 'PENDING' && role !== 'REJECTED' && role !== undefined && role !== null
}

/**
 * "실제 교회 성도"인지 — 명단·집계·통계에 넣을 대상인지 판단합니다.
 *
 * 🐛 과거 문제: 식권 명단과 식사 미응답 목록이 isApprovedMember()만 썼는데,
 * 이 함수는 업무용 계정인 '쿠폰관리자'(COUPON)도 성도로 봅니다. 그래서 두 화면에
 * 쿠폰관리자가 성도처럼 끼어 있었습니다. (주소록·생일·출석은 각자 따로 걸러내고 있었습니다)
 * → 앞으로 명단/집계 화면은 전부 이 함수를 쓰면 같은 실수가 반복되지 않습니다.
 */
export function isChurchMember(role: Role | undefined | null): boolean {
  return isApprovedMember(role) && role !== 'COUPON'
}

/** 아직 앱을 정상적으로 쓸 수 없는 상태인지 (대기 중이거나 거절됨) */
export function isBlockedRole(role: Role | undefined | null): boolean {
  return role === 'PENDING' || role === 'REJECTED'
}

/** 자녀(교회학교) 출석을 입력할 수 있는 사람인지 */
export function canEditChildAttendance(role: Role | undefined | null): boolean {
  return role === 'TEACHER' || role === 'LEADER' || role === 'ADMIN'
}

/** 관리 화면에 들어갈 수 있는 사람인지 (선생님은 출석 탭만 보입니다) */
export function canOpenAdmin(role: Role | undefined | null): boolean {
  return role === 'ADMIN' || role === 'LEADER' || role === 'COUPON' || role === 'TEACHER'
}

export interface UserProfile {
  id: string
  name: string
  email: string
  phone: string
  address?: string
  role: Role
  labriId?: string // '1라브리', '2라브리', '3라브리' 또는 undefined
  duty: string // 성도, 집사, 권사, 장로, 목사 등
  familyGroupId?: string // 가정을 묶는 그룹 ID (예: 'family_kim', 'family_lee')
  familyRole?: string // '부', '모', '자녀1', '자녀2', '조부', '조모', '자녀', '기타'
  familyInfo?: string // 배우자 자동연동 + 자녀 구조화 데이터가 JSON으로 저장됨 (src/lib/familyInfo.ts 참고). 예전 방식의 일반 텍스트 메모도 호환됨.
  birthday?: string // '08-15' (MM-DD)
  avatarUrl?: string
  createdAt: string
  /** 가입 환영 팝업을 본 시각. 비어 있으면 승인 후 첫 방문이라는 뜻입니다. */
  welcomedAt?: string
  /** "가입 완료 및 승인 신청" 버튼을 실제로 누른 시각. 비어 있으면 로그인만 하고
   *  아직 신청서를 제출하지 않은 상태 — 이때는 관리자에게 알림을 보내지 않습니다. */
  signupRequestedAt?: string
  // 아래 두 필드는 실제 계정이 없는 자녀 등 가족 구성원을 주소록에 표시하기 위한
  // 가상 항목(dependent entry)에만 설정됩니다. 실제 성도 프로필에는 사용되지 않습니다.
  isDependent?: boolean
  parentName?: string
  /** 자녀 가상 항목에만 설정 — 교회학교 그룹(영아부 등). 비어 있으면 "미지정" */
  childLabriId?: string
  /** 선생님(TEACHER)이 담당하는 자녀 그룹. 비워두면 모든 자녀 그룹 담당입니다. */
  teachGroup?: string
}

/**
 * 프로필 사진이 없을 때 동그라미에 넣을 글자.
 *
 * 성을 빼고 **이름 두 글자**를 씁니다 (홍길동 → 길동).
 * 한 글자만 보여주면 김·이·박이 너무 많아 누가 누군지 구분이 안 됩니다.
 */
export function getInitials(name?: string | null): string {
  const raw = (name || '').trim()
  if (!raw) return '성'
  // 공백이 있으면 마지막 낱말을 씁니다 ("Nguyen 문철" → 문철)
  const last = raw.split(/\s+/).pop() || raw
  return last.length <= 2 ? last : last.slice(-2)
}

/** 교회 단톡방 (카카오 오픈채팅) — 홈 화면 버튼과 가입 환영 팝업이 함께 씁니다 */
export const KAKAO_OPEN_CHAT_URL = 'https://open.kakao.com/o/gi8JM1Ii'

// 이름표(목록·명단·작성자 표기)에 쓰는 호칭입니다.
// - 직분이 있으면 "홍길동 목사", 없으면 "홍길동"
// - 예전에는 뒤에 '님'을 붙였는데, 명단에서는 군더더기라 기본값을 뺐습니다.
//   말을 거는 문장("환영합니다 ○○님")은 getSimpleUserName 을 쓰세요.
export function getUserDisplayName(user: UserProfile, suffix = ''): string {
  if (!user || user.id === 'guest') return `방문자${suffix}`
  if (user.role === 'PENDING') return `${user.name}${suffix}`
  const duty = user.duty?.trim()
  if (duty) {
    return `${user.name} ${duty}${suffix}`
  }
  return `${user.name}${suffix}`
}

/**
 * 직분을 빼고 '이름님'만 만듭니다.
 * 식사 신청처럼 "누가 마지막으로 고쳤나"만 알면 되는 곳에서, 이름이 길어지지 않도록 씁니다.
 */
export function getSimpleUserName(user: UserProfile, suffix = '님'): string {
  if (!user || user.id === 'guest') return `방문자${suffix}`
  return `${(user.name || '').trim() || '성도'}${suffix}`
}

/**
 * 예전에 '홍길동 집사님' 형태로 저장된 값을 '홍길동님'으로 정리해서 보여줍니다.
 * (이미 저장된 신청 기록을 고치지 않고도 화면 표기를 통일할 수 있습니다)
 */
export function simplifyStoredName(stored?: string | null, suffix = '님'): string {
  const raw = (stored || '').trim()
  if (!raw) return `성도${suffix}`
  const first = raw.split(/\s+/)[0]
  const bare = first.replace(/님$/, '')
  return `${bare || '성도'}${suffix}`
}

/**
 * 연속 결석 주수를 화면에 표시할 문자열로 바꿉니다.
 * 9주까지는 숫자로, 그보다 오래되면 '장기'로 표시합니다.
 * (12주·37주처럼 큰 숫자는 칸을 밀어내기만 하고, 정작 필요한 정보는
 *  "오래 안 나오셨다"는 사실 하나뿐이라 이렇게 정했습니다)
 */
export function formatAbsenceStreak(weeks: number): string {
  if (!weeks || weeks <= 0) return ''
  return weeks > 9 ? '장기' : `${weeks}주`
}

export interface MealRegistration {
  id: string
  dateStr: string // e.g. '2026-08-09'
  familyGroupId: string
  registeredByUserId: string
  registeredByUserName: string
  labriId: string
  attending: boolean
  adultCount: number
  childCount: number
  updatedAt: string
}

/** 앱 안 알림함 항목 (폰이 울리는 푸시가 아니라, 🔔 눌러서 확인하는 방식) */
export interface NotificationItem {
  id: string
  // COMMENT/LIKE/NOTICE = 성도님이 만든 알림
  // MEAL/ATTENDANCE/BIRTHDAY/BULLETIN = 서버가 시간에 맞춰 자동으로 보내는 알림
  // MANUAL = 관리자가 직접 써서 보낸 알림
  // SIGNUP_REQUEST = 새 가입 신청이 생기면 관리자에게만 자동으로 가는 알림
  type: 'COMMENT' | 'LIKE' | 'NOTICE' | 'MEAL' | 'ATTENDANCE' | 'BIRTHDAY' | 'BULLETIN' | 'MANUAL' | 'SIGNUP_REQUEST'
  title: string
  body: string
  actorName: string
  postId?: string
  postCategory?: string
  isRead: boolean
  createdAt: string
}

export interface MealCouponAccount {
  familyGroupId: string
  familyName: string // 예: '김목사/이권사 가정'
  balance: number // 잔여 쿠폰 수
  history: {
    id: string
    dateStr: string
    /** 저장 시각(ISO). 같은 날 여러 건이 있을 때 순서를 정확히 가리기 위해 필요합니다. */
    at?: string
    type: 'GRANT' | 'USE' | 'DEDUCT'
    amount: number
    note: string
  }[]
}

export interface AttendanceRecord {
  id: string
  dateStr: string // '2026-08-02'
  userId: string
  userName: string
  labriId: string
  status: 'ATTEND' | 'ABSENT'
  note?: string // 결석 사유
}

export interface PostItem {
  id: string
  authorId: string
  authorName: string
  authorAvatar?: string
  labriId?: string
  title: string
  content: string
  category: 'PRAYER' | 'PRAISE' | 'PHOTO' | 'NOTICE' | 'LABRI' | 'MEMBER_NEWS'
  createdAt: string
  likes: number
  likedUserIds?: string[]
  isSecret?: boolean
  isCompleted?: boolean
  isPinned?: boolean
  youtubeUrl?: string
  imageUrls?: string[]
  tags?: string[]
  comments?: CommentItem[]
}

export interface CommentItem {
  id: string
  /** 댓글 작성자 계정 ID. 프로필 사진을 찾을 때 사용합니다.
   *  (이전에는 이름으로만 찾았는데, 댓글에는 "김목사 목사님"처럼 직분이 붙은 이름이
   *   저장되고 프로필의 이름은 "김목사"라서 한 번도 매칭되지 않았습니다.) */
  authorId?: string
  authorName: string
  authorAvatar?: string
  content: string
  createdAt: string
}

// 50명 규모 더브릿지 교회 기본 Mock 유저 데이터
export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'u1',
    name: '김목사',
    email: 'pastor@thebridge.org',
    phone: '+84 90 123 4567',
    address: '하노이 미딩 송다 A동 1001호',
    role: 'ADMIN',
    labriId: '라브리1',
    duty: '목사',
    familyGroupId: 'fam_kim',
    familyRole: 'HUSBAND',
    familyInfo: '아내: 이사모, 자녀: 김하늘',
    birthday: '08-15',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    createdAt: '2026-01-01'
  },
  {
    id: 'u1_wife',
    name: '이사모',
    email: 'samom@thebridge.org',
    phone: '+84 90 123 4568',
    address: '하노이 미딩 송다 A동 1001호',
    role: 'MEMBER',
    labriId: '라브리1',
    duty: '사모',
    familyGroupId: 'fam_kim',
    familyRole: 'WIFE',
    familyInfo: '남편: 김목사, 자녀: 김하늘',
    birthday: '08-20',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    createdAt: '2026-01-01'
  },
  {
    id: 'u2',
    name: '이리더',
    email: 'leader1@thebridge.org',
    phone: '+84 90 234 5678',
    address: '하노이 미딩 테라홈 502호',
    role: 'LEADER',
    labriId: '라브리1',
    duty: '집사',
    familyGroupId: 'fam_lee',
    familyRole: 'HUSBAND',
    familyInfo: '아내: 박집사',
    birthday: '08-24',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    createdAt: '2026-01-05'
  },
  {
    id: 'u3',
    name: '박성도',
    email: 'member1@thebridge.org',
    phone: '+84 90 345 6789',
    address: '하노이 경남 아파트 1204호',
    role: 'MEMBER',
    labriId: '라브리1',
    duty: '성도',
    familyGroupId: 'fam_park',
    familyRole: 'HUSBAND',
    familyInfo: '아내: 최성도, 자녀: 박민준',
    birthday: '08-28',
    createdAt: '2026-02-10'
  },
  {
    id: 'u4',
    name: '최리더',
    email: 'leader2@thebridge.org',
    phone: '+84 90 456 7890',
    address: '하노이 골드마크 시티 301호',
    role: 'LEADER',
    labriId: '라브리2',
    duty: '집사',
    familyGroupId: 'fam_choi',
    familyRole: 'SINGLE',
    createdAt: '2026-01-06'
  },
  {
    id: 'u5',
    name: '정성도',
    email: 'member2@thebridge.org',
    phone: '+84 90 567 8901',
    address: '하노이 인도차이나 804호',
    role: 'MEMBER',
    labriId: '라브리2',
    duty: '성도',
    createdAt: '2026-03-01'
  },
  {
    id: 'u6',
    name: '강신규',
    email: 'newcomer@gmail.com',
    phone: '+84 90 678 9012',
    address: '하노이 미딩 에메랄드 202호',
    role: 'PENDING',
    duty: '성도',
    createdAt: '2026-08-05'
  },
]

// 가정 그룹별 디지털 식사 쿠폰 데이터베이스
export const INITIAL_MEAL_COUPONS: Record<string, MealCouponAccount> = {
  fam_kim: {
    familyGroupId: 'fam_kim',
    familyName: '김목사 / 이사모',
    balance: 8,
    history: [
      { id: 'h1', dateStr: '2026-08-01', type: 'GRANT', amount: 10, note: '8월 정기 쿠폰 발급' },
      { id: 'h2', dateStr: '2026-08-02', type: 'USE', amount: 2, note: '주일 식사 2장 차감' }
    ]
  },
  fam_lee: {
    familyGroupId: 'fam_lee',
    familyName: '이리더',
    balance: 5,
    history: [
      { id: 'h3', dateStr: '2026-08-01', type: 'GRANT', amount: 6, note: '8월 정기 쿠폰 발급' },
      { id: 'h4', dateStr: '2026-08-02', type: 'USE', amount: 1, note: '주일 식사 1장 차감' }
    ]
  },
  fam_park: {
    familyGroupId: 'fam_park',
    familyName: '박성도',
    balance: 3,
    history: [
      { id: 'h5', dateStr: '2026-08-01', type: 'GRANT', amount: 5, note: '8월 정기 쿠폰 발급' }
    ]
  }
}

export const INITIAL_BULLETIN = {
  title: '하나님의 은혜로 굳건하게 서는 교회',
  passage: '에베소서 2:20-22',
  preacher: '김목사',
  date: '8/9(일)',
  summary: '우리는 그리스도 예수 안에서 함께 지어져 가는 거룩한 성전입니다. 서로 연결되고 하나 되어 주님의 나라를 이루어 갑시다.',
  imageUrls: [
    'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&w=800&q=80',
  ],
}

export const INITIAL_NOTICES: PostItem[] = [
  {
    id: 'n1',
    authorId: 'u1',
    authorName: '김목사',
    title: '☀️ 2026 전교인 여름 수련회 안내',
    content: '올해 전교인 여름 수련회는 8월 15일부터 17일까지 닌빈 수련원에서 진행됩니다. 성도님들의 많은 관심과 기도 부탁드립니다.',
    category: 'NOTICE',
    createdAt: '2026-08-01',
    likes: 10,
    tags: ['수련회']
  },
  {
    id: 'n2',
    authorId: 'u1',
    authorName: '김목사',
    title: '🍱 주일 식사 사전 신청 안내 (토요일 14시 마감)',
    content: '주일 공동체 식사의 원활한 준비를 위해 매주 토요일 오후 2시까지 미리 신청해 주시기 바랍니다.',
    category: 'NOTICE',
    createdAt: '2026-08-02',
    likes: 8,
    tags: ['식사']
  }
]

export const INITIAL_PRAYERS: PostItem[] = [
  {
    id: 'p1',
    authorId: 'u3',
    authorName: '박성도',
    title: '가족의 건강과 안전한 베트남 생활을 위해',
    content: '이번 주 현지 적응 과정에서 아이가 잔병치레를 하고 있습니다. 신체적 강건함과 마음의 평안을 위해 중보 부탁드립니다.',
    category: 'PRAYER',
    createdAt: '2026-08-04 10:30',
    likes: 12,
    isSecret: false,
    isCompleted: false,
    comments: [
      { id: 'c1', authorName: '이리더', content: '박성도님, 저희 라브리에서도 함께 마음 모아 기도하겠습니다! 🙏', createdAt: '2026-08-04 11:15' },
      { id: 'c2', authorName: '김목사', content: '주님의 치유와 평안이 온 가정에 함께하시길 기도합니다.', createdAt: '2026-08-04 14:00' },
    ]
  },
  {
    id: 'p2',
    authorId: 'u2',
    authorName: '이리더',
    title: '1라브리 공동체의 하나됨을 위한 기도',
    content: '새롭게 모인 라브리식구들이 서로 깊이 소통하고 말씀을 나누는 기쁨이 풍성하도록 기도해주세요.',
    category: 'PRAYER',
    createdAt: '2026-08-05 18:20',
    likes: 8,
    isSecret: false,
    isCompleted: true,
    comments: []
  }
]

export const INITIAL_PRAISES: PostItem[] = [
  {
    id: 'pr1',
    authorId: 'u1',
    authorName: '김목사',
    title: '이번 주 찬양: 은혜 (Grace)',
    content: '내가 누려왔던 모든 것들이 내가 지나왔던 모든 시간이 내가 걸어왔던 모든 순간이 당연한 것 아니라 은혜였소.',
    category: 'PRAISE',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    createdAt: '2026-08-06 09:00',
    likes: 15,
  },
  {
    id: 'pr2',
    authorId: 'u2',
    authorName: '이리더',
    title: '오늘의 묵상: 시편 23편 말씀 나눔',
    content: '여호와는 나의 목자시니 내게 부족함이 없으리로다. 그가 나를 푸른 풀밭에 누이시며 쉬만 한 물 가로 인도하시는도다.',
    category: 'PRAISE',
    createdAt: '2026-08-06 11:30',
    likes: 9,
  }
]

export const INITIAL_PHOTOS: PostItem[] = [
  {
    id: 'ph1',
    authorId: 'u1',
    authorName: '김목사',
    title: '2026 부활절 감사 예배 및 세례식',
    content: '온 성도가 하나 되어 주님의 부활을 기뻐하며 드린 감사 예배 사진입니다.',
    category: 'PHOTO',
    imageUrls: [
      'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80'
    ],
    tags: ['전체', '부활절'],
    createdAt: '2026-04-20',
    likes: 24,
    comments: []
  }
]
