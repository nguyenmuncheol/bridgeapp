'use client'

import { useState, useMemo, useRef } from 'react'
import { Search, Edit2, Save, X, Camera } from 'lucide-react'
import { UserProfile, Role, getUserDisplayName, isApprovedMember, getInitials } from '../../lib/mockData'
import { formatBirthdayDisplay, todayLocalDateStr } from '../../lib/dateUtils'
import { dbMergeCouponsIntoFamily, dbUpdateProfile } from '../../lib/db'
import { FamilyChildInfo, CHILD_LABRI_OPTIONS, parseFamilyInfo, serializeFamilyInfo, buildFamilyStatusText, getSharedChildren } from '../../lib/familyInfo'
import { FAMILY_ROLE_ORDER, getFamilyGroupOptions, requestAddressUpdate } from '../../lib/adminHelpers'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'
import { uploadImageToStorage } from '../../lib/storage'

interface MembersTabProps {
  currentUser?: UserProfile
  allUsers: UserProfile[]
  isLeader: boolean
  onUpdateUsers?: React.Dispatch<React.SetStateAction<UserProfile[]>>
  showToast: (msg: string) => void
  dbAttendanceData: Record<string, { userId: string; status: 'ATTEND' | 'ABSENT'; note: string }[]>
  attendanceDateKeysDesc: string[]
  getAbsenceStreak: (userId: string, fromDate: string) => number
  latestAttendanceDate: string
}

export default function MembersTab({
  currentUser, allUsers, isLeader, onUpdateUsers, showToast,
  dbAttendanceData, attendanceDateKeysDesc, getAbsenceStreak, latestAttendanceDate
}: MembersTabProps) {
  // ── 성도관리 탭 상태 ──
  const approvedMembers = allUsers.filter(u => isApprovedMember(u.role))
  const [memberSearch, setMemberSearch] = useState('')
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null)
  useModalDismiss(!!editingMember, () => setEditingMember(null))
  const [editLinkedMemberId, setEditLinkedMemberId] = useState<string>('')
  const [editMemberData, setEditMemberData] = useState<{
    name: string; phone: string; address: string; birthday: string;
    role: Role; duty: string; labriId: string; familyGroupId: string; familyInfo: string; familyRole: string; teachGroup: string
  }>({ name: '', phone: '', address: '', birthday: '', role: 'MEMBER', duty: '성도', labriId: '', familyGroupId: '', familyInfo: '', familyRole: '', teachGroup: '' })
  // 가족 현황: 자녀 등 미가입 구성원 목록 + 기타 메모 (구조화 저장, familyInfo.ts 참고)
  const [editFamilyNote, setEditFamilyNote] = useState('')
  const [editChildren, setEditChildren] = useState<FamilyChildInfo[]>([])

  // ── 자녀 프로필 사진 (관리자가 대신 올려줄 수 있게) ──
  // 자녀는 자기 계정이 없어서 본인이 올릴 수 없으므로, 관리자도 편집 모달에서 올려줄 수 있습니다.
  const [isUploadingChildPhoto, setIsUploadingChildPhoto] = useState(false)
  const childFileInputRef = useRef<HTMLInputElement>(null)
  const [photoChildId, setPhotoChildId] = useState('')
  const pickChildPhoto = (childId: string) => {
    setPhotoChildId(childId)
    childFileInputRef.current?.click()
  }
  const handleChildFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const childId = photoChildId
    if (!file || !childId) return
    setIsUploadingChildPhoto(true)
    showToast('⏳ 자녀 사진 업로드 중...')
    try {
      const uploadedUrl = await uploadImageToStorage(file, 'avatars')
      setEditChildren(prev => prev.map(c => c.id === childId ? { ...c, avatarUrl: uploadedUrl } : c))
      showToast('✅ 자녀 사진이 업로드되었습니다!')
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || '사진 업로드에 실패했습니다.'
      showToast(`⚠️ ${msg}`)
    } finally {
      setIsUploadingChildPhoto(false)
      setPhotoChildId('')
      if (childFileInputRef.current) childFileInputRef.current.value = ''
    }
  }

  const filteredMembers = memberSearch
    ? approvedMembers.filter(m => m.name.includes(memberSearch) || m.phone.includes(memberSearch) || (m.email && m.email.includes(memberSearch)))
    : approvedMembers

  const handleStartEditMember = (member: UserProfile) => {
    setEditingMember(member)
    // 현재 같은 가족 그룹으로 묶인 다른 성도 찾기
    const linkedUser = member.familyGroupId
      ? allUsers.find(u => u.id !== member.id && u.familyGroupId === member.familyGroupId)
      : null
    setEditLinkedMemberId(linkedUser ? linkedUser.id : '')
    setEditMemberData({
      name: member.name,
      phone: member.phone,
      address: member.address || '',
      birthday: member.birthday || '',
      role: member.role,
      duty: member.duty || '',
      labriId: member.labriId || '',
      familyGroupId: member.familyGroupId || '',
      familyInfo: member.familyInfo || '',
      familyRole: member.familyRole || '',
      teachGroup: member.teachGroup || ''
    })
    // 배우자가 연동되어 있으면 배우자가 입력한 자녀까지 합쳐서 보여줌 (부부는 자녀 정보 공유)
    setEditFamilyNote(parseFamilyInfo(member.familyInfo).note)
    setEditChildren(getSharedChildren(member, allUsers))
  }

  // 자녀(미가입 가족 구성원) 목록 편집 헬퍼
  const addEditChild = () => {
    setEditChildren(prev => [...prev, { id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', birthday: '' }])
  }
  const updateEditChild = (id: string, updates: Partial<FamilyChildInfo>) => {
    setEditChildren(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }
  const removeEditChild = (id: string) => {
    setEditChildren(prev => prev.filter(c => c.id !== id))
  }

  const [isSavingMember, setIsSavingMember] = useState(false)

  const handleSaveMemberEdit = async () => {
    if (!editingMember) return
    if (isSavingMember) return

    // 🐛 과거 버그: 이름이 비어도 그대로 저장됐습니다. 모바일 키보드에서 전체선택 후
    // 삭제가 흔한데, 이름이 빈 성도는 아바타가 빈 동그라미가 되고 이름 검색에도 안 걸립니다.
    if (!editMemberData.name?.trim()) {
      alert('이름을 입력해 주세요.')
      return
    }

    // 🐛 과거 버그(치명적): 관리자가 자기 카드에서 등급을 실수로 낮춰도 아무 경고가 없었습니다.
    // 모바일에서는 등급 선택이 전체화면 목록이라 오조작하기 쉽고, 마지막 관리자가 강등되면
    // **아무도 승인/성도관리/쿠폰을 할 수 없게 되어** Supabase 대시보드를 직접 열어야 합니다.
    const wasAdmin = editingMember.role === 'ADMIN'
    const willBeAdmin = editMemberData.role === 'ADMIN'
    if (wasAdmin && !willBeAdmin) {
      const otherAdmins = allUsers.filter(u => u.role === 'ADMIN' && u.id !== editingMember.id)
      if (otherAdmins.length === 0) {
        alert('마지막 남은 총괄 관리자입니다.\n등급을 낮추면 아무도 관리자 기능을 사용할 수 없게 됩니다.\n\n먼저 다른 분을 총괄 관리자로 지정한 뒤 변경해 주세요.')
        return
      }
      if (currentUser && editingMember.id === currentUser.id) {
        if (!confirm('본인의 등급을 낮추려고 합니다.\n저장하면 관리자 화면에 더 이상 들어올 수 없습니다.\n\n계속할까요?')) return
      }
    }

    setIsSavingMember(true)
    try {

    // 가족 현황(자녀 목록 + 기타 메모)을 저장용 문자열로 직렬화 (주소 보완요청 상태는 그대로 보존)
    const ownAddressRequestedAt = parseFamilyInfo(editingMember.familyInfo).addressRequestedAt
    const serializedFamilyInfo = serializeFamilyInfo({ note: editFamilyNote, children: editChildren, addressRequestedAt: ownAddressRequestedAt })

    let resolvedFid: string | null = null

    if (editLinkedMemberId) {
      const targetMember = allUsers.find(u => u.id === editLinkedMemberId)
      resolvedFid = targetMember?.familyGroupId || editingMember.familyGroupId || `fam_${Date.now().toString(36)}`

      // 본인 업데이트
      const { error: selfUpdateError } = await dbUpdateProfile(editingMember.id, {
        name: editMemberData.name,
        phone: editMemberData.phone,
        address: editMemberData.address,
        birthday: editMemberData.birthday,
        role: editMemberData.role,
        teachGroup: editMemberData.role === 'TEACHER' ? editMemberData.teachGroup : '',
        duty: editMemberData.duty,
        labriId: editMemberData.labriId || undefined,
        familyGroupId: resolvedFid,
        familyInfo: serializedFamilyInfo,
        familyRole: editMemberData.familyRole
      })
      if (selfUpdateError) {
        alert(`저장 중 오류가 발생했습니다: ${selfUpdateError.message}\n다시 시도해 주세요.`)
        return
      }

      // 상대방도 같은 familyGroupId로 업데이트
      if (targetMember && targetMember.familyGroupId !== resolvedFid) {
        const { error: linkedUpdateError } = await dbUpdateProfile(targetMember.id, { familyGroupId: resolvedFid })
        if (linkedUpdateError) {
          alert(`가족 연결 대상(${targetMember.name})의 정보 저장 중 오류가 발생했습니다: ${linkedUpdateError.message}`)
        }
      }

      // 배우자와 자녀 정보 동기화: 방금 편집한 자녀 목록을 배우자 계정에도 동일하게 반영 (기타 메모는 배우자 것을 그대로 보존)
      if (targetMember) {
        const targetNote = parseFamilyInfo(targetMember.familyInfo).note
        const targetAddressRequestedAt = parseFamilyInfo(targetMember.familyInfo).addressRequestedAt
        const syncedTargetFamilyInfo = serializeFamilyInfo({ note: targetNote, children: editChildren, addressRequestedAt: targetAddressRequestedAt })
        const { error: childSyncError } = await dbUpdateProfile(targetMember.id, { familyInfo: syncedTargetFamilyInfo })
        if (childSyncError) {
          alert(`자녀 정보를 배우자 계정과 동기화하는 중 오류가 발생했습니다: ${childSyncError.message}`)
        } else {
          onUpdateUsers?.(prev => prev.map(u => u.id === targetMember.id ? { ...u, familyInfo: syncedTargetFamilyInfo } : u))
        }
      }

      // 부부간 주소 공유: 가족 내 호칭이 서로 '부'/'모'로 지정된 경우에만 주소를 함께 저장합니다.
      // (조부모 등 확대가족 구성원과는 공유하지 않도록 하는 안전장치)
      const isSpousePair = !!targetMember
        && (editMemberData.familyRole === '부' || editMemberData.familyRole === '모')
        && (targetMember.familyRole === '부' || targetMember.familyRole === '모')
      // 🐛 과거 버그: 주소를 손대지 않아도 저장할 때마다 배우자 주소를 덮어썼습니다.
      // 편집 중인 분의 주소가 비어 있으면 배우자의 멀쩡한 주소까지 빈칸이 됐고,
      // 안내 메시지는 편집한 분 이름만 언급해서 아무도 눈치채지 못했습니다.
      // → 주소가 실제로 바뀌었고, 빈 값이 아닐 때만 함께 저장합니다.
      const addressChanged = (editMemberData.address || '').trim() !== (editingMember.address || '').trim()
      if (isSpousePair && targetMember && addressChanged && editMemberData.address?.trim()) {
        const { error: addressSyncError } = await dbUpdateProfile(targetMember.id, { address: editMemberData.address })
        if (addressSyncError) {
          alert(`배우자(${targetMember.name}) 계정 주소 동기화 중 오류가 발생했습니다: ${addressSyncError.message}`)
        } else {
          onUpdateUsers?.(prev => prev.map(u => u.id === targetMember.id ? { ...u, address: editMemberData.address } : u))
        }
      }

      // 가족 구성원 ID 수집 후 개인 쿠폰 → 가족 쿠폰 병합
      // (이미 가족 그룹이 있는 경우 전체 구성원, 신규 그룹이면 두 성도)
      const familyMemberIds = allUsers
        .filter(u => u.familyGroupId === resolvedFid || u.id === editingMember.id || u.id === editLinkedMemberId)
        .map(u => u.id)
      const newFamilyName = (() => {
        const members = allUsers.filter(u =>
          u.familyGroupId === resolvedFid || u.id === editingMember.id || u.id === editLinkedMemberId
        )
        const sorted = [...members].sort((a, b) =>
          (FAMILY_ROLE_ORDER[a.familyRole || ''] || 10) - (FAMILY_ROLE_ORDER[b.familyRole || ''] || 10)
        )
        return sorted.length > 1 ? `${sorted.map(m => m.name).join(' · ')} 가정` : `${sorted[0]?.name || editMemberData.name} 가정`
      })()
      try {
        await dbMergeCouponsIntoFamily(familyMemberIds, resolvedFid, newFamilyName)
      } catch (err: unknown) {
        console.error('쿠폰 병합 실패:', err)
        const msg = (err as { message?: string })?.message || String(err)
        alert(`가족 연결은 완료되었으나, 개인 쿠폰 통합 중 오류가 발생했습니다: ${msg}`)
      }

      // 로컬 상태 동기화
      onUpdateUsers?.(prev => prev.map(u => {
        if (u.id === editingMember.id) {
          return {
            ...u,
            name: editMemberData.name,
            phone: editMemberData.phone,
            address: editMemberData.address,
            birthday: editMemberData.birthday,
            role: editMemberData.role,
            teachGroup: editMemberData.role === 'TEACHER' ? editMemberData.teachGroup : '',
            duty: editMemberData.duty,
            labriId: editMemberData.labriId || undefined,
            familyGroupId: resolvedFid || undefined,
            familyInfo: serializedFamilyInfo,
            familyRole: editMemberData.familyRole
          }
        }
        if (u.id === editLinkedMemberId) {
          return { ...u, familyGroupId: resolvedFid || undefined }
        }
        return u
      }))
    } else {
      // 단독 세대로 해제
      const { error: soloUpdateError } = await dbUpdateProfile(editingMember.id, {
        name: editMemberData.name,
        phone: editMemberData.phone,
        address: editMemberData.address,
        birthday: editMemberData.birthday,
        role: editMemberData.role,
        teachGroup: editMemberData.role === 'TEACHER' ? editMemberData.teachGroup : '',
        duty: editMemberData.duty,
        labriId: editMemberData.labriId || undefined,
        familyGroupId: '',
        familyInfo: serializedFamilyInfo,
        familyRole: editMemberData.familyRole
      })
      if (soloUpdateError) {
        alert(`저장 중 오류가 발생했습니다: ${soloUpdateError.message}\n다시 시도해 주세요.`)
        return
      }

      onUpdateUsers?.(prev => prev.map(u => {
        if (u.id === editingMember.id) {
          return {
            ...u,
            name: editMemberData.name,
            phone: editMemberData.phone,
            address: editMemberData.address,
            birthday: editMemberData.birthday,
            role: editMemberData.role,
            teachGroup: editMemberData.role === 'TEACHER' ? editMemberData.teachGroup : '',
            duty: editMemberData.duty,
            labriId: editMemberData.labriId || undefined,
            familyGroupId: undefined,
            familyInfo: serializedFamilyInfo,
            familyRole: editMemberData.familyRole
          }
        }
        return u
      }))
    }

      setEditingMember(null)
      showToast(`✅ ${editMemberData.name}님의 정보가 수정되었습니다.`)
    } finally {
      setIsSavingMember(false)
    }
  }

  // 주소 보완요청 토글 (성도관리 탭에서는 편집 모달이 열려있을 수 있으므로, 성공 시 그 로컬 상태도 함께 동기화)
  const handleRequestAddress = async (user: UserProfile) => {
    const newFamilyInfo = await requestAddressUpdate(user, onUpdateUsers, showToast)
    if (newFamilyInfo !== null && editingMember && editingMember.id === user.id) {
      setEditingMember(prev => prev ? { ...prev, familyInfo: newFamilyInfo } : prev)
    }
  }

  // "성도" 탭 명단도 출석/결석 명단과 동일한 기준(가장 최근 주일 기준 장기결석자 우선)으로 정렬합니다.
  const sortedFilteredMembers = useMemo(() => {
    return filteredMembers
      .map(member => {
        const rec = latestAttendanceDate ? (dbAttendanceData[latestAttendanceDate] || []).find(r => r.userId === member.id) : undefined
        const isAbsent = rec?.status === 'ABSENT'
        return {
          member,
          isAbsent,
          absenceStreak: isAbsent ? getAbsenceStreak(member.id, latestAttendanceDate) : 0
        }
      })
      .sort((a, b) => {
        if (a.isAbsent !== b.isAbsent) return a.isAbsent ? -1 : 1
        if (a.isAbsent && b.absenceStreak !== a.absenceStreak) return b.absenceStreak - a.absenceStreak
        return a.member.name.localeCompare(b.member.name, 'ko')
      })
      .map(x => x.member)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMembers, attendanceDateKeysDesc, dbAttendanceData, latestAttendanceDate])

  // ── 성도 정보 CSV 내보내기 ──
  // ⚠️ 연락처·주소가 들어가는 개인정보 파일이라 **목사(ADMIN)만** 받을 수 있게 합니다.
  // 🔒 이름/주소가 '=', '+', '-', '@' 로 시작해도 엑셀에서 수식으로 실행되지 않도록
  //    앞에 작은따옴표를 붙여 문자열로 고정합니다(CSV 인젝션 방지 — 출석 CSV와 동일).
  const csvField = (value: string | number | undefined | null): string => {
    let v = String(value ?? '')
    if (/^[=+\-@]/.test(v)) v = `'${v}`
    if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`
    return v
  }

  const handleDownloadMembersCSV = () => {
    const rows = sortedFilteredMembers
    let csv = '이름,직분,등급,라브리,연락처,주소,생일,가족현황,가입일\n'
    rows.forEach(m => {
      csv += [
        m.name,
        m.duty || '',
        m.role,
        m.labriId || '라브리 미정',
        m.phone || '',
        m.address || '',
        formatBirthdayDisplay(m.birthday) || '',
        buildFamilyStatusText(m, allUsers, true) || '',
        m.createdAt || '',
      ].map(csvField).join(',') + '\n'
    })
    // 엑셀에서 한글이 깨지지 않도록 맨 앞에 표시(BOM)를 붙입니다.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `더브릿지교회_성도명단_${todayLocalDateStr()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    showToast(`📥 성도 ${rows.length}명 명단 다운로드 시작`)
  }

  return (
    <>
      <div className="space-y-3">
        {/* 검색 */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="이름, 전화번호, 이메일로 검색..."
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2.5 bg-white rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87] shadow-2xs text-gray-900 font-medium"
          />
          {memberSearch && <button onClick={() => setMemberSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">✕</button>}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-2xs text-gray-400 font-semibold">총 {filteredMembers.length}명의 성도</p>
          {/* 성도 정보 CSV — 출석 CSV와 같은 모양의 작은 버튼. 개인정보라 목사님만 보입니다. */}
          {currentUser?.role === 'ADMIN' && (
            <button
              onClick={handleDownloadMembersCSV}
              title="성도 명단 CSV 다운로드"
              aria-label="성도 명단 CSV 다운로드"
              className="w-8 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm flex items-center justify-center shadow-2xs shrink-0 active:scale-95 transition-all"
            >
              📥
            </button>
          )}
        </div>

        {/* 성도 리스트 (장기결석자 우선 정렬) */}
        {sortedFilteredMembers.map(member => (
          <div key={member.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-[#335f87] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                  {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" /> : getInitials(member.name)}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{getUserDisplayName(member, '')}</h3>
                  <p className="text-2xs text-gray-400 mt-0.5">{member.email || '이메일 없음'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${
                  member.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                  member.role === 'LEADER' ? 'bg-blue-100 text-blue-700' :
                  member.role === 'TEACHER' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{member.role}</span>
                {!isLeader && (
                  <button onClick={() => handleStartEditMember(member)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-all">
                    <Edit2 size={13} />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs text-gray-500 pl-14">
              <span>📞 {member.phone ? <a href={`tel:${member.phone}`} className="font-bold text-[#335f87] hover:underline">{member.phone}</a> : '미입력'}</span>
              <span>🏠 {member.address || '미입력'}</span>
              <span>🎂 {formatBirthdayDisplay(member.birthday) || '미입력'}</span>
              <span>⛪ {member.labriId || '라브리 미정'}</span>
              {/* 가족 연계 정보(배우자/자녀)는 좌측 열, 기타 메모는 라브리 바로 아래(우측 열)에
                  각자 열을 맞춰 따로 표시합니다 — 가족 연계와 무관한 관리자 전용 메모라서 섞으면 헷갈립니다. */}
              {buildFamilyStatusText(member, allUsers, false) && (
                <span className="row-start-3 col-start-1">👨‍👩‍👧 {buildFamilyStatusText(member, allUsers, false)}</span>
              )}
              {parseFamilyInfo(member.familyInfo).note && (
                <span className="row-start-3 col-start-2">📝 {parseFamilyInfo(member.familyInfo).note}</span>
              )}
            </div>
          </div>
        ))}

        {filteredMembers.length === 0 && (
          <div className="bg-white p-8 rounded-2xl border border-gray-100 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>
        )}
      </div>

      {/* ── 성도 편집 모달 ── */}
      {editingMember && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setEditingMember(null))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">성도 정보 수정</h3>
                <p className="text-2xs text-slate-400 mt-0.5">{editingMember.name} ({editingMember.email || '이메일 없음'})</p>
              </div>
              <button onClick={() => setEditingMember(null)} className="p-1 hover:bg-white/10 rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {/* 이름 */}
              <div>
                <label className="text-2xs text-gray-400 font-semibold">이름</label>
                <input type="text" value={editMemberData.name} onChange={e => setEditMemberData(p => ({ ...p, name: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" />
              </div>

              {/* 등급 + 직분 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">등급 (Role)</label>
                  <select value={editMemberData.role} onChange={e => setEditMemberData(p => ({ ...p, role: e.target.value as Role }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none">
                    <option value="MEMBER">일반 성도</option>
                    <option value="LEADER">라브리 리더</option>
                    <option value="TEACHER">교회학교 선생님</option>
                    <option value="COUPON">쿠폰 관리자</option>
                    <option value="ADMIN">총괄 관리자</option>
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">직분</label>
                  <select value={editMemberData.duty} onChange={e => setEditMemberData(p => ({ ...p, duty: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none">
                    {['성도', '학생', '청년', '집사', '안수집사', '권사', '장로', '선생', '목사', '전도사', '사모'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 소속 라브리 */}
              <div>
                <label className="text-2xs text-gray-400 font-semibold">소속 라브리</label>
                <select value={editMemberData.labriId} onChange={e => setEditMemberData(p => ({ ...p, labriId: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none">
                  <option value="">라브리 미정</option>
                  <option value="라브리1">라브리1</option>
                  <option value="라브리2">라브리2</option>
                  <option value="라브리3">라브리3</option>

                </select>
              </div>

              {/* 담당 자녀 그룹 — 선생님에게만 보입니다 */}
              {editMemberData.role === 'TEACHER' && (
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">담당 자녀 그룹</label>
                  <select
                    value={editMemberData.teachGroup}
                    onChange={e => setEditMemberData(p => ({ ...p, teachGroup: e.target.value }))}
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
                  >
                    <option value="">전체 담당 (모든 자녀 그룹)</option>
                    {CHILD_LABRI_OPTIONS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <p className="text-2xs text-gray-400 mt-1">
                    비워두면 모든 자녀 그룹을 담당합니다. 선생님이 여러 분으로 나뉘면 그때 각자 지정하시면 됩니다.
                  </p>
                </div>
              )}

              {/* 연락처 */}
              <div>
                <label className="text-2xs text-gray-400 font-semibold">연락처</label>
                <input type="tel" value={editMemberData.phone} onChange={e => setEditMemberData(p => ({ ...p, phone: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" placeholder="037-123-4567" />
              </div>

              {/* 주소 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-2xs text-gray-400 font-semibold">주소</label>
                  {editingMember && (
                    <button
                      type="button"
                      onClick={() => handleRequestAddress(editingMember)}
                      className={`text-2xs font-bold px-1.5 py-0.5 rounded-lg ${parseFamilyInfo(editingMember.familyInfo).addressRequestedAt ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-[#335f87]'}`}
                    >
                      {parseFamilyInfo(editingMember.familyInfo).addressRequestedAt ? '🏠 보완요청됨 (취소)' : '🏠 주소 보완요청'}
                    </button>
                  )}
                </div>
                <input type="text" value={editMemberData.address} onChange={e => setEditMemberData(p => ({ ...p, address: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" placeholder="경남 A동 1023호" />
              </div>

              {/* 생년월일 */}
              <div>
                <label className="text-2xs text-gray-400 font-semibold">생년월일 (YYYY-MM-DD)</label>
                <input type="text" value={editMemberData.birthday} onChange={e => setEditMemberData(p => ({ ...p, birthday: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" placeholder="1990-08-15" />
              </div>

              {/* 가족 연결 및 호칭 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">가족/배우자 연결 (가정별 묶음)</label>
                  <select
                    value={editLinkedMemberId}
                    onChange={e => setEditLinkedMemberId(e.target.value)}
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none"
                  >
                    <option value="">단독 (가족 없음)</option>
                    {getFamilyGroupOptions(allUsers, editingMember.id).map(opt => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">가족 내 호칭/역할</label>
                  <select
                    value={editMemberData.familyRole || ''}
                    onChange={e => setEditMemberData(p => ({ ...p, familyRole: e.target.value }))}
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none"
                  >
                    <option value="">선택 안함</option>
                    {['부', '모', '자녀1', '자녀2', '자녀3', '조부', '조모', '자녀', '기타'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-2xs text-gray-400">가족으로 묶으면 식사 신청과 식사 쿠폰이 조부/조모/부/모/자녀 순으로 정렬되어 하나로 연동됩니다.</p>

              {/* 가족 현황: 미가입 자녀 등 (나이대는 생일 기반 자동 표시) */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-2xs text-gray-400 font-semibold">자녀 등 미가입 가족 (이름 / 생일 / 교회학교)</label>
                  <button type="button" onClick={addEditChild} className="text-2xs font-bold text-[#335f87] px-2 py-0.5 bg-blue-50 rounded-lg">+ 자녀 추가</button>
                </div>
                <div className="mt-1 space-y-1.5">
                  {editChildren.length === 0 && (
                    <p className="text-2xs text-gray-300">등록된 미가입 자녀가 없습니다.</p>
                  )}
                  {editChildren.map(child => (
                    <div key={child.id} className="flex gap-1 items-center">
                      <button
                        type="button"
                        onClick={() => pickChildPhoto(child.id)}
                        disabled={isUploadingChildPhoto}
                        title="자녀 사진 넣기 / 바꾸기"
                        aria-label={`${child.name || '자녀'} 사진 넣기`}
                        className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-[#335f87]/10 text-[#335f87] text-2xs font-bold flex items-center justify-center border border-[#335f87]/20 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {child.avatarUrl
                          ? <img src={child.avatarUrl} alt={child.name} className="w-full h-full object-cover" />
                          : (photoChildId === child.id && isUploadingChildPhoto ? '…' : <Camera size={12} />)}
                      </button>
                      <input
                        type="text"
                        value={child.name}
                        onChange={e => updateEditChild(child.id, { name: e.target.value })}
                        placeholder="이름"
                        className="w-[24%] p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium text-2xs"
                      />
                      <input
                        type="text"
                        value={child.birthday || ''}
                        onChange={e => updateEditChild(child.id, { birthday: e.target.value })}
                        placeholder="생일 YYYY-MM-DD"
                        className="w-[36%] p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium text-2xs"
                      />
                      {/* 교회학교 그룹. 미지정이면 주소록 목록·생일 달력·출석체크에서 빠집니다. */}
                      <select
                        value={child.labriId || ''}
                        onChange={e => updateEditChild(child.id, { labriId: e.target.value })}
                        className="w-[30%] p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium text-2xs"
                      >
                        <option value="">미지정</option>
                        {CHILD_LABRI_OPTIONS.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeEditChild(child.id)} className="p-1.5 text-gray-400 hover:text-rose-500 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                {/* 자녀 사진 고르는 창 (화면에는 안 보입니다) */}
                <input ref={childFileInputRef} type="file" accept="image/*" onChange={handleChildFileChange} className="hidden" />
              </div>

              {/* 기타 메모 — 관리자만 보는 내부 메모(성도에게는 어디에도 노출되지 않음) */}
              <div>
                <label className="text-2xs text-gray-400 font-semibold">기타 메모</label>
                <input type="text" value={editFamilyNote} onChange={e => setEditFamilyNote(e.target.value)} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" placeholder="관리자만 보는 메모 (성도에게는 안 보임)" />
              </div>

              {/* 버튼 */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditingMember(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
                <button onClick={handleSaveMemberEdit} className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1">
                  <Save size={13} /> 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
