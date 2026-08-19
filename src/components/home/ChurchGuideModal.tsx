'use client'

import { useState } from 'react'
import { X, Church, Clock3, Users, Award, Heart, BookOpen } from 'lucide-react'

interface ChurchGuideModalProps {
  onClose: () => void
}

export default function ChurchGuideModal({ onClose }: ChurchGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'vision' | 'history' | 'guide'>('vision')

  const CHURCH_HISTORY = [
    { year: '2022', title: '더브릿지교회 창립 예배', desc: '베트남 하노이 미딩에서 성도 12명으로 첫 예약예배 시작' },
    { year: '2023', title: '라브리(소그룹) 공동체 출범', desc: '삶과 기도를 나누는 3개 라브리 소그룹 정식 결성' },
    { year: '2024', title: '지역 사회 섬김 및 선교지 지원', desc: '현지 베트남 아동 후원 및 한국어 교실 봉사 개설' },
    { year: '2025', title: '전교인 수련회 및 비전 선포', desc: '하노이 및 근교 한인 성도 네트워크 다리 역할 확립' },
  ]

  const DEPARTMENTS = [
    { name: '유아부', time: '매주 일요일 오전 11:00', loc: '유아부실' },
    { name: '중고등부', time: '매주 일요일 오전 11:00', loc: '중고등부실' },
  ]

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

        {/* 서브탭 3개: 비전 | 연혁 | 교회안내 */}
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
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              activeTab === 'history' ? 'bg-white text-[#335f87] shadow-xs' : 'text-gray-500'
            }`}
          >
            📜 연혁
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
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-1.5 text-center">
                <span className="text-[10px] font-bold text-[#335f87] tracking-widest uppercase">Church Core Vision</span>
                <h4 className="font-black text-sm text-gray-900 leading-snug">"하나님과 사람, 사람과 사람을 잇는 공동체"</h4>
                <p className="text-[11px] text-gray-600 italic">"진리를 알지니 진리가 너희를 자유롭게 하리라" (요한복음 8:32)</p>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-gray-900 flex items-center gap-1">
                  <Heart size={14} className="text-rose-500" /> 3대 핵심 가치
                </h5>
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 rounded-xl space-y-0.5">
                    <span className="font-bold text-gray-800">1. 예배 (Worship)</span>
                    <p className="text-gray-600 text-[11px]">이국 땅 하노이에서 온 마음과 뜻을 다해 드리는 진실한 예배</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl space-y-0.5">
                    <span className="font-bold text-gray-800">2. 공동체 (Community)</span>
                    <p className="text-gray-600 text-[11px]">라브리(소그룹)를 통해 삶과 기도를 깊이 나누는 따뜻한 식구</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl space-y-0.5">
                    <span className="font-bold text-gray-800">3. 섬김 (Service)</span>
                    <p className="text-gray-600 text-[11px]">하노이 지역 사회와 선교 현장에 그리스도의 사랑을 흘려보냄</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. 연혁 */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <h5 className="font-bold text-gray-900 flex items-center gap-1">
                <Award size={14} className="text-amber-600" /> 더브릿지교회가 걸어온 길
              </h5>
              <div className="relative border-l-2 border-blue-200 pl-4 ml-2 space-y-4">
                {CHURCH_HISTORY.map((item, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[21px] top-0 w-3 h-3 bg-[#335f87] rounded-full border-2 border-white" />
                    <span className="font-mono font-black text-[#335f87] text-xs">{item.year}</span>
                    <h6 className="font-bold text-gray-800 text-xs mt-0.5">{item.title}</h6>
                    <p className="text-gray-500 text-[11px] mt-0.5">{item.desc}</p>
                  </div>
                ))}
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
