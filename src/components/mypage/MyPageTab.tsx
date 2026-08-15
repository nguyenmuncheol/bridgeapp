'use client'

import { useState, useRef, useEffect } from 'react'
import { Shield, Smartphone, ChevronDown, ChevronUp, Settings, MapPin, Ticket, Edit, X, CheckCircle2, Circle, MessageSquare } from 'lucide-react'
import { UserProfile, INITIAL_PRAYERS, getUserDisplayName, PostItem, MealCouponAccount } from '../../lib/mockData'
import { dbUpdateProfile, dbFetchPosts, dbUpdatePost, dbFetchMealCoupons } from '../../lib/db'
import { uploadImageToStorage } from '../../lib/storage'

const FAMILY_ROLE_ORDER: Record<string, number> = {
  '조부': 1,
  '조모': 2,
  '부': 3,
  '모': 4,
  '자녀1': 5,
  '자녀2': 6,
  '자녀3': 7,
  '자녀': 8,
  '기타': 9,
}

interface MyPageTabProps {
  currentUser: UserProfile
  allUsers?: UserProfile[]
  onNavigateAdmin: () => void
}

export default function MyPageTab({ currentUser, allUsers = [], onNavigateAdmin }: MyPageTabProps) {
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  // 프로필 수정 상태
  const [editName, setEditName] = useState(currentUser.name)
  const [editPhone, setEditPhone] = useState(currentUser.phone || '')
  const [editAddress, setEditAddress] = useState(currentUser.address || '')
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatarUrl || '')

  // 생일 파싱 (YYYY-MM-DD 또는 MM-DD)
  const currentYear = new Date().getFullYear()
  const parseBirthday = (bStr?: string) => {
    if (!bStr) return { year: '1980', month: '01', day: '01' }
    const parts = bStr.split('-')
    if (parts.length === 3) {
      return { year: parts[0], month: parts[1].padStart(2, '0'), day: parts[2].padStart(2, '0') }
    } else if (parts.length === 2) {
      return { year: '1980', month: parts[0].padStart(2, '0'), day: parts[1].padStart(2, '0') }
    }
    return { year: '1980', month: '01', day: '01' }
  }

  const initialBday = parseBirthday(currentUser.birthday)
  const [editBirthYear, setEditBirthYear] = useState(initialBday.year)
  const [editBirthMonth, setEditBirthMonth] = useState(initialBday.month)
  const [editBirthDay, setEditBirthDay] = useState(initialBday.day)

  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => String(currentYear - i))
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 기도제목 상세 모달
  const [selectedPrayer, setSelectedPrayer] = useState<PostItem | null>(null)
  const [prayers, setPrayers] = useState<PostItem[]>([])

  // 쿠폰 (DB에서만 로드, 초기값 빈 객체)
  const familyId = currentUser.familyGroupId || `fam_single_${currentUser.id}`
  const [couponAccounts, setCouponAccounts] = useState<Record<string, MealCouponAccount>>({})

  // 실시간 가족 구성원 기반 가정 명칭 계산 (조부/조모/부/모/자녀 순 정렬)
  const familyMembers = (currentUser.familyGroupId && allUsers.length > 0)
    ? allUsers.filter(u => u.familyGroupId === currentUser.familyGroupId && u.role !== 'PENDING')
    : [currentUser]

  const sortedFamilyMembers = [...familyMembers].sort((a, b) => {
    const orderA = FAMILY_ROLE_ORDER[a.familyRole || ''] || 10
    const orderB = FAMILY_ROLE_ORDER[b.familyRole || ''] || 10
    return orderA - orderB
  })

  const computedFamilyName = currentUser.familyGroupId
    ? `${sortedFamilyMembers.map(m => m.name).join(' · ')} 가정`
    : `${currentUser.name} 성도`

  const couponAccount = couponAccounts[familyId] || { familyGroupId: familyId, balance: 0, familyName: computedFamilyName }
  const displayFamilyName = computedFamilyName || couponAccount.familyName || `${currentUser.name} 성도`
  const [toastMsg, setToastMsg] = useState('')

  // Supabase DB에서 내 기도제목 및 쿠폰 로드
  useEffect(() => {
    dbFetchPosts('PRAYER').then(dbPrayers => {
      if (dbPrayers && dbPrayers.length > 0) {
        setPrayers(dbPrayers)
      }
    })

    dbFetchMealCoupons().then(dbCoupons => {
      if (dbCoupons && Object.keys(dbCoupons).length > 0) {
        setCouponAccounts(dbCoupons)
      }
    })
  }, [])

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1500)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    showToast('⏳ 프로필 사진 업로드 중...')
    const uploadedUrl = await uploadImageToStorage(file, 'avatars')
    setAvatarPreview(uploadedUrl)
    showToast('✅ 프로필 사진이 업로드되었습니다!')
  }

  const handleToggleCompleted = async (prayerId: string) => {
    const target = prayers.find(p => p.id === prayerId)
    if (!target) return
    const newCompleted = !target.isCompleted
    setPrayers(prev => prev.map(p => p.id === prayerId ? { ...p, isCompleted: newCompleted } : p))
    if (selectedPrayer) setSelectedPrayer(prev => prev ? { ...prev, isCompleted: newCompleted } : null)
    await dbUpdatePost(prayerId, { isCompleted: newCompleted })
  }

  const handleSaveProfile = async () => {
    const birthdayStr = `${editBirthYear}-${editBirthMonth}-${editBirthDay}`
    await dbUpdateProfile(currentUser.id, {
      name: editName.trim() || currentUser.name,
      phone: editPhone.trim(),
      address: editAddress.trim(),
      birthday: birthdayStr,
      avatarUrl: avatarPreview
    })
    setShowEditModal(false)
    showToast('✅ 프로필 정보가 수정되었습니다!')
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
          {currentUser.familyInfo && (
            <div className="bg-amber-50/60 p-2.5 rounded-xl flex items-start gap-2 text-amber-900">
              <span className="text-sm mt-0.5">👨‍👩‍👧‍👦</span>
              <div>
                <span className="text-amber-700 text-[10px] font-bold">가족</span>
                <p className="font-bold text-[11px] mt-0.5">
                  {currentUser.familyInfo}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 관리자/리더/쿠폰관리자: 대시보드 진입 버튼 ── */}
      {(currentUser.role === 'ADMIN' || currentUser.role === 'LEADER' || currentUser.role === 'COUPON') && (
        <section>
          <button
            onClick={onNavigateAdmin}
            className="w-full bg-gradient-to-r from-[#1d3a54] to-[#335f87] text-white rounded-2xl p-4 shadow-sm flex items-center justify-between group hover:from-[#162d42] hover:to-[#2b5072] transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-lg">
                {currentUser.role === 'COUPON' ? '🎟️' : '🛠️'}
              </span>
              <div className="text-left">
                <p className="font-bold text-sm">
                  {currentUser.role === 'ADMIN' ? '관리자 대시보드' : currentUser.role === 'LEADER' ? '리더 대시보드' : '쿠폰 관리 대시보드'}
                </p>
                <p className="text-[11px] text-blue-200 mt-0.5">
                  {currentUser.role === 'ADMIN'
                    ? '출석 · 식수 · 가입승인 · 쿠폰 관리'
                    : currentUser.role === 'LEADER'
                    ? '주일 식사 집계 · 라브리 출석 통계'
                    : '주일 식사 쿠폰 발급 및 차감 전용 관리'}
                </p>
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
              <p className="text-[11px] text-amber-100 font-semibold">{displayFamilyName}</p>
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
                <label className="text-[10px] text-gray-500 font-bold">이름 (실명) <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium placeholder:text-gray-500"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-bold">연락처 (전화번호)</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="예: 037-123-4567 또는 010-1234-5678"
                  className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-bold">거주지 주소 (아파트/동호수)</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  placeholder="예: 경남 A동 1023호 / 미딩 골든펠리스"
                  className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">생년월일</label>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  <select
                    value={editBirthYear}
                    onChange={e => setEditBirthYear(e.target.value)}
                    className="p-2 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87]"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                  <select
                    value={editBirthMonth}
                    onChange={e => setEditBirthMonth(e.target.value)}
                    className="p-2 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87]"
                  >
                    {months.map(m => (
                      <option key={m} value={m}>{parseInt(m, 10)}월</option>
                    ))}
                  </select>
                  <select
                    value={editBirthDay}
                    onChange={e => setEditBirthDay(e.target.value)}
                    className="p-2 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87]"
                  >
                    {days.map(d => (
                      <option key={d} value={d}>{parseInt(d, 10)}일</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSaveProfile} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">저장</button>
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
