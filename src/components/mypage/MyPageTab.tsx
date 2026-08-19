'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Shield, Smartphone, ChevronDown, ChevronUp, Settings, MapPin, Ticket, Edit, X, CheckCircle2, Circle, MessageSquare } from 'lucide-react'
import { UserProfile, getUserDisplayName, PostItem, MealCouponAccount, isApprovedMember } from '../../lib/mockData'
import { FamilyChildInfo, buildFamilyStatusText, getSharedChildren, getMissingBirthdayChildren, buildFamilyInfoSyncUpdates, parseFamilyInfo, serializeFamilyInfo, findSpouseLinks } from '../../lib/familyInfo'
import { getChildAgeLabel, parseBirthdayFlexible, daysInMonth } from '../../lib/dateUtils'
import { dbUpdateProfile, dbFetchPosts, dbUpdatePost, dbFetchMealCoupons } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { uploadImageToStorage } from '../../lib/storage'
import { FAMILY_ROLE_ORDER } from '../../lib/adminHelpers'
import PwaInstallButton from '../PwaInstallButton'

interface MyPageTabProps {
  currentUser: UserProfile
  allUsers?: UserProfile[]
  onNavigateAdmin: () => void
  onUpdateUsers?: React.Dispatch<React.SetStateAction<UserProfile[]>>
}

export default function MyPageTab({ currentUser, allUsers = [], onNavigateAdmin, onUpdateUsers }: MyPageTabProps) {
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  // 프로필 수정 상태
  const [editName, setEditName] = useState(currentUser.name)
  const [editPhone, setEditPhone] = useState(currentUser.phone || '')
  const [editAddress, setEditAddress] = useState(currentUser.address || '')
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatarUrl || '')

  // 자녀 정보(배우자와 공유) 수정 상태: 모달을 열 때마다 최신 공유 목록으로 초기화
  const [editChildren, setEditChildren] = useState<FamilyChildInfo[]>([])
  // 🐛 과거 버그: 모달을 열 때 자녀 목록만 초기화하고 이름/연락처/주소/사진은
  // 그대로 뒀습니다. 그래서 반쯤 입력하다 "취소"를 눌러도 뒤쪽 카드에는 입력하던 값이
  // 그대로 보였고(카드가 저장값이 아닌 입력값을 표시했음), 저장된 것처럼 오해했습니다.
  const openEditModal = () => {
    setEditName(currentUser.name || '')
    setEditPhone(currentUser.phone || '')
    setEditAddress(currentUser.address || '')
    setAvatarPreview(currentUser.avatarUrl || '')
    const b = parseBirthday(currentUser.birthday)
    setEditBirthYear(b.year)
    setEditBirthMonth(b.month)
    setEditBirthDay(b.day)
    setEditChildren(getSharedChildren(currentUser, allUsers))
    setShowEditModal(true)
  }
  const addEditChild = () => {
    setEditChildren(prev => [...prev, { id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', birthday: '' }])
  }
  const updateEditChild = (id: string, updates: Partial<FamilyChildInfo>) => {
    setEditChildren(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }
  const removeEditChild = (id: string) => {
    // 🐛 과거 버그: 확인 없이 바로 삭제됐고, 저장하면 배우자 계정에서도 함께 지워졌습니다.
    // (25px짜리 작은 ✕가 생년월일 입력칸 바로 옆에 붙어 있어 오조작하기 쉬웠습니다)
    const child = editChildren.find(c => c.id === id)
    const label = child?.name?.trim() || '이 자녀'
    if (!confirm(`${label} 정보를 목록에서 지울까요?\n저장하면 배우자 계정에서도 함께 지워집니다.`)) return
    setEditChildren(prev => prev.filter(c => c.id !== id))
  }

  // 생일 미입력 자녀가 있으면 마이페이지 상단에 입력 알림 표시
  const missingBirthdayChildren = getMissingBirthdayChildren(currentUser, allUsers)
  const addressRequested = !!parseFamilyInfo(currentUser.familyInfo).addressRequestedAt

  // 생일 파싱 (YYYY-MM-DD 또는 MM-DD)
  const currentYear = new Date().getFullYear()
  // 🐛 과거 버그: 이 파서가 '-'로 나뉜 형식만 이해했습니다. 그런데 앱의 다른 곳
  // (주소록/생일 목록/나이 표시)은 750322, 1990/01/01 같은 형식도 읽습니다.
  // 그래서 생일이 '750322'로 저장된 성도가 **주소만 고치려고** 수정 창을 열면
  // 생일 칸이 조용히 1980/01/01로 표시되고, 저장하면 그대로 덮어써졌습니다.
  // 그분은 그 뒤로 '이달의 생일'에서 사라집니다.
  // → 공용 파서(parseBirthdayFlexible)를 쓰고, 원래 비어 있었으면 '미입력'을 유지합니다.
  const parseBirthday = (bStr?: string) => {
    const parsed = parseBirthdayFlexible(bStr)
    if (!parsed) return { year: '', month: '', day: '' }
    return {
      year: parsed.year ? String(parsed.year) : '',
      month: String(parsed.month).padStart(2, '0'),
      day: String(parsed.day).padStart(2, '0'),
    }
  }

  const initialBday = parseBirthday(currentUser.birthday)
  const [editBirthYear, setEditBirthYear] = useState(initialBday.year)
  const [editBirthMonth, setEditBirthMonth] = useState(initialBday.month)
  const [editBirthDay, setEditBirthDay] = useState(initialBday.day)

  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => String(currentYear - i))
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  // 선택한 연/월에 실제로 있는 날짜만 보여줍니다.
  // (이전에는 항상 1~31일이라 2월 31일 같은 값을 고를 수 있었고, 그런 생일은
  //  DB가 거부하거나 달력에 영영 안 떴습니다)
  const days = useMemo(() => {
    const y = editBirthYear ? Number(editBirthYear) : null
    const m = editBirthMonth ? Number(editBirthMonth) : 1
    const count = daysInMonth(y, m)
    return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0'))
  }, [editBirthYear, editBirthMonth])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 기도제목 상세 모달
  const [selectedPrayer, setSelectedPrayer] = useState<PostItem | null>(null)
  const [prayers, setPrayers] = useState<PostItem[]>([])

  // 쿠폰 (DB에서만 로드, 초기값 빈 객체)
  const familyId = currentUser.familyGroupId || `fam_single_${currentUser.id}`
  const [couponAccounts, setCouponAccounts] = useState<Record<string, MealCouponAccount>>({})

  // 실시간 가족 구성원 기반 가정 명칭 계산 (조부/조모/부/모/자녀 순 정렬)
  const familyMembers = (currentUser.familyGroupId && allUsers.length > 0)
    ? allUsers.filter(u => u.familyGroupId === currentUser.familyGroupId && isApprovedMember(u.role))
    : [currentUser]

  const sortedFamilyMembers = [...familyMembers].sort((a, b) => {
    const orderA = FAMILY_ROLE_ORDER[a.familyRole || ''] || 10
    const orderB = FAMILY_ROLE_ORDER[b.familyRole || ''] || 10
    return orderA - orderB
  })

  const computedFamilyName = currentUser.familyGroupId
    ? `${sortedFamilyMembers.map(m => m.name).join(' · ')} 가정`
    : `${currentUser.name}님`

  const couponAccount = couponAccounts[familyId] || { familyGroupId: familyId, balance: 0, familyName: computedFamilyName }
  const displayFamilyName = computedFamilyName || couponAccount.familyName || `${currentUser.name}님`
  const [toastMsg, setToastMsg] = useState('')

  // Supabase DB에서 내 기도제목 및 쿠폰 로드 (나눔/쿠폰관리 탭과 캐시를 공유해 반복 조회하지 않음)
  const { data: prayerPosts } = useCachedQuery('posts:PRAYER', () => dbFetchPosts('PRAYER'))
  // 🐛 과거 버그: 조회 실패를 확인하지 않아, 네트워크 문제나 권한 문제로 못 불러오면
  // 모든 가정이 "잔여 0장"으로 보였습니다. 식권을 산 성도가 식권을 못 받고 실랑이하게 됩니다.
  const { data: mealCoupons, error: couponError } = useCachedQuery('mealCoupons', () => dbFetchMealCoupons())

  useEffect(() => {
    if (prayerPosts && prayerPosts.length > 0) setPrayers(prayerPosts)
  }, [prayerPosts])

  useEffect(() => {
    if (mealCoupons && Object.keys(mealCoupons).length > 0) setCouponAccounts(mealCoupons)
  }, [mealCoupons])

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 1500)
  }

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingAvatar(true)
    showToast('⏳ 프로필 사진 업로드 중...')
    try {
      const uploadedUrl = await uploadImageToStorage(file, 'avatars')
      setAvatarPreview(uploadedUrl)
      showToast('✅ 프로필 사진이 업로드되었습니다!')
    } catch (err: any) {
      // 🐛 과거 버그: 업로드 실패 시 조용히 base64 글자 덩어리(약 400KB~수 MB)를 돌려줬고,
      // 그게 프로필에 저장되면 **모든 성도가 앱을 켤 때마다** 그걸 내려받게 됐습니다.
      showToast(`⚠️ ${err?.message || '사진 업로드에 실패했습니다.'}`)
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleToggleCompleted = async (prayerId: string) => {
    const target = prayers.find(p => p.id === prayerId)
    if (!target) return
    const newCompleted = !target.isCompleted
    setPrayers(prev => prev.map(p => p.id === prayerId ? { ...p, isCompleted: newCompleted } : p))
    if (selectedPrayer) setSelectedPrayer(prev => prev ? { ...prev, isCompleted: newCompleted } : null)
    await dbUpdatePost(prayerId, { isCompleted: newCompleted })
  }

  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const handleSaveProfile = async () => {
    if (isSavingProfile) return

    const trimmedName = editName.trim()
    if (!trimmedName) {
      // 🐛 과거 버그: 이름을 지우고 저장하면 조용히 예전 이름으로 되돌려놓기만 했습니다.
      // (모바일 키보드에서 전체선택 후 삭제가 흔한데, 사용자는 뭐가 일어났는지 몰랐습니다)
      showToast('⚠️ 이름을 입력해 주세요.')
      return
    }

    // 🐛 과거 버그: 생일을 항상 저장 대상에 포함시켜서, 생일을 손대지 않아도
    // 파서가 못 읽은 값이 1980-01-01로 덮어써졌습니다.
    // → 세 칸이 모두 채워져 있을 때만 생일을 저장합니다.
    const hasBirthday = !!(editBirthYear && editBirthMonth && editBirthDay)
    const birthdayStr = hasBirthday ? `${editBirthYear}-${editBirthMonth}-${editBirthDay}` : undefined

    setIsSavingProfile(true)

    // 🐛 과거 버그: 정작 본인 프로필 저장 결과만 확인하지 않았습니다(배우자/자녀 저장은 확인함).
    // 실패해도 "✅ 수정되었습니다"가 뜨고 화면에는 새 번호가 보이지만,
    // 교회 주소록에는 옛 번호가 남아 아무도 연락이 안 됩니다.
    const selfRes = await dbUpdateProfile(currentUser.id, {
      name: trimmedName,
      phone: editPhone.trim(),
      address: editAddress.trim(),
      ...(birthdayStr ? { birthday: birthdayStr } : {}),
      avatarUrl: avatarPreview
    })
    if (selfRes.error) {
      setIsSavingProfile(false)
      showToast(`⚠️ 저장하지 못했습니다: ${selfRes.error.message || ''}`)
      return
    }

    // 부부간 주소 공유: 가족 내 호칭이 부/모로 서로 연결된 배우자 계정에도 동일한 주소를 저장합니다.
    // (조부모 등 확대가족과는 공유하지 않도록 findSpouseLinks에서 부/모 관계만 걸러냅니다.)
    const spouseLinks = findSpouseLinks(currentUser, allUsers)
    const syncedSpouseIds = new Set<string>()
    if (editAddress.trim()) {
      for (const spouse of spouseLinks) {
        const { error } = await dbUpdateProfile(spouse.id, { address: editAddress.trim() })
        if (error) {
          alert(`배우자(${spouse.name}) 계정 주소 동기화 중 오류가 발생했습니다: ${error.message}`)
        } else {
          syncedSpouseIds.add(spouse.id)
        }
      }
    }

    // 자녀 정보 저장: 배우자가 연동되어 있으면 자녀 목록을 배우자 계정에도 동일하게 반영(공유)
    const existingNote = parseFamilyInfo(currentUser.familyInfo).note
    const familyInfoUpdates = buildFamilyInfoSyncUpdates(currentUser, existingNote, editChildren, allUsers)
    // 주소를 새로 입력/수정했으면 본인 + 배우자(부부) 계정의 "주소 보완요청" 표시를 자동으로 끕니다.
    if (editAddress.trim()) {
      const idsToClear = new Set([currentUser.id, ...spouseLinks.map(sp => sp.id)])
      familyInfoUpdates.forEach((upd, idx) => {
        if (!idsToClear.has(upd.userId)) return
        const data = parseFamilyInfo(upd.familyInfo)
        familyInfoUpdates[idx] = { userId: upd.userId, familyInfo: serializeFamilyInfo({ ...data, addressRequestedAt: '' }) }
      })
    }
    for (const upd of familyInfoUpdates) {
      const { error } = await dbUpdateProfile(upd.userId, { familyInfo: upd.familyInfo })
      if (error) {
        alert(`자녀 정보 저장 중 오류가 발생했습니다: ${error.message}`)
      }
    }

    onUpdateUsers?.(prev => prev.map(u => {
      const famUpd = familyInfoUpdates.find(x => x.userId === u.id)
      if (u.id === currentUser.id) {
        return {
          ...u,
          name: trimmedName,
          phone: editPhone.trim(),
          address: editAddress.trim(),
          ...(birthdayStr ? { birthday: birthdayStr } : {}),
          avatarUrl: avatarPreview,
          familyInfo: famUpd ? famUpd.familyInfo : u.familyInfo
        }
      }
      if (syncedSpouseIds.has(u.id)) {
        return { ...u, address: editAddress.trim(), familyInfo: famUpd ? famUpd.familyInfo : u.familyInfo }
      }
      return famUpd ? { ...u, familyInfo: famUpd.familyInfo } : u
    }))

    setIsSavingProfile(false)
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
            onClick={openEditModal}
            className="w-16 h-16 rounded-full overflow-hidden bg-[#335f87] text-white flex items-center justify-center font-bold text-xl shrink-0 border-2 border-blue-100 shadow-xs hover:opacity-85 transition-all cursor-pointer relative group"
            title="프로필 사진 변경"
          >
            {currentUser.avatarUrl
              ? <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" style={{ objectPosition: 'center center' }} />
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
                <p className="font-bold text-gray-800 text-[11px] mt-0.5">{currentUser.phone || '연락처 미입력'}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 p-2.5 rounded-xl flex items-start gap-2">
            <MapPin size={14} className="text-[#335f87] shrink-0 mt-1" />
            <div>
              <span className="text-gray-400 text-[10px]">거주지 주소</span>
              <p className="font-bold text-gray-800 text-[11px] mt-0.5">{currentUser.address || '주소 미입력'}</p>
            </div>
          </div>
          {buildFamilyStatusText(currentUser, allUsers) && (
            <div className="bg-amber-50/60 p-2.5 rounded-xl flex items-start gap-2 text-amber-900">
              <span className="text-sm mt-0.5">👨‍👩‍👧‍👦</span>
              <div>
                <span className="text-amber-700 text-[10px] font-bold">가족</span>
                <p className="font-bold text-[11px] mt-0.5">
                  {buildFamilyStatusText(currentUser, allUsers)}
                </p>
              </div>
            </div>
          )}
          {missingBirthdayChildren.length > 0 && (
            <button
              type="button"
              onClick={openEditModal}
              className="w-full bg-rose-50 border border-rose-100 p-2.5 rounded-xl flex items-center gap-2 text-rose-700 text-left hover:bg-rose-100/70 transition-all"
            >
              <span className="text-sm">🎂</span>
              <p className="flex-1 font-bold text-[11px] leading-snug">
                {missingBirthdayChildren.map(c => c.name).join(', ')} 자녀의 생일을 입력해주세요.
              </p>
              <span className="text-[10px] font-bold shrink-0">입력하기 ›</span>
            </button>
          )}
          {addressRequested && (
            <button
              type="button"
              onClick={openEditModal}
              className="w-full bg-sky-50 border border-sky-100 p-2.5 rounded-xl flex items-center gap-2 text-sky-800 text-left hover:bg-sky-100/70 transition-all"
            >
              <span className="text-sm">🏠</span>
              <p className="flex-1 font-bold text-[11px] leading-snug">
                상세주소를 입력해주세요
                <br />
                <span className="font-normal text-sky-600">주소정보는 교인관리 목적으로만 사용되며 공개되지 않습니다.</span>
              </p>
              <span className="text-[10px] font-bold shrink-0">입력하기 ›</span>
            </button>
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
          {/* 조회 실패를 "0장"으로 보여주면 안 됩니다 — 성도가 식권을 못 받는 상황이 생깁니다 */}
          {couponError ? (
            <span className="text-xs font-bold text-amber-100 text-right leading-snug">
              불러오지 못했습니다<br />
              <span className="font-normal opacity-90">잠시 후 다시 확인해 주세요</span>
            </span>
          ) : (
            <span className="text-2xl font-black">{couponAccount.balance}장</span>
          )}
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
            {/* 안드로이드는 버튼 한 번으로 설치 가능하면 여기 자동으로 뜸(지원 안 되면 아무것도 안 뜸) */}
            <PwaInstallButton />
            <div className="p-3 bg-blue-50/50 rounded-xl space-y-1">
              <span className="font-bold text-[#335f87]">아이폰 (Safari)</span>
              <p className="text-gray-600 text-[11px]">하단 공유 버튼(공유 아이콘) 클릭 ➔ &apos;홈 화면에 추가&apos; 선택</p>
            </div>
            <div className="p-3 bg-emerald-50/50 rounded-xl space-y-1">
              <span className="font-bold text-emerald-700">안드로이드 (Chrome)</span>
              <p className="text-gray-600 text-[11px]">위 설치 버튼이 안 보이면: 우측 상단 메뉴(⋮) 클릭 ➔ &apos;앱 설치&apos; 또는 &apos;홈 화면에 추가&apos; 선택</p>
            </div>
          </div>
        )}
      </section>

      {/* ── 프로필 수정 모달 ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
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

              {/* 자녀 정보 (배우자가 연동되어 있으면 자동으로 공유됩니다) */}
              <div className="pt-1 border-t border-gray-100">
                <div className="flex items-center justify-between mt-2">
                  <label className="text-[10px] text-gray-400 font-bold">자녀 정보</label>
                  <button type="button" onClick={addEditChild} className="text-[10px] font-bold text-[#335f87] px-2 py-0.5 bg-blue-50 rounded-lg">+ 자녀 추가</button>
                </div>
                <div className="mt-1 space-y-1.5">
                  {editChildren.length === 0 && (
                    <p className="text-[10px] text-gray-300">등록된 자녀가 없습니다.</p>
                  )}
                  {editChildren.map(child => {
                    const ageLabel = getChildAgeLabel(child.birthday)
                    return (
                      <div key={child.id} className="flex gap-1 items-center">
                        <input
                          type="text"
                          value={child.name}
                          onChange={e => updateEditChild(child.id, { name: e.target.value })}
                          placeholder="이름"
                          className="w-[30%] p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium text-[11px]"
                        />
                        <input
                          type="text"
                          value={child.birthday || ''}
                          onChange={e => updateEditChild(child.id, { birthday: e.target.value })}
                          placeholder="생일 YYYY-MM-DD"
                          className={`w-[40%] p-2 rounded-lg border focus:outline-none font-medium text-[11px] ${!child.birthday ? 'bg-rose-50 border-rose-200 text-rose-700 placeholder:text-rose-300' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                        />
                        {ageLabel && (
                          <span className="w-[15%] text-center text-[10px] font-bold text-[#335f87] bg-blue-50 rounded-lg py-2">{ageLabel}</span>
                        )}
                        <button type="button" onClick={() => removeEditChild(child.id)} className="p-1.5 text-gray-400 hover:text-rose-500 shrink-0">
                          <X size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile || isUploadingAvatar}
                className="flex-1 py-3 bg-[#335f87] text-white text-xs font-bold rounded-xl disabled:opacity-60"
              >
                {/* 사진 업로드가 끝나기 전에 저장하면 예전 사진이 저장되던 문제 방지 */}
                {isSavingProfile ? '저장 중...' : isUploadingAvatar ? '사진 업로드 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 내 기도제목 상세 모달 ── */}
      {selectedPrayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
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
