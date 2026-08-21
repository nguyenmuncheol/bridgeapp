'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ArrowRight } from 'lucide-react'

interface LandingPageProps {
  /** 마지막 섹션까지 스크롤했거나 버튼을 눌렀을 때 — 실제 앱 화면으로 전환합니다 */
  onEnter: () => void
}

type RevealDirection = 'left' | 'right' | 'up' | 'scale'

/**
 * 사진 배경 위 텍스트가 스크롤에 맞춰 좌/우/확대로 나타나는 래퍼.
 * 화면에 30% 이상 들어오면 한 번만 애니메이션을 재생합니다.
 */
function Reveal({
  children,
  from = 'up',
  delay = 0,
  className = '',
}: {
  children: ReactNode
  from?: RevealDirection
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
      { threshold: 0.3 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const hidden =
    from === 'left' ? '-translate-x-12 opacity-0'
    : from === 'right' ? 'translate-x-12 opacity-0'
    : from === 'scale' ? 'scale-90 opacity-0'
    : 'translate-y-8 opacity-0'

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${shown ? 'translate-x-0 translate-y-0 scale-100 opacity-100' : hidden} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}

/**
 * 풀스크린 사진 배경 섹션. 사진은 아직 placeholder 그라데이션이며,
 * gradient 값만 실제 이미지 url로 바꾸면(예: `url(...) center/cover`) 그대로 교체됩니다.
 * 뷰포트에 들어와 있는 동안만 스크롤에 따라 배경을 살짝 확대·이동시킵니다(패럴랙스,
 * 저사양 폰을 배려해 화면 밖에서는 스크롤 리스너를 붙이지 않습니다).
 */
function PhotoSection({
  gradient,
  children,
  isLast = false,
  onFullyVisible,
}: {
  gradient: string
  children: ReactNode
  isLast?: boolean
  onFullyVisible?: () => void
}) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 마지막 섹션이 화면을 채운 채로 잠깐 머물면 자동으로 앱으로 넘어갑니다.
  useEffect(() => {
    if (!isLast || !inView) return
    const t = setTimeout(() => onFullyVisible?.(), 1300)
    return () => clearTimeout(t)
  }, [isLast, inView, onFullyVisible])

  useEffect(() => {
    if (!inView) return
    let raf = 0
    const update = () => {
      const el = sectionRef.current
      const bg = bgRef.current
      if (!el || !bg) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      const centerOffset = (rect.top + rect.height / 2 - vh / 2) / vh
      bg.style.transform = `scale(1.15) translateY(${centerOffset * 36}px)`
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [inView])

  return (
    <section ref={sectionRef} className="relative min-h-screen w-full flex items-center justify-center overflow-hidden">
      <div ref={bgRef} className="absolute inset-0 will-change-transform" style={{ background: gradient, transform: 'scale(1.15)' }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/70" />
      <div className="relative z-10 w-full max-w-lg mx-auto px-7">{children}</div>
    </section>
  )
}

// 실제 교회 사진이 준비되기 전까지 쓰는 placeholder 배경. 어둡게 깔아 흰 글씨가 항상 잘 보입니다.
const GRADIENTS = [
  'radial-gradient(circle at 30% 20%, #3d6d99 0%, #1d3a54 60%, #10202f 100%)',
  'radial-gradient(circle at 70% 30%, #335f87 0%, #1d3a54 55%, #0f1e2c 100%)',
  'radial-gradient(circle at 40% 70%, #2c5378 0%, #17293b 60%, #0c1620 100%)',
  'radial-gradient(circle at 60% 20%, #3d6d99 0%, #1a3349 55%, #0d1a26 100%)',
  'radial-gradient(circle at 50% 60%, #335f87 0%, #182b3d 60%, #0b1620 100%)',
  'radial-gradient(circle at 50% 40%, #2c5378 0%, #14232f 60%, #0a141c 100%)',
]

export default function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="w-full max-w-lg md:max-w-xl mx-auto relative font-sans text-white">
      {/* 1. 히어로 */}
      <PhotoSection gradient={GRADIENTS[0]}>
        <div className="text-center space-y-5">
          <img src="/logo-wide.png" alt="더브릿지교회" className="h-14 w-auto mx-auto brightness-0 invert" />
          <Reveal from="scale" delay={150}>
            <p className="text-2xs font-bold tracking-[0.25em] text-blue-200 uppercase">The Bridge Church</p>
          </Reveal>
          <Reveal from="up" delay={300}>
            <h1 className="text-2xl font-black leading-snug">더브릿지 교회에<br />오신 것을 환영합니다</h1>
          </Reveal>
          <Reveal from="up" delay={500}>
            <p className="text-xs text-blue-100 leading-relaxed italic">
              &ldquo;진리를 알지니 진리가 너희를<br />자유롭게 하리라&rdquo; — 요한복음 8:32
            </p>
          </Reveal>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown size={22} className="text-white/70" />
        </div>
      </PhotoSection>

      {/* 2. 소개 훅 */}
      <PhotoSection gradient={GRADIENTS[1]}>
        <div className="space-y-4">
          <Reveal from="left"><p className="text-2xs font-bold tracking-widest text-blue-200 uppercase">Welcome</p></Reveal>
          <Reveal from="left" delay={150}>
            <h2 className="text-xl font-black leading-snug">
              하나님에게서 멀리 떨어진 자들을<br />가까이 오게 하는 교회
            </h2>
          </Reveal>
          <Reveal from="left" delay={300}>
            <p className="text-sm text-blue-50/90 leading-relaxed">
              하노이에서 함께 예배하며<br />말씀 안에서 자라가는 공동체입니다
            </p>
          </Reveal>
        </div>
      </PhotoSection>

      {/* 3. 우리의 목적 */}
      <PhotoSection gradient={GRADIENTS[2]}>
        <div className="space-y-6">
          <Reveal from="right"><p className="text-2xs font-bold tracking-widest text-blue-200 uppercase">Our Purpose</p></Reveal>
          <div className="space-y-4">
            {[
              '새신자를 진심으로 환영합니다',
              '복음을 전하며 이웃의 구원에 집중합니다',
              '다음세대가 오고 싶은 교회를 만듭니다',
            ].map((text, i) => (
              <Reveal key={text} from="right" delay={150 + i * 150}>
                <p className="text-lg font-bold leading-snug flex items-start gap-2">
                  <span className="text-blue-300">0{i + 1}</span>
                  <span>{text}</span>
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </PhotoSection>

      {/* 4. 핵심가치 */}
      <PhotoSection gradient={GRADIENTS[3]}>
        <div className="space-y-5">
          <Reveal from="up"><p className="text-2xs font-bold tracking-widest text-blue-200 uppercase text-center">What We Value</p></Reveal>
          {[
            { name: '본질적인 예배', desc: '하나님을 만나는 자유가 있는 예배' },
            { name: '역동적인 공동체', desc: '일상 속 신앙 나눔과 진심어린 돌봄' },
            { name: '다음세대 신앙잇기', desc: '아이들의 웃음이 있는 교회' },
          ].map((v, i) => (
            <Reveal key={v.name} from={i % 2 === 0 ? 'left' : 'right'} delay={i * 150}>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3.5">
                <p className="font-black text-sm">{v.name}</p>
                <p className="text-xs text-blue-50/80 mt-1">{v.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </PhotoSection>

      {/* 5. 예배시간 · 위치 */}
      <PhotoSection gradient={GRADIENTS[4]}>
        <div className="text-center space-y-6">
          <Reveal from="up"><p className="text-2xs font-bold tracking-widest text-blue-200 uppercase">Join Us</p></Reveal>
          <Reveal from="scale" delay={150}>
            <div className="space-y-1">
              <p className="text-3xl font-black">주일 오전 11:00</p>
              <p className="text-xs text-blue-100">매주 일요일 · 대예배</p>
            </div>
          </Reveal>
          <Reveal from="up" delay={300}>
            <p className="text-xs text-blue-50/90 leading-relaxed">
              📍 미딩 골든펠리스 지하1층 달팽이카페<br />(K-Mart 안쪽)
            </p>
          </Reveal>
        </div>
      </PhotoSection>

      {/* 6. 마무리 */}
      <PhotoSection gradient={GRADIENTS[5]} isLast onFullyVisible={onEnter}>
        <div className="text-center space-y-6">
          <Reveal from="scale">
            <h2 className="text-xl font-black leading-snug">
              이제, 더브릿지 교회를<br />직접 만나보세요
            </h2>
          </Reveal>
          <Reveal from="up" delay={200}>
            <button
              onClick={onEnter}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#1d3a54] text-sm font-bold rounded-2xl shadow-lg active:scale-[0.97] transition-transform"
            >
              홈페이지로 이동 <ArrowRight size={16} />
            </button>
          </Reveal>
        </div>
      </PhotoSection>
    </div>
  )
}
