'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Church, Megaphone, FileText, CreditCard, ChevronRight,
  LogIn, Copy, Check, Bell, Home, Newspaper, Heart, ClipboardList, User,
  Sparkles, MapPin, MessageCircle, Clock, ArrowUpRight,
} from 'lucide-react'

/**
 * 홈 화면 리디자인 데모 v2 — "레이아웃·메인 컬러 유지 + 과감한 최신 트렌드" 버전.
 * /demo(v1, 보존형)와 별도 라우트이며 실제 서비스에는 연결되지 않습니다.
 */

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:!translate-y-0 motion-reduce:!opacity-100 ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
      } ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

// 스크롤 컨테이너 브라우저 스크롤바 숨김 (가로 스와이프 카드용)
const noScrollbar: CSSProperties = { scrollbarWidth: 'none' }

// 고정 배경에만 적용하는 미세 그레인 텍스처 (스크롤 컨테이너에는 절대 적용하지 않음 — 성능)
const GRAIN_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

const CHURCH_INFO = {
  vision: '멀리 있던 자를 가까이 오게 하는\n은혜의 자리로 초대합니다',
  intro: '더브릿지 교회는 하노이에서 함께 예배하며\n말씀 안에서 자라가는 교회 공동체입니다.',
  address: '골든펠리스 지하1층 달팽이카페 (K-Mart 안쪽)',
  serviceTime: '11:00',
}

const DEMO_NOTICES = [
  {
    id: '1',
    tag: '이번 주',
    title: '11월 첫째 주 성찬식 안내',
    content: '이번 주일 예배 중 성찬식이 있습니다. 예배 15분 전까지 착석 부탁드립니다.',
  },
  {
    id: '2',
    tag: '모임',
    title: '수요 기도모임 장소 변경',
    content: '이번 주부터 수요 기도모임은 2층 소그룹실에서 진행됩니다.',
  },
  {
    id: '3',
    tag: '안내',
    title: '주차 안내 (K-Mart 지하주차장)',
    content: '건물 지하주차장을 이용하실 수 있습니다. 입구에서 안내원에게 문의해 주세요.',
  },
]

const DEMO_BULLETIN = {
  date: '11월 2주 · 주일예배',
  title: '가까이 오게 하는 사람',
  passage: '에베소서 2:13-18',
  preacher: '김요한 목사',
  summary:
    '멀리 있던 자들을 그리스도의 피로 가까워지게 하신 은혜를 나누고, 우리 역시 화평케 하는 사람으로 부름받았음을 함께 나눕니다.',
}

const NAV_ITEMS = [
  { id: 'home', label: '홈', icon: Home },
  { id: 'news', label: '우리소식', icon: Newspaper },
  { id: 'sharing', label: '나눔', icon: Heart },
  { id: 'request', label: '신청', icon: ClipboardList },
  { id: 'mypage', label: '내정보', icon: User },
]

const WHATS_NEW = [
  '단일 플랫 블루 대신, 같은 브랜드 블루 안에서 짙은 네이비 → 밝은 블루로 이어지는 듀오톤 그라데이션을 히어로·주보·헌금 카드에 씁니다.',
  '공지사항을 세로 목록에서 가로 스와이프 카드로 바꿔, 최근 트렌드인 "훑어보는 카드" 방식으로 전환했습니다.',
  '예배시간·오시는 길·카톡 문의를 벤토(Bento) 타일로 묶어, 텍스트 나열 대신 한눈에 스캔되는 블록으로 정리했습니다.',
  '하단 네비게이션을 화면 폭 꽉 채운 바 대신 여백을 둔 플로팅 독(dock) 형태로, 헤더엔 유리질감(glass) 칩을 더했습니다.',
  '레이아웃 골격(헤더 → 히어로 → 공지 → 주보 → 헌금 → 하단내비)과 메인 컬러(#335f87)는 그대로 유지했습니다.',
]

export default function RedesignDemoV2Page() {
  const [viewAs, setViewAs] = useState<'guest' | 'member'>('guest')
  const [copied, setCopied] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const isGuest = viewAs === 'guest'

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1400)
  }

  const handleCopyAccount = async () => {
    try {
      if (!navigator.clipboard) throw new Error('unavailable')
      await navigator.clipboard.writeText('100100299503')
      setCopied(true)
      showToast('계좌번호가 복사되었습니다')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      showToast('복사가 지원되지 않는 브라우저입니다')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── 데모 전용 상단 바 ── */}
      <div className="sticky top-0 z-[80] bg-slate-900 text-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles size={14} className="text-amber-300" />
            홈 화면 리디자인 데모 v2 · 과감한 트렌드 버전
            <a href="/demo" className="ml-2 text-2xs font-bold text-blue-300 hover:text-blue-200 underline underline-offset-2">
              v1(보존형) 보기
            </a>
          </div>
          <div className="flex items-center bg-white/10 rounded-full p-0.5 text-2xs font-bold">
            <button
              onClick={() => setViewAs('guest')}
              className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                isGuest ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
              }`}
            >
              방문자로 보기
            </button>
            <button
              onClick={() => setViewAs('member')}
              className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                !isGuest ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
              }`}
            >
              성도로 보기
            </button>
          </div>
        </div>
      </div>

      {/* ── 무엇이 바뀌었나 ── */}
      <div className="max-w-3xl mx-auto px-4 pt-5">
        <Reveal>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 className="text-sm font-bold text-slate-900 mb-2.5">무엇이 바뀌었나요</h2>
            <ul className="space-y-1.5">
              {WHATS_NEW.map((line, i) => (
                <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                  <span className="text-[#335f87] font-bold shrink-0">{i + 1}.</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      {/* ── 폰 화면 미리보기 ── */}
      <div className="flex justify-center px-4 py-8">
        <div className="relative w-full max-w-md bg-[#f3f5f9] rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden">
          {/* 고정 그레인 텍스처 — 스크롤 영역이 아닌 프레임 전체에 한 번만 */}
          <div
            className="absolute inset-0 z-[1] pointer-events-none opacity-[0.035] mix-blend-overlay"
            style={{ backgroundImage: GRAIN_BG }}
          />

          {/* 헤더 — 유리질감 */}
          <div className="relative z-30 bg-white/70 backdrop-blur-xl px-5 py-3 flex items-center justify-between sticky top-0 border-b border-white/60 shadow-[0_1px_0_rgba(51,95,135,0.06)]">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#4f8fd1] via-[#335f87] to-[#122536] text-white flex items-center justify-center shrink-0 shadow-[0_3px_10px_-3px_rgba(51,95,135,0.6)]">
                <Church size={17} />
              </span>
              <span className="text-sm font-black text-slate-900 tracking-tight">더브릿지교회</span>
            </div>

            {isGuest ? (
              <button className="px-4 py-2 bg-gradient-to-br from-[#3f76a3] to-[#1d3a54] hover:brightness-110 active:scale-95 text-white font-bold text-xs rounded-full shadow-[0_4px_14px_-4px_rgba(29,58,84,0.55)] flex items-center gap-1.5 transition-all cursor-pointer">
                <LogIn size={13} /> 로그인
              </button>
            ) : (
              <button className="relative flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-full pl-1 pr-3 py-1 shadow-sm transition-all cursor-pointer">
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4f8fd1] to-[#1d3a54] text-white flex items-center justify-center text-2xs font-bold">임</span>
                <span className="text-2xs font-semibold text-slate-700">임혜영 님</span>
                <span className="relative">
                  <Bell size={13} className="text-slate-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500">
                    <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping" />
                  </span>
                </span>
              </button>
            )}
          </div>

          <main className="relative z-10 p-4 space-y-4 pb-6">
            {/* 1. 히어로 — 듀오톤 그라데이션 + 오버랩 유리 칩 */}
            <Reveal>
              <section className="relative rounded-[1.75rem] overflow-hidden shadow-[0_10px_30px_-12px_rgba(18,37,54,0.55)]">
                <img
                  src="https://picsum.photos/seed/thebridge-hanoi-worship/900/700"
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <span className="absolute top-3 right-3 z-10 text-[9px] font-bold uppercase tracking-wide bg-black/40 text-white/90 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  예시 사진
                </span>
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(155deg, rgba(18,37,54,0.35) 0%, rgba(29,58,84,0.55) 40%, rgba(51,95,135,0.75) 70%, rgba(79,143,209,0.55) 100%)',
                  }}
                />
                <div className="relative p-6 pt-8 pb-11 text-white space-y-3">
                  <span className="inline-flex items-center text-[10px] font-bold tracking-widest uppercase bg-white/15 border border-white/25 backdrop-blur-md px-2.5 py-1 rounded-full">
                    The Bridge Church
                  </span>
                  {isGuest ? (
                    <h1 className="text-[1.75rem] font-black leading-[1.15] tracking-tight">
                      더브릿지 교회에<br />오신 것을 환영합니다
                    </h1>
                  ) : (
                    <h1 className="text-2xl font-black leading-[1.15] tracking-tight">임혜영 님,<br />환영합니다</h1>
                  )}
                  <p className="text-xs text-blue-50/90 leading-relaxed whitespace-pre-line max-w-[85%]">
                    {isGuest ? CHURCH_INFO.vision : '오늘도 주님의 평안과 은혜가 가득하시길 기도합니다.'}
                  </p>
                </div>

                {/* 히어로 하단에 절반 걸치는 유리 칩 (깊이감) */}
                <div className="absolute -bottom-6 left-6 right-6 z-10">
                  <div className="bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl shadow-[0_8px_24px_-8px_rgba(18,37,54,0.35)] px-4 py-3 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-blue-50 text-[#335f87] flex items-center justify-center shrink-0">
                      <Clock size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">주일예배</p>
                      <p className="text-sm font-black text-slate-900">{CHURCH_INFO.serviceTime} 열린 주일예배</p>
                    </div>
                  </div>
                </div>
              </section>
            </Reveal>

            {/* 2. 벤토 퀵 정보 (오시는 길 / 카톡 문의) — 히어로 칩과 겹친 만큼 위 여백 확보 */}
            <Reveal delay={80} className="pt-3">
              <section className="grid grid-cols-2 gap-3">
                <button className="group text-left bg-white hover:bg-slate-50 active:scale-[0.98] rounded-2xl border border-slate-200/70 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all cursor-pointer">
                  <span className="w-9 h-9 rounded-xl bg-blue-50 text-[#335f87] flex items-center justify-center mb-2.5">
                    <MapPin size={16} />
                  </span>
                  <p className="text-xs font-bold text-slate-900 leading-snug">{CHURCH_INFO.address}</p>
                  <span className="inline-flex items-center gap-0.5 text-2xs font-bold text-[#335f87] mt-2 group-hover:gap-1.5 transition-all">
                    지도 보기 <ArrowUpRight size={12} />
                  </span>
                </button>
                <button className="group text-left bg-gradient-to-br from-[#FEE500] to-[#ffd400] hover:brightness-105 active:scale-[0.98] rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all cursor-pointer">
                  <span className="w-9 h-9 rounded-xl bg-black/10 text-[#3C1E1E] flex items-center justify-center mb-2.5">
                    <MessageCircle size={16} />
                  </span>
                  <p className="text-xs font-bold text-[#3C1E1E] leading-snug">카톡 오픈채팅으로<br />편하게 문의하기</p>
                  <span className="inline-flex items-center gap-0.5 text-2xs font-bold text-[#3C1E1E] mt-2 group-hover:gap-1.5 transition-all">
                    문의하기 <ArrowUpRight size={12} />
                  </span>
                </button>
              </section>
            </Reveal>

            {/* 3. 공지사항 — 가로 스와이프 카드 */}
            <Reveal delay={120}>
              <section className="space-y-3">
                <div className="flex items-center gap-2 px-0.5">
                  <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#335f87] flex items-center justify-center shrink-0">
                    <Megaphone size={16} />
                  </span>
                  <h2 className="font-bold text-slate-900 text-sm">교회 공지사항</h2>
                </div>
                <div
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 [&::-webkit-scrollbar]:hidden -mx-4 px-4"
                  style={noScrollbar}
                >
                  {DEMO_NOTICES.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => showToast(n.title)}
                      className="snap-start shrink-0 w-[78%] text-left bg-white hover:bg-slate-50 active:scale-[0.98] p-4 rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all cursor-pointer space-y-1"
                    >
                      <span className="text-2xs font-bold text-[#335f87] bg-blue-50 px-2 py-0.5 rounded-md inline-block">{n.tag}</span>
                      <h3 className="font-bold text-xs text-slate-800 leading-snug line-clamp-2">{n.title}</h3>
                      <p className="text-2xs text-slate-400 line-clamp-2 leading-relaxed">{n.content}</p>
                    </button>
                  ))}
                </div>
              </section>
            </Reveal>

            {/* 4. 이번 주 주보 — 다크 듀오톤 카드 */}
            <Reveal delay={160}>
              <section className="relative overflow-hidden rounded-[1.75rem] shadow-[0_10px_28px_-14px_rgba(18,37,54,0.6)]">
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(160deg, #1d3a54 0%, #234a6b 55%, #335f87 100%)' }}
                />
                <div
                  className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
                  style={{ backgroundImage: GRAIN_BG }}
                />
                <div className="relative p-5 space-y-3.5 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                        <FileText size={16} />
                      </span>
                      <h2 className="font-bold text-sm">이번 주 주보</h2>
                    </div>
                    <span className="text-2xs text-blue-100/70 font-medium">{DEMO_BULLETIN.date}</span>
                  </div>
                  <div className="bg-white/10 border border-white/15 backdrop-blur-sm p-4 rounded-2xl space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-base leading-snug">{DEMO_BULLETIN.title}</h3>
                      <span className="text-2xs bg-white/15 font-semibold px-2.5 py-0.5 rounded-full shrink-0">{DEMO_BULLETIN.preacher}</span>
                    </div>
                    <p className="text-xs text-amber-200 font-semibold">{DEMO_BULLETIN.passage}</p>
                    <p className="text-xs text-blue-50/85 leading-relaxed pt-1.5 border-t border-white/15">{DEMO_BULLETIN.summary}</p>
                  </div>
                  <button
                    onClick={() => showToast('주보 전체보기 (데모)')}
                    className="w-full py-2.5 bg-white/95 hover:bg-white active:scale-[0.98] text-[#1d3a54] text-xs font-bold rounded-2xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    주보 전체보기 <ChevronRight size={14} />
                  </button>
                </div>
              </section>
            </Reveal>

            {/* 5. 온라인 헌금 (성도 전용) */}
            {!isGuest && (
              <Reveal delay={200}>
                <section className="bg-white rounded-[1.75rem] border border-slate-200/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <CreditCard size={16} />
                    </span>
                    <h2 className="font-bold text-slate-900 text-sm">온라인 헌금 안내</h2>
                  </div>
                  <div className="flex items-center justify-between bg-gradient-to-br from-emerald-50 to-emerald-50/40 border border-emerald-100 p-4 rounded-2xl gap-2">
                    <span className="font-mono text-xs font-bold text-slate-800 leading-relaxed">
                      우리은행 100-100-299503
                      <br />
                      <span className="text-2xs font-sans font-semibold text-slate-500">(예금주 : 임혜영 / LimHyeYoung)</span>
                    </span>
                    <button
                      onClick={handleCopyAccount}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer active:scale-95 ${
                        copied ? 'bg-emerald-600 text-white' : 'bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20'
                      }`}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? '복사됨' : '복사'}
                    </button>
                  </div>
                </section>
              </Reveal>
            )}
          </main>

          {/* 하단 네비게이션 — 여백을 둔 플로팅 독 */}
          <div className="relative z-30 px-4 pb-4 pt-1">
            <nav className="bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-[1.5rem] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)] px-1.5 py-1.5">
              <div className="flex items-stretch">
                {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                  const isActive = id === 'home'
                  return (
                    <button
                      key={id}
                      onClick={() => !isActive && showToast('데모에서는 홈 화면만 미리볼 수 있어요')}
                      className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-w-0 rounded-2xl transition-all cursor-pointer ${
                        isActive ? 'bg-gradient-to-br from-[#3f76a3] to-[#1d3a54] text-white shadow-[0_4px_12px_-4px_rgba(29,58,84,0.5)]' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2.3 : 1.8} />
                      <span className={`text-[9.5px] leading-none font-semibold ${isActive ? 'font-bold' : ''}`}>{label}</span>
                    </button>
                  )
                })}
              </div>
            </nav>
          </div>
        </div>
      </div>

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg z-[90] pointer-events-none whitespace-nowrap">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
