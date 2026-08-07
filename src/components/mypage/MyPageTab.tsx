'use client'

import { useState, useRef } from 'react'
import { Shield, Smartphone, ChevronDown, ChevronUp, Settings, MapPin, Ticket, Edit, X, CheckCircle2, Circle, MessageSquare } from 'lucide-react'
import { UserProfile, INITIAL_PRAYERS, INITIAL_MEAL_COUPONS, getUserDisplayName } from '../../lib/mockData'

interface MyPageTabProps {
  currentUser: UserProfile
  onNavigateAdmin: () => void
}

export default function MyPageTab({ currentUser, onNavigateAdmin }: MyPageTabProps) {
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editPhone, setEditPhone] = useState(currentUser.phone)
  const [editAddress, setEditAddress] = useState(currentUser.address || '')
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatarUrl || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 기도제목 상세 모달
  const [selectedPrayer, setSelectedPrayer] = useState<(typeof INITIAL_PRAYERS)[0] | null>(null)
  const [prayers, setPrayers] = useState(INITIAL_PRAYERS)
  const [commentInput, setCommentInput] = useState('')

  // 쿠폰 (현황만 표시)
  const familyId = currentUser.familyGroupId || `fam_single_${currentUser.id}`
  const couponAccount = INITIAL_MEAL_COUPONS[familyId] || { balance: 0, familyName: `${currentUser.name} 성도` }
  const [toastMsg, setToastMsg] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleToggleCompleted = (prayerId: string) => {
    setPrayers(prev => prev.map(p => p.id === prayerId ? { ...p, isCompleted: !p.isCompleted } : p))
    if (selectedPrayer) setSelectedPrayer(prev => prev ? { ...prev, isCompleted: !prev.isCompleted } : null)
  }

  const handleAddComment = () => {
    if (!commentInput.trim() || !selectedPrayer) return
    const updated = {
      ...selectedPrayer,
      comments: [...(selectedPrayer.comments || []), { id: `c_${Date.now()}`, authorName: currentUser.name, content: commentInput.trim(), createdAt: '방금 전' }]
    }
    setSelectedPrayer(updated)
    setPrayers(prev => prev.map(p => p.id === updated.id ? updated : p))
    setCommentInput('')
  }

  const myPrayers = prayers.filter(p => p.authorId === currentUser.id)

  return (
    <div className="space-y-4 pb-6">
      {toastMsg && <div className="fixed top-[88px] left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50">{toastMsg}</div>}

      {/* ── 프로필 카드 ── */}
      <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs space-y-4 relative">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => setShowEditModal(true)}
            className="w-16 h-16 rounded-full overflow-hidden bg-[#335f87] text-white flex items-center justify-center font-bold text-xl shrink-0 border-2 border-blue-100 shadow-xs hover:opacity-85 transition-all cursor-pointer relative group"
            title="프로필 사진 변경"
          >
            {avatarPreview
              ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" style={{ objectPosition: 'center center' }} />
              : currentUser.name.slice(0, 1)
            }
            <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 text-[10px] flex items-center justify-center text-white font-bold transition-all">📷 수정</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base text-gray-900">{getUserDisplayName(currentUser)}</h2>
              <span className="text-[10px] font-semibold bg-blue-50 text-[#335f87] px-2.5 py-0.5 rounded-full">{currentUser.role}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{currentUser.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 pt-2 border-t border-gray-100 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 p-2.5 rounded-xl flex items-start gap-2">
              <span className="text-sm mt-0.5">⛪</span>
              <div>
                <span className="text-gray-400 text-[10px]">소속 라브리</span>
                <p className="font-bold text-gray-800 text-[11px] mt-0.5">{currentUser.labriId || '미정 (모든 기능 이용 가능)'}</p>
              </div>
            </div>
            <div className="bg-gray-50 p-2.5 rounded-xl flex items-start gap-2">
              <Smartphone size={14} className="text-[#335f87] shrink-0 mt-1" />
              <div>
                <span className="text-gray-400 text-[10px]">연락처</span>
                <p className="font-bold text-gray-800 text-[11px] mt-0.5">{editPhone}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 p-2.5 rounded-xl flex items-start gap-2">
            <MapPin size={14} className="text-[#335f87] shrink-0 mt-1" />
            <div>
              <span className="text-gray-400 text-[10px]">거주지 주소</span>
              <p className="font-bold text-gray-800 text-[11px] mt-0.5">{editAddress || '주소 미입력'}</p>
            </div>
          </div>
          <div className="bg-amber-50/60 p-2.5 rounded-xl flex items-start gap-2 text-amber-900">
            <span className="text-sm mt-0.5">👨‍👩‍👧‍👦</span>
            <div>
              <span className="text-amber-700 text-[10px] font-bold">가족 연결 현황</span>
              <p className="font-bold text-[11px] mt-0.5">
                {currentUser.familyInfo || '독립 가구 (등록된 가족 연결 정보 없음)'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 관리자 전용: 관리자 대시보드 진입 버튼 ── */}
      {currentUser.role === 'ADMIN' && (
        <section>
          <button
            onClick={onNavigateAdmin}
            className="w-full bg-gradient-to-r from-[#1d3a54] to-[#335f87] text-white rounded-2xl p-4 shadow-sm flex items-center justify-between group hover:from-[#162d42] hover:to-[#2b5072] transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-lg">🛠️</span>
              <div className="text-left">
                <p className="font-bold text-sm">관리자 대시보드</p>
                <p className="text-[11px] text-blue-200 mt-0.5">출석 · 식수 · 가입승인 · 쿠폰 관리</p>
              </div>
            </div>
            <Shield size={18} className="text-blue-200 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </section>
      )}

      {/* ── 주일식사 쿠폰 ── */}

      <section className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-5 shadow-sm space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Ticket size={20} className="text-amber-100" />
            <div>
              <h3 className="font-bold text-sm">주일식사 쿠폰</h3>
              <p className="text-[11px] text-amber-100">{couponAccount.familyName}</p>
            </div>
          </div>
          <span className="text-2xl font-black">{couponAccount.balance}장</span>
        </div>
        
      </section>

      {/* ── 내 기도제목 모아보기 ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-gray-50">
          <h3 className="font-bold text-xs text-gray-900">🙏 내 기도제목 ({myPrayers.length})</h3>
        </div>
        <div className="p-4 space-y-2">
          {myPrayers.length > 0 ? myPrayers.map(p => (
            <div key={p.id} onClick={() => setSelectedPrayer(p)} className="p-3 bg-gray-50 rounded-xl flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-all">
              <div className="flex-1">
                <h4 className="font-bold text-xs text-gray-800 line-clamp-1">{p.title}</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">{p.createdAt}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ml-2 ${p.isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {p.isCompleted ? '응답 완료' : '기도 중'}
              </span>
            </div>
          )) : <p className="text-xs text-gray-400 text-center py-4">작성한 기도제목이 없습니다.</p>}
        </div>
      </section>

      {/* ── PWA 홈화면 추가 가이드 ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
        <button onClick={() => setAccordionOpen(!accordionOpen)} className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-all">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-[#335f87]" />
            <h3 className="font-bold text-xs text-gray-900">📱 홈 화면에 앱 추가하기 (PWA 가이드)</h3>
          </div>
          {accordionOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {accordionOpen && (
          <div className="p-4 pt-0 space-y-3 text-xs border-t border-gray-50">
            <div className="p-3 bg-blue-50/50 rounded-xl space-y-1">
              <span className="font-bold text-[#335f87]">아이폰 (Safari)</span>
              <p className="text-gray-600 text-[11px]">하단 공유 버튼(공유 아이콘) 클릭 ➔ &apos;홈 화면에 추가&apos; 선택</p>
            </div>
            <div className="p-3 bg-emerald-50/50 rounded-xl space-y-1">
              <span className="font-bold text-emerald-700">안드로이드 (Chrome)</span>
              <p className="text-gray-600 text-[11px]">우측 상단 메뉴(⋮) 클릭 ➔ &apos;앱 설치&apos; 또는 &apos;홈 화면에 추가&apos; 선택</p>
            </div>
          </div>
        )}
      </section>

      {/* ── 프로필 수정 모달 ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <h3 className="font-bold text-sm text-gray-900">✏️ 내 정보 & 프로필 수정</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-[#335f87] text-white flex items-center justify-center font-bold text-2xl border-2 border-blue-100 shadow-md">
                  {avatarPreview ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" /> : currentUser.name.slice(0, 1)}
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs">
                  📷 프로필 사진 선택
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">연락처</label>
                <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">거주지 주소</label>
                <input type="text" value={editAddress} onChange={e => setEditAddress(e.target.value)} className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={() => { setShowEditModal(false); setToastMsg('프로필 정보가 수정되었습니다!'); setTimeout(() => setToastMsg(''), 2000) }} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 내 기도제목 상세 모달 ── */}
      {selectedPrayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-100 pb-2">
              <div>
                <h3 className="font-bold text-sm text-gray-900">{selectedPrayer.title}</h3>
                <p className="text-[11px] text-gray-400">{selectedPrayer.createdAt}</p>
              </div>
              <button onClick={() => setSelectedPrayer(null)} className="text-gray-400 font-bold">✕</button>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">{selectedPrayer.content}</p>
            <div className="flex items-center justify-between bg-amber-50 p-3 rounded-xl text-xs">
              <span className="font-bold text-amber-900">기도 응답 현황</span>
              <button onClick={() => handleToggleCompleted(selectedPrayer.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedPrayer.isCompleted ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}`}>
                {selectedPrayer.isCompleted ? '✅ 응답 완료' : '🙏 기도 중 (완료 처리)'}
              </button>
            </div>
            {selectedPrayer.comments && selectedPrayer.comments.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-gray-700 text-[11px]">나눔 및 댓글</span>
                <div className="bg-gray-50 p-3 rounded-xl space-y-2">
                  {selectedPrayer.comments.map(c => (
                    <div key={c.id} className="text-[11px]">
                      <span className="font-bold text-gray-900">{c.authorName}: </span>
                      <span className="text-gray-600">{c.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setSelectedPrayer(null)} className="w-full py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl">닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
