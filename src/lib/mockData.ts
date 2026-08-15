export type Role = 'PENDING' | 'MEMBER' | 'LEADER' | 'ADMIN' | 'COUPON'

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
  familyInfo?: string // '아내: 홍길순, 자녀: 김철수'
  birthday?: string // '08-15' (MM-DD)
  avatarUrl?: string
  createdAt: string
}

// 사용자 호칭 생성 헬퍼 함수
// - 가입 대기자(PENDING) 또는 직분이 미정인 경우: "이름님" (예: 홍길동님)
// - 정회원 이상이고 직분이 있는 경우: "이름 직분님" (예: 홍길동 목사님, 김영희 집사님)
export function getUserDisplayName(user: UserProfile, suffix = '님'): string {
  if (!user || user.id === 'guest') return '방문자님'
  if (user.role === 'PENDING') return `${user.name}${suffix}`
  const duty = user.duty?.trim()
  if (duty) {
    return `${user.name} ${duty}${suffix}`
  }
  return `${user.name}${suffix}`
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

export interface MealCouponAccount {
  familyGroupId: string
  familyName: string // 예: '김목사/이권사 가정'
  balance: number // 잔여 쿠폰 수
  history: {
    id: string
    dateStr: string
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
