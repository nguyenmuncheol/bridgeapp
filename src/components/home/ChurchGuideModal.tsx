'use client'

import { useState } from 'react'
import { X, Church, Clock3, Users, Heart, Mail, Phone } from 'lucide-react'

interface ChurchGuideModalProps {
  onClose: () => void
}

/** 비전 화면에 단계별로 보여줄 내용 (글은 그대로, 보이는 모양만 정리했습니다) */
const VISION_SECTIONS: { title: string; items: string[] }[] = [
  {
    title: '우리의 비전은 심플해요',
    items: [
      '하나님에게서 멀리 떨어진 자들을 가까이 오게 하는 것입니다.',
      '방법은 계속 변화할 것입니다.',
      '기존 성도들이 불편함을 느끼더라도 우리는 하나님에게서 멀리 떨어진 사람들을 위해 계속 변화할 것입니다.',
    ],
  },
  {
    title: '우리 사역의 방향',
    items: [
      '죽은 것 같은 잠든 것 같은 신앙이 아니라 살아있는 신앙을 갖도록 돕습니다.',
      '하나님 나라 백성의 분명한 정체성을 가지고 모든 삶의 하나님의 주권을 인정하는 삶을 살도록 합니다.',
      '우리는 가정을 소중히 여기며 행복과 회복을 돕습니다.',
      '우리는 성령의 역사와 변화를 믿으며 이 변화에 동참하도록 돕습니다.',
    ],
  },
  {
    title: '우리의 목적',
    items: [
      '20-40세대에 집중합니다.',
      '새신자에 집중합니다.',
      '복음을 알고 전하며 이웃의 구원에 집중합니다.',
      '성령께서 만드신 진실한 공동체에 집중합니다.',
      '다음세대들이 교회오기를 좋아하는 것에 집중합니다.',
    ],
  },
]

/** 핵심사역은 "제목 : 설명" 구조라 따로 둡니다 */
const CORE_MINISTRIES: { name: string; desc: string }[] = [
  { name: '본질적인 예배', desc: '하나님을 만나는 역동과 자유가 있는 예배를 추구합니다.' },
  { name: '역동적인 공동체', desc: '하나님을 담는 공동체 · 일상속 신앙나눔 · 진심어린 돌봄 · 새신자 정착을 돕는 공동체' },
  { name: '복음 전도 사역', desc: '믿는 자들의 제자화 훈련을 통한 복음 전도 사역 (목적이 있는 삶)' },
  { name: '다음세대 신앙잇기', desc: '아이들의 웃음이 있는 교회 · 부모의 신앙을 본 받는 교회' },
]

const PASTOR = {
  role: '전임목사',
  name: '정제호',
  email: 'jehojung88@gmail.com',
  phone: '0969388213',
  bio: '1975년에 태어나 성결대 신학과와 성결신학대학원을 졸업하고, 목사안수를 받았다. 안양 밝은빛교회와 등촌제일교회, 인천복된교회에서 청년부와 교육목사로 섬겼고, 굿네이버스 아동보호전문기관, 스리랑카 예수전도단 DTS와 간사, 제주열방대학 SOIWSW 수료 후 2015년 베트남 하노이로 이주하여 2018년부터 하노이 더브릿지 교회에서 전임목사로 사역하고 있다.',
}

/**
 * 실제로 운영 중인 부서만 적습니다.
 * (출석체크의 교회학교 그룹은 영아부·초등부까지 미리 만들어 두었지만,
 *  지금 모이는 부서는 아래 두 곳뿐이라 안내에는 이 둘만 보여줍니다)
 */
const DEPARTMENTS = [
  { name: '유아·유치부', time: '매주 일요일 오전 11:00', loc: '유아·유치부실' },
  { name: '중고등부', time: '매주 일요일 오전 11:00', loc: '중고등부실' },
]

export default function ChurchGuideModal({ onClose }: ChurchGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'vision' | 'pastor' | 'guide'>('vision')

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden max-h-[85vh] flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="bg-[#335f87] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Church size={18} className="text-blue-200" />
            <h3 className="font-bold text-sm">더브릿지 교회 상세 안내</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-all">
            <X size={18} />
          </button>
        </div>

        {/* 서브탭 3개: 비전 | 사역자 소개 | 예배/부서 */}
        <div className="flex bg-gray-100 p-1 border-b border-gray-200 text-xs font-bold">
          <button
            onClick={() => setActiveTab('vision')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              activeTab === 'vision' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'
            }`}
          >
            🌟 비전
          </button>
          <button
            onClick={() => setActiveTab('pastor')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              activeTab === 'pastor' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'
            }`}
          >
            🙋 사역자 소개
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              activeTab === 'guide' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'
            }`}
          >
            🏫 예배/부서
          </button>
        </div>

        {/* 본문 콘텐츠 */}
        <div className="p-5 overflow-y-auto flex-1 text-xs space-y-4">
          {/* 1. 비전 */}
          {activeTab === 'vision' && (
            <div className="space-y-4">
              {VISION_SECTIONS.map((section, si) => (
                <div key={section.title} className="space-y-2">
                  <h5 className="font-black text-sm text-gray-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-[#335f87] text-white text-[10px] font-black flex items-center justify-center">
                      {si + 1}
                    </span>
                    {section.title}
                  </h5>
                  <ul className="space-y-1.5 pl-1">
                    {section.items.map((text, ii) => (
                      <li key={ii} className="flex gap-2 items-start">
                        <span className="mt-[3px] shrink-0 w-[18px] h-[18px] rounded-md bg-blue-50 text-[#335f87] text-[10px] font-bold flex items-center justify-center">
                          {ii + 1}
                        </span>
                        <p className="text-[12px] text-gray-700 leading-relaxed flex-1">{text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* 핵심사역 — 제목 + 설명 구조라 카드로 보여줍니다 */}
              <div className="space-y-2">
                <h5 className="font-black text-sm text-gray-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-[#335f87] text-white text-[10px] font-black flex items-center justify-center">
                    {VISION_SECTIONS.length + 1}
                  </span>
                  우리의 핵심사역
                </h5>
                <div className="space-y-2">
                  {CORE_MINISTRIES.map((m, i) => (
                    <div key={m.name} className="p-3 bg-gray-50 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-[18px] h-[18px] shrink-0 rounded-md bg-white border border-gray-200 text-[#335f87] text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="font-bold text-gray-900 text-[12px]">{m.name}</span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-relaxed pl-[26px]">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. 사역자 소개 */}
          {activeTab === 'pastor' && (
            <div className="space-y-4">
              {/* Our Pastor */}
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5">
                  <Heart size={13} className="text-rose-500 shrink-0" />
                  <span className="text-[10px] font-bold text-[#335f87] tracking-widest uppercase">Our Pastor</span>
                </div>
                <p className="text-[12px] text-gray-700 leading-relaxed">
                  교회의 비전은 당신이 구원받은 목적을 발견하고, 하나님이 당신을 위해 창조하신 인생을 살도록 하는 것입니다.
                  담임목사님은 사람들을 향한 하나님의 목적과 예수님의 사랑이 담긴 메시지를 전하고 있습니다.
                </p>
              </div>

              {/* 전임목사 프로필 */}
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-bold text-[#335f87] bg-white border border-blue-100 px-1.5 py-0.5 rounded">
                      {PASTOR.role}
                    </span>
                    <span className="font-black text-sm text-gray-900">{PASTOR.name}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <a
                      href={`mailto:${PASTOR.email}`}
                      className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-[#335f87]"
                    >
                      <Mail size={12} className="shrink-0 text-gray-400" />
                      {PASTOR.email}
                    </a>
                    <a
                      href={`tel:${PASTOR.phone}`}
                      className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-[#335f87]"
                    >
                      <Phone size={12} className="shrink-0 text-gray-400" />
                      {PASTOR.phone}
                    </a>
                  </div>
                </div>
                <p className="px-4 py-3 text-[12px] text-gray-700 leading-relaxed">{PASTOR.bio}</p>
              </div>
            </div>
          )}

          {/* 3. 예배 & 부서 안내 */}
          {activeTab === 'guide' && (
            <div className="space-y-4">
              {/* 예배시간 */}
              <div className="space-y-2">
                <h5 className="font-bold text-gray-900 flex items-center gap-1">
                  <Clock3 size={14} className="text-[#335f87]" /> 주일 및 주중 예배 안내
                </h5>
                <div className="space-y-1.5">
                  <div className="p-2.5 bg-blue-50/60 rounded-xl flex justify-between items-center">
                    <span className="font-bold text-gray-800">주일 예배</span>
                    <div className="text-right"><p className="font-bold text-[#335f87]">일요일 11:00 AM</p><p className="text-[10px] text-gray-400">대예배실</p></div>
                  </div>
                </div>
              </div>

              {/* 교회 부서 */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <h5 className="font-bold text-gray-900 flex items-center gap-1">
                  <Users size={14} className="text-emerald-600" /> 교회 부서 안내
                </h5>
                <div className="space-y-2">
                  {DEPARTMENTS.map((dept, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-xl space-y-1">
                      <span className="font-bold text-gray-800">{dept.name}</span>
                      <p className="text-[11px] text-gray-500">{dept.time} ({dept.loc})</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-xs transition-all">
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
