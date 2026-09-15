'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Church, Megaphone, FileText, CreditCard, Info, ChevronRight,
  LogIn, Copy, Check, Bell, Home, Newspaper, Heart, ClipboardList, User,
  Sparkles, MapPin, MessageCircle,
} from 'lucide-react'

/**
 * 홈 화면 리디자인 데모 — 실제 서비스에는 연결되지 않은 미리보기 전용 페이지입니다.
 * (app/page.tsx, HomeTab.tsx 등 기존 파일은 전혀 건드리지 않았습니다)
 */

// 화면에 30% 들어오면 한 번만 살짝 떠오르는 연출. prefers-reduced-motion이면 motion-reduce:로 즉시 정지.
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
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

const CHURCH_INFO = {
  vision:
    '하나님이 그 아들을 세상에 보내신 것은\n세상을 심판하려 하심이 아니요 그로 말미암아\n세상이 구원을 받게 하려 하심이라\n— 요한복음 3:17 —',
  intro: '더브릿지 교회는 하노이에서 함께 예배하며\n말씀 안에서 자라가는 교회 공동체입니다.',
  address: '골든펠리스 지하1층 달팽이카페 (K-Mart 안쪽)',
  serviceTime: '주일 오전 11:00',
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
  '차갑던 배경(f7f9ff)을 따뜻한 중립 톤(slate)으로 정리하고, 카드마다 다르던 그림자를 하나의 톤으로 통일했습니다.',
  '환영 섹션에 실제 사진 자리를 마련했습니다 (지금은 예시 사진, 교회 사진으로 교체하면 됩니다).',
  '제목·부제 크기 차이를 키워 한눈에 위계를 읽히게 했고, 버튼은 누를 때 살짝 눌리는 느낌을 추가했습니다.',
  '기존 화면 구조·문구·기능은 그대로 두었습니다 — 색과 간격, 타이포그래피만 다듬은 "보존형" 리디자인입니다.',
]

export default function RedesignDemoPage() {
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
      {/* ── 데모 전용 상단 바 (실제 서비스 UI 아님) ── */}
      <div className="sticky top-0 z-[80] bg-slate-900 text-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles size={14} className="text-amber-300" />
            홈 화면 리디자인 데모 v1 · 보존형
            <a href="/demo/v2" className="ml-2 text-2xs font-bold text-blue-300 hover:text-blue-200 underline underline-offset-2">
              v2(과감한 트렌드) 보기
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

      {/* ── 무엇이 바뀌었나 요약 ── */}
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

      {/* ── 실제 폰 화면 미리보기 ── */}
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-md bg-[#faf9f7] rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="bg-white/90 backdrop-blur-md px-5 py-2.5 border-b border-slate-100 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-[#335f87] text-white flex items-center justify-center shrink-0">
                <Church size={18} />
              </span>
              <span className="text-sm font-black text-slate-900 tracking-tight">더브릿지교회</span>
            </div>

            {isGuest ? (
              <button className="px-3.5 py-2 bg-[#335f87] hover:bg-[#2b5072] active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer">
                <LogIn size={13} /> 로그인
              </button>
            ) : (
              <button className="relative flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full pl-1 pr-3 py-1 transition-all cursor-pointer">
                <span className="w-6 h-6 rounded-full bg-[#335f87] text-white flex items-center justify-center text-2xs font-bold">임</span>
                <span className="text-2xs font-semibold text-slate-700">임혜영 님</span>
                <Bell size={13} className="text-slate-400" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">2</span>
              </button>
            )}
          </div>

          <main className="p-4 space-y-4 pb-8">
            {/* 1. 환영 섹션 — 사진 배경 + 오버레이 */}
            <Reveal>
              <section className="relative rounded-3xl overflow-hidden shadow-[0_4px_18px_-6px_rgba(30,58,90,0.35)]">
                <img
                  src="https://picsum.photos/seed/thebridge-hanoi-worship/900/650"
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wide bg-black/40 text-white/90 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  예시 사진
                </span>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f2032]/95 via-[#1d3a54]/75 to-[#1d3a54]/30" />
                <div className="relative p-6 pt-8 text-white space-y-2">
                  {isGuest ? (
                    <>
                      <p className="text-2xs font-bold text-blue-200 tracking-widest uppercase">The Bridge Church</p>
                      <h1 className="text-2xl font-black leading-tight tracking-tight">
                        더브릿지 교회에<br />오신 것을 환영합니다
                      </h1>
                      <p className="text-xs text-blue-100/90 leading-relaxed italic whitespace-pre-line pt-1">
                        {CHURCH_INFO.vision}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xs font-bold text-blue-200 tracking-wider">더브릿지 공동체</p>
                      <h1 className="text-xl font-black leading-tight tracking-tight">임혜영 님, 환영합니다 🙏</h1>
                      <p className="text-xs text-blue-100/90 leading-relaxed pt-1">
                        오늘도 주님의 평안과 은혜가 가득하시길 기도합니다.
                      </p>
                    </>
                  )}
                </div>
              </section>
            </Reveal>

            {/* 게스트 전용: 소개 + 주소 */}
            {isGuest && (
              <Reveal delay={80}>
                <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{CHURCH_INFO.intro}</p>
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2.5">
                    <div className="flex items-start gap-1.5">
                      <MapPin size={15} className="text-[#335f87] shrink-0 mt-0.5" />
                      <span className="text-xs font-semibold text-slate-800 leading-relaxed">{CHURCH_INFO.address}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-200/70">
                      <button className="py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 active:scale-[0.98] flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                        <MapPin size={13} /> 지도 보기
                      </button>
                      <button className="py-2.5 bg-[#FEE500] hover:bg-[#fada0a] active:scale-[0.98] text-[#3C1E1E] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                        <MessageCircle size={13} /> 카톡 문의
                      </button>
                    </div>
                  </div>
                  <button className="w-full py-3 bg-[#335f87] hover:bg-[#2b5072] active:scale-[0.98] text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer">
                    <Info size={14} /> 교회 안내 보기 <ChevronRight size={14} />
                  </button>
                </section>
              </Reveal>
            )}

            {/* 2. 공지사항 */}
            <Reveal delay={120}>
              <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#335f87] flex items-center justify-center shrink-0">
                    <Megaphone size={16} />
                  </span>
                  <h2 className="font-bold text-slate-900 text-sm">교회 공지사항</h2>
                </div>
                <div className="space-y-2">
                  {DEMO_NOTICES.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => showToast(n.title)}
                      className="w-full text-left bg-slate-50 hover:bg-slate-100 active:scale-[0.99] p-3.5 rounded-2xl border border-slate-100 transition-all cursor-pointer space-y-0.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xs font-bold text-[#335f87] bg-blue-50 px-2 py-0.5 rounded-md shrink-0">{n.tag}</span>
                        <h3 className="font-bold text-xs text-slate-800 line-clamp-1">{n.title}</h3>
                      </div>
                      <p className="text-2xs text-slate-400 line-clamp-2 leading-relaxed mt-0.5">{n.content}</p>
                    </button>
                  ))}
                </div>
              </section>
            </Reveal>

            {/* 3. 이번 주 주보 */}
            <Reveal delay={160}>
              <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                      <FileText size={16} />
                    </span>
                    <h2 className="font-bold text-slate-900 text-sm">이번 주 주보</h2>
                  </div>
                  <span className="text-2xs text-slate-400 font-medium">{DEMO_BULLETIN.date}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 text-sm leading-snug">{DEMO_BULLETIN.title}</h3>
                    <span className="text-2xs text-[#335f87] bg-blue-50 font-semibold px-2.5 py-0.5 rounded-full shrink-0">{DEMO_BULLETIN.preacher}</span>
                  </div>
                  <p className="text-xs text-amber-800 font-semibold">{DEMO_BULLETIN.passage}</p>
                  <p className="text-xs text-slate-600 leading-relaxed pt-1.5 border-t border-slate-200/60">{DEMO_BULLETIN.summary}</p>
                </div>
                <button
                  onClick={() => showToast('주보 전체보기 (데모)')}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 text-xs font-bold rounded-2xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  주보 전체보기 <ChevronRight size={14} />
                </button>
              </section>
            </Reveal>

            {/* 4. 온라인 헌금 (성도 전용) */}
            {!isGuest && (
              <Reveal delay={200}>
                <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <CreditCard size={16} />
                    </span>
                    <h2 className="font-bold text-slate-900 text-sm">온라인 헌금 안내</h2>
                  </div>
                  <div className="flex items-center justify-between bg-emerald-50/60 border border-emerald-100 p-3.5 rounded-2xl gap-2">
                    <span className="font-mono text-xs font-bold text-slate-800 leading-relaxed">
                      우리은행 100-100-299503
                      <br />
                      <span className="text-2xs font-sans font-semibold text-slate-500">(예금주 : 임혜영 / LimHyeYoung)</span>
                    </span>
                    <button
                      onClick={handleCopyAccount}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer active:scale-95 ${
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

          {/* 하단 네비게이션 (시각 미리보기, 홈만 활성) */}
          <nav className="bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-1px_8px_rgba(15,23,42,0.04)]">
            <div className="flex items-stretch">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const isActive = id === 'home'
                return (
                  <button
                    key={id}
                    onClick={() => !isActive && showToast('데모에서는 홈 화면만 미리볼 수 있어요')}
                    className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 min-w-0 transition-all cursor-pointer ${
                      isActive ? 'text-[#335f87]' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <div className={`flex items-center justify-center rounded-xl transition-all ${isActive ? 'bg-blue-50 p-1.5' : 'p-1.5'}`}>
                      <Icon size={19} strokeWidth={isActive ? 2.5 : 1.8} />
                    </div>
                    <span className={`text-[10px] leading-none font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
                  </button>
                )
              })}
            </div>
          </nav>
        </div>
      </div>

      {/* 데모 토스트 */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg z-[90] pointer-events-none whitespace-nowrap">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
