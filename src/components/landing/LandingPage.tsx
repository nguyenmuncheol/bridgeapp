'use client'

import { Church, Info, Clock3, Users, Heart, Mail, Phone, LogIn, ArrowRight } from 'lucide-react'
import { KAKAO_OPEN_CHAT_URL } from '../../lib/mockData'
import { CHURCH_INFO, VISION_SECTIONS, CORE_MINISTRIES, PASTOR, DEPARTMENTS } from '../../lib/churchInfo'
import PwaInstallButton from '../PwaInstallButton'

interface LandingPageProps {
  /** 로그인/가입하기 — 인증 모달을 열면서 랜딩을 넘어갑니다 */
  onLogin: () => void
  /** 그냥 둘러보기 — 로그인 없이 지금 앱 화면(방문자용 홈)으로 들어갑니다 */
  onBrowse: () => void
}

/**
 * 앱을 설치하지 않고 브라우저로 처음 들어온 방문자에게 보여주는 랜딩페이지.
 *
 * 이미 홈 화면에 설치했거나 로그인된 성도는 이 화면을 거치지 않고 곧장
 * 지금 쓰던 앱 화면으로 들어갑니다 (app/page.tsx에서 분기).
 *
 * 내용은 전부 HomeTab의 방문자용 소개 + ChurchGuideModal과 같은 원본
 * (src/lib/churchInfo.ts)을 그대로 재사용합니다 — 새로 쓴 문구가 아닙니다.
 */
export default function LandingPage({ onLogin, onBrowse }: LandingPageProps) {
  return (
    <div className="bg-[#f7f9ff] min-h-screen w-full max-w-lg md:max-w-xl mx-auto relative border-x border-gray-200/60 shadow-md md:shadow-xl font-sans">
      {/* 히어로 */}
      <div className="bg-gradient-to-br from-[#335f87] via-[#2c5378] to-[#1d3a54] text-white px-6 pt-10 pb-8 space-y-3 text-center">
        <img src="/logo-wide.png" alt="더브릿지교회" className="h-14 w-auto mx-auto brightness-0 invert" />
        <div className="flex items-center justify-center gap-2 text-blue-200 text-2xs font-bold tracking-widest uppercase">
          <Church size={14} /> The Bridge Church
        </div>
        <h1 className="text-xl font-black leading-snug pt-1">더브릿지 교회에 오신 것을 환영합니다</h1>
        <p className="text-xs text-blue-100 leading-relaxed italic whitespace-pre-line">{CHURCH_INFO.vision}</p>
      </div>

      <div className="p-4 space-y-4 pb-10">
        {/* 소개 + 오시는 길 */}
        <section className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{CHURCH_INFO.intro}</p>
          <div className="bg-[#f7f9ff] p-3.5 rounded-xl border border-blue-50 space-y-2.5">
            <div className="flex items-start gap-1.5">
              <span className="text-sm shrink-0">📍</span>
              <span className="text-xs font-bold text-gray-800 leading-relaxed whitespace-pre-line">{CHURCH_INFO.address}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-blue-100/60">
              <a href="https://maps.app.goo.gl/QmPUonpPZnpMxyum7" target="_blank" rel="noopener noreferrer"
                className="py-2 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1 shadow-2xs transition-all">
                🗺️ 지도 보기
              </a>
              <a href={KAKAO_OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer"
                className="py-2 bg-[#fee500] hover:bg-[#fada0a] text-[#191919] text-xs font-bold rounded-lg flex items-center justify-center gap-1 shadow-2xs transition-all">
                💬 카톡 오픈채팅
              </a>
            </div>
          </div>
        </section>

        {/* 로그인 / 둘러보기 CTA — 소개 바로 아래에서 다음 행동을 정하게 합니다 */}
        <section className="grid grid-cols-1 gap-2">
          <button onClick={onLogin}
            className="w-full py-3.5 bg-[#335f87] hover:bg-[#2b5072] text-white text-sm font-bold rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
            <LogIn size={16} /> 로그인 / 가입하기
          </button>
          <button onClick={onBrowse}
            className="w-full py-2.5 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-all">
            그냥 둘러보기 <ArrowRight size={13} />
          </button>
        </section>

        {/* 비전 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <h2 className="font-black text-sm text-gray-900 flex items-center gap-1.5"><Info size={15} className="text-[#335f87]" /> 우리 교회는요</h2>
          {VISION_SECTIONS.map((section, si) => (
            <div key={section.title} className="space-y-2">
              <h5 className="font-black text-xs text-gray-900 flex items-center gap-1.5">
                <span className="w-5 h-5 shrink-0 rounded-full bg-[#335f87] text-white text-2xs font-black flex items-center justify-center">{si + 1}</span>
                {section.title}
              </h5>
              <ul className="space-y-1.5 pl-1">
                {section.items.map((text, ii) => (
                  <li key={ii} className="flex gap-2 items-start">
                    <span className="mt-[3px] shrink-0 w-[18px] h-[18px] rounded-md bg-blue-50 text-[#335f87] text-2xs font-bold flex items-center justify-center">{ii + 1}</span>
                    <p className="text-xs text-gray-700 leading-relaxed flex-1">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="space-y-2">
            <h5 className="font-black text-xs text-gray-900 flex items-center gap-1.5">
              <span className="w-5 h-5 shrink-0 rounded-full bg-[#335f87] text-white text-2xs font-black flex items-center justify-center">{VISION_SECTIONS.length + 1}</span>
              우리의 핵심사역
            </h5>
            <div className="space-y-2">
              {CORE_MINISTRIES.map((m, i) => (
                <div key={m.name} className="p-3 bg-gray-50 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-[18px] h-[18px] shrink-0 rounded-md bg-white border border-gray-200 text-[#335f87] text-2xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="font-bold text-gray-900 text-xs">{m.name}</span>
                  </div>
                  <p className="text-2xs text-gray-600 leading-relaxed pl-[26px]">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 사역자 소개 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h2 className="font-black text-sm text-gray-900 flex items-center gap-1.5"><Heart size={15} className="text-rose-500" /> 사역자 소개</h2>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xs font-bold text-[#335f87] bg-white border border-blue-100 px-1.5 py-0.5 rounded">{PASTOR.role}</span>
                <span className="font-black text-sm text-gray-900">{PASTOR.name}</span>
              </div>
              <div className="mt-2 space-y-1">
                <a href={`mailto:${PASTOR.email}`} className="flex items-center gap-1.5 text-2xs text-gray-600 hover:text-[#335f87]">
                  <Mail size={12} className="shrink-0 text-gray-400" /> {PASTOR.email}
                </a>
                <a href={`tel:${PASTOR.phone}`} className="flex items-center gap-1.5 text-2xs text-gray-600 hover:text-[#335f87]">
                  <Phone size={12} className="shrink-0 text-gray-400" /> {PASTOR.phone}
                </a>
              </div>
            </div>
            <p className="px-4 py-3 text-xs text-gray-700 leading-relaxed">{PASTOR.bio}</p>
          </div>
        </section>

        {/* 예배 & 부서 안내 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div className="space-y-2">
            <h5 className="font-bold text-xs text-gray-900 flex items-center gap-1"><Clock3 size={14} className="text-[#335f87]" /> 주일 및 주중 예배 안내</h5>
            <div className="p-2.5 bg-blue-50/60 rounded-xl flex justify-between items-center text-xs">
              <span className="font-bold text-gray-800">주일 예배</span>
              <div className="text-right"><p className="font-bold text-[#335f87]">일요일 11:00 AM</p><p className="text-2xs text-gray-400">대예배실</p></div>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <h5 className="font-bold text-xs text-gray-900 flex items-center gap-1"><Users size={14} className="text-emerald-600" /> 교회 부서 안내</h5>
            <div className="space-y-2">
              {DEPARTMENTS.map((dept, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-xl space-y-1 text-xs">
                  <span className="font-bold text-gray-800">{dept.name}</span>
                  <p className="text-2xs text-gray-500">{dept.time} ({dept.loc})</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 홈 화면 추가 안내 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          <h2 className="font-black text-sm text-gray-900">📱 앱처럼 편하게 쓰기</h2>
          <p className="text-2xs text-gray-500 leading-relaxed">홈 화면에 추가하면 아이콘 하나로 바로 열리고, 다음부터는 이 소개 화면 없이 곧장 앱으로 들어갑니다.</p>
          <PwaInstallButton />
          <div className="p-3 bg-blue-50/50 rounded-xl space-y-1">
            <span className="font-bold text-[#335f87] text-xs">아이폰 (Safari)</span>
            <p className="text-gray-600 text-2xs">하단 공유 버튼(공유 아이콘) 클릭 ➔ &apos;홈 화면에 추가&apos; 선택</p>
          </div>
        </section>

        <button onClick={onLogin}
          className="w-full py-3.5 bg-[#335f87] hover:bg-[#2b5072] text-white text-sm font-bold rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
          <LogIn size={16} /> 로그인 / 가입하기
        </button>
      </div>
    </div>
  )
}
