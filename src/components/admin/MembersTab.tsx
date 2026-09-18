'use client'

import { useState, useMemo, useRef } from 'react'
import { Search, Edit2, Save, X, Camera, UserPlus, UserMinus, Trash2 } from 'lucide-react'
import { UserProfile, Role, getUserDisplayName, isApprovedMember, getInitials, DUTY_OPTIONS } from '../../lib/mockData'
import { formatBirthdayDisplay, todayLocalDateStr } from '../../lib/dateUtils'
import { dbMergeCouponsIntoFamily, dbUpdateProfile, dbCreateUnregisteredMember, dbClaimUnregisteredMember, dbMarkMemberLeft, dbRestoreMember, dbHasAttendanceHistory, dbDeleteMemberPermanently } from '../../lib/db'
import { FamilyChildInfo, CHILD_LABRI_OPTIONS, CHILD_LABRI_NO_ATTENDANCE as NO_ATTENDANCE, CHILD_ATTENDANCE_GROUPS, parseTeachGroups, serializeTeachGroups, parseFamilyInfo, serializeFamilyInfo, mergeFamilyInfo, buildFamilyStatusText, getSharedChildren, getUnassignedChildren, mergeChildrenLists } from '../../lib/familyInfo'
import { FAMILY_ROLE_ORDER, getFamilyGroupOptions, requestAddressUpdate } from '../../lib/adminHelpers'
import { useModalDismiss, backdropClose } from '../../lib/useModalDismiss'
import { uploadImageToStorage } from '../../lib/storage'
import { askConfirm } from '../ConfirmDialog'
import Card from '../ui/Card'
import SectionTitle from '../ui/SectionTitle'

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
  // 탈퇴 처리된 성도 (가입자·미가입 공통) — 명단에는 안 보이지만 관리자는 여기서 복구할 수 있습니다.
  const leftMembers = allUsers.filter(u => u.role === 'LEFT')
  const [showLeftMembers, setShowLeftMembers] = useState(false)
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
  const [editSpouseName, setEditSpouseName] = useState('')
  const [editChildren, setEditChildren] = useState<FamilyChildInfo[]>([])
  // 부부의 주소가 서로 다를 때 어느 쪽으로 맞출지 — 고르기 전에는 양쪽을 그대로 둡니다.
  const [addressSyncChoice, setAddressSyncChoice] = useState<'keep' | 'self' | 'spouse'>('keep')

  // ── 미가입 성도 (앱을 쓰지 않는 분을 명단에만 올리기) ──
  const [showAddUnregistered, setShowAddUnregistered] = useState(false)
  useModalDismiss(showAddUnregistered, () => setShowAddUnregistered(false))
  // familyMemberId: 가족으로 묶을 상대 성도의 id입니다.
  // (가족 선택 목록의 값은 가족 번호가 아니라 그 가정의 대표 성도 id입니다)
  const [newMember, setNewMember] = useState({
    name: '', phone: '', birthday: '', duty: '성도',
    labriId: '', familyMemberId: '', familyRole: '',
  })
  const [isSavingNewMember, setIsSavingNewMember] = useState(false)

  const openAddUnregistered = () => {
    setNewMember({ name: '', phone: '', birthday: '', duty: '성도', labriId: '', familyMemberId: '', familyRole: '' })
    setShowAddUnregistered(true)
  }

  const handleCreateUnregistered = async () => {
    if (isSavingNewMember) return
    const name = newMember.name.trim()
    if (!name) {
      showToast('⚠️ 이름을 입력해 주세요.')
      return
    }
    setIsSavingNewMember(true)
    // 가족으로 묶으려면 상대에게 가족 번호가 있어야 합니다. 아직 단독이면 여기서 만들어
    // 양쪽에 붙입니다(그래야 식수 쿠폰 가정 이름이 두 분 이름으로 나옵니다).
    let familyGroupId = ''
    const familyTarget = newMember.familyMemberId
      ? allUsers.find(u => u.id === newMember.familyMemberId)
      : undefined
    if (familyTarget) {
      if (familyTarget.familyGroupId) {
        familyGroupId = familyTarget.familyGroupId
      } else {
        const fresh = `fam_${Date.now().toString(36)}`
        const { error } = await dbUpdateProfile(familyTarget.id, { familyGroupId: fresh })
        if (error) {
          setIsSavingNewMember(false)
          showToast(`⚠️ 가족 연결에 실패했습니다: ${error.message || ''}`)
          return
        }
        onUpdateUsers?.(prev => prev.map(u => u.id === familyTarget.id ? { ...u, familyGroupId: fresh } : u))
        familyGroupId = fresh
      }
    }

    const { data, error } = await dbCreateUnregisteredMember({
      name,
      phone: newMember.phone,
      birthday: newMember.birthday,
      duty: newMember.duty,
      labriId: newMember.labriId,
      familyGroupId,
      familyRole: newMember.familyRole,
    })
    setIsSavingNewMember(false)
    if (error || !data) {
      showToast(`⚠️ 추가하지 못했습니다: ${error?.message || ''}`)
      return
    }
    onUpdateUsers?.(prev => [...prev, {
      id: (data as { id: string }).id,
      name,
      email: '',
      phone: newMember.phone.trim(),
      address: '',
      role: 'MEMBER' as Role,
      duty: newMember.duty || '성도',
      labriId: newMember.labriId || undefined,
      familyGroupId: familyGroupId || undefined,
      familyRole: newMember.familyRole || undefined,
      birthday: newMember.birthday || undefined,
      createdAt: todayLocalDateStr(),
      isUnregistered: true,
    }])
    setShowAddUnregistered(false)
    showToast(`✅ ${name}님을 명단에 추가했습니다.`)
  }

  // ── 미가입 성도를 실제 가입 계정과 연결 ──
  const [claimTarget, setClaimTarget] = useState<UserProfile | null>(null)
  useModalDismiss(!!claimTarget, () => setClaimTarget(null))
  const [claimAccountId, setClaimAccountId] = useState('')
  const [isClaiming, setIsClaiming] = useState(false)

  const openClaimModal = (member: UserProfile) => {
    setClaimTarget(member)
    setClaimAccountId('')
  }

  const handleClaim = async () => {
    if (!claimTarget || isClaiming) return
    const account = allUsers.find(u => u.id === claimAccountId)
    if (!account) {
      showToast('⚠️ 연결할 계정을 골라 주세요.')
      return
    }
    if (!await askConfirm(
      `명단의 "${claimTarget.name}" 을(를) 가입 계정 "${account.name}"(${account.email || '이메일 없음'}) 에 연결합니다.\n\n` +
      `${claimTarget.name}님의 출석·식수 기록이 그 계정으로 넘어가고, 두 프로필이 하나로 합쳐집니다.\n` +
      `• 연락처·주소·생년월일·사진 — 본인이 입력한 값\n` +
      `• 직분·라브리·가족 — 명단에 적어 둔 값\n` +
      `• 등급 — 승인하며 고른 값 · 자녀 — 양쪽을 모두 합침\n` +
      `되돌리기 어려우니 같은 분이 맞는지 확인해 주세요.\n\n계속할까요?`
    )) return

    setIsClaiming(true)
    const { error } = await dbClaimUnregisteredMember(claimTarget.id, account.id)
    setIsClaiming(false)
    if (error) {
      showToast(`⚠️ 연결하지 못했습니다: ${error.message || ''}`)
      return
    }
    // 명단 행이 가입 계정 번호로 바뀌었고 빈 행은 사라졌습니다. 화면도 같은 모양으로 맞춥니다.
    //
    // ⚠️ 아래 규칙은 서버 함수(claim_unregistered_member)와 **글자 그대로 같아야** 합니다.
    // 한쪽만 고치면 새로고침하기 전까지 화면이 실제 저장된 값과 다른 것을 보여 줍니다.
    //   · 본인이 입력하는 값(이름·연락처·주소·생일·사진·이메일) → 가입 계정 우선
    //   · 관리자가 정하는 소속(직분·라브리·가족)              → 명단 우선
    //   · 등급                                                → 승인하며 고른 값
    //   · 자녀                                                → 양쪽 합치기
    const fromAccount = (a?: string, list?: string) => a?.trim() || list   // 가입 계정 우선
    const fromList = (list?: string, a?: string) => list?.trim() || a      // 명단 우선
    onUpdateUsers?.(prev => prev
      .filter(u => u.id !== account.id)
      .map(u => u.id === claimTarget.id
        ? {
            ...u,
            id: account.id,
            // 가입 신청 폼 제출 전이면 계정 이름은 카카오/구글 표기라 명단 이름을 덮지 않습니다.
            name: (!!account.signupRequestedAt && fromAccount(account.name, u.name)) || u.name,
            email: fromAccount(account.email, u.email) || '',
            phone: fromAccount(account.phone, u.phone) || '',
            address: fromAccount(account.address, u.address),
            birthday: fromAccount(account.birthday, u.birthday),
            avatarUrl: fromAccount(account.avatarUrl, u.avatarUrl),
            role: account.role || u.role,
            duty: fromList(u.duty, account.duty) || u.duty,
            labriId: fromList(u.labriId, account.labriId),
            familyGroupId: fromList(u.familyGroupId, account.familyGroupId),
            familyRole: fromList(u.familyRole, account.familyRole),
            teachGroup: fromList(u.teachGroup, account.teachGroup),
            familyInfo: mergeFamilyInfo(u.familyInfo, account.familyInfo),
            signupRequestedAt: account.signupRequestedAt || u.signupRequestedAt,
            isUnregistered: false,
          }
        : u))
    setClaimTarget(null)
    showToast(`✅ ${claimTarget.name}님을 가입 계정과 연결했습니다.`)
  }

  // ── 탈퇴 처리 / 복구 / 완전 삭제 (가입자·미가입 성도 공통) ──
  // 목록에서 바로 누르면 오조작하기 쉬워서, 수정 모달을 연 상태에서만 처리할 수 있게 했습니다.
  const [leavingId, setLeavingId] = useState<string | null>(null)
  // 탈퇴 처리 시 커뮤니티 접근(나눔·교우소식·일정)을 계속 허용할지 — 좋게 마무리된 경우에만 켭니다.
  // 어느 쪽이든 주소록·생일·성도수·출석·식사신청 참여에서는 이미 빠집니다(role='LEFT' 자체가 막음).
  const [leaveKeepsAccess, setLeaveKeepsAccess] = useState(false)
  /** 실제로 탈퇴 처리됐으면 true, 취소·거절·실패면 false — 호출 쪽에서 모달을 닫을지 판단합니다. */
  const handleMarkLeft = async (member: UserProfile, keepAppAccess: boolean): Promise<boolean> => {
    if (leavingId) return false
    // 등급을 낮출 때와 동일한 보호: 마지막 남은 총괄 관리자를 탈퇴 처리하면
    // 아무도 관리자 화면에 들어올 수 없게 됩니다.
    if (member.role === 'ADMIN' && allUsers.filter(u => u.role === 'ADMIN' && u.id !== member.id).length === 0) {
      showToast('⚠️ 마지막 남은 총괄 관리자입니다.\n탈퇴 처리하면 아무도 관리자 기능을 사용할 수 없게 됩니다.\n\n먼저 다른 분을 총괄 관리자로 지정한 뒤 처리해 주세요.')
      return false
    }
    const accessNote = keepAppAccess
      ? '\n\n탈퇴 처리 후에도 홈페이지 접근은 허용되며(나눔·교우소식·일정), 주소록·생일·성도수·출석·식사신청 참여에서는 빠집니다.'
      : '\n\n로그인해도 앱을 쓸 수 없게 됩니다.'
    if (!await askConfirm(`${member.name}님을 탈퇴 처리할까요?${accessNote}\n\n출석·식수 등 기록은 그대로 남으며, 나중에 다시 복구할 수 있습니다.`, { confirmLabel: '탈퇴 처리', tone: 'danger' })) return false
    setLeavingId(member.id)
    const { error } = await dbMarkMemberLeft(member.id, member.role, keepAppAccess)
    setLeavingId(null)
    if (error) {
      showToast(`⚠️ 처리하지 못했습니다: ${error.message || ''}`)
      return false
    }
    onUpdateUsers?.(prev => prev.map(u => u.id === member.id ? { ...u, role: 'LEFT' as Role, previousRole: member.role, keepAppAccess } : u))
    showToast(`${member.name}님을 탈퇴 처리했습니다.`)
    return true
  }

  const [restoringId, setRestoringId] = useState<string | null>(null)
  const handleRestoreMember = async (member: UserProfile) => {
    if (restoringId) return
    const restoreTo = member.previousRole || 'MEMBER'
    if (!await askConfirm(`${member.name}님을 다시 활동 명단으로 되돌릴까요?`)) return
    setRestoringId(member.id)
    const { error } = await dbRestoreMember(member.id, restoreTo)
    setRestoringId(null)
    if (error) {
      showToast(`⚠️ 복구하지 못했습니다: ${error.message || ''}`)
      return
    }
    onUpdateUsers?.(prev => prev.map(u => u.id === member.id ? { ...u, role: restoreTo, previousRole: undefined } : u))
    showToast(`${member.name}님을 복구했습니다.`)
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const handleDeletePermanently = async (member: UserProfile) => {
    if (deletingId) return
    // 이 목록의 member.role은 이미 'LEFT'이므로, 탈퇴 전 등급은 previousRole에 있습니다.
    if (member.previousRole === 'ADMIN' && allUsers.filter(u => u.role === 'ADMIN').length === 0) {
      showToast('⚠️ 탈퇴 전 마지막 총괄 관리자였던 분입니다. 복구용으로 남겨두어야 하니 완전 삭제할 수 없습니다.')
      return
    }
    setDeletingId(member.id)
    // 출석 기록이 하나라도 있으면 완전 삭제를 막습니다 — 몇 년치 기록을 실수로 되돌릴 수 없이
    // 날리는 사고를 막기 위한 안전장치입니다. 그런 분은 탈퇴 처리만 가능합니다.
    const hasHistory = await dbHasAttendanceHistory(member.id)
    if (hasHistory) {
      setDeletingId(null)
      showToast(`⚠️ ${member.name}님은 출석 기록이 있어 완전 삭제할 수 없습니다. 탈퇴 처리만 가능합니다.`)
      return
    }
    if (!await askConfirm(`${member.name}님을 명단에서 완전히 삭제할까요?\n\n출석 기록은 없는 것을 확인했습니다. 이 작업은 되돌릴 수 없습니다.`, { confirmLabel: '삭제', tone: 'danger' })) {
      setDeletingId(null)
      return
    }
    const { error } = await dbDeleteMemberPermanently(member.id)
    setDeletingId(null)
    if (error) {
      showToast(`⚠️ 삭제하지 못했습니다: ${error.message || ''}`)
      return
    }
    onUpdateUsers?.(prev => prev.filter(u => u.id !== member.id))
    showToast(`${member.name}님을 명단에서 삭제했습니다.`)
  }

  /**
   * 이름이 같은 "미가입 명단"과 "가입 계정"이 함께 있는 경우.
   *
   * 관리자가 연결을 깜빡하면 같은 분이 명단에 둘로 남아 출석 명단에도 두 번 뜹니다.
   * 승인할 때마다 묻지는 않고, 여기서 조용히 알려만 줍니다.
   */
  const claimSuggestions = useMemo(() => {
    const registered = allUsers.filter(u => !u.isUnregistered && isApprovedMember(u.role))
    return allUsers
      .filter(u => u.isUnregistered)
      .map(placeholder => ({
        placeholder,
        match: registered.find(r => r.name.trim() === placeholder.name.trim()),
      }))
      .filter((x): x is { placeholder: UserProfile; match: UserProfile } => !!x.match)
  }, [allUsers])

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

  const unassignedChildren = useMemo(() => getUnassignedChildren(allUsers), [allUsers])

  // 자녀 이름으로도 부모를 찾을 수 있습니다 — 자녀는 계정이 없어서 명단에 직접 뜨지 않고,
  // 교회학교 그룹을 정해 주려면 부모 카드를 열어야 하기 때문입니다.
  const filteredMembers = memberSearch
    ? approvedMembers.filter(m =>
        m.name.includes(memberSearch) ||
        m.phone.includes(memberSearch) ||
        (m.email && m.email.includes(memberSearch)) ||
        getSharedChildren(m, allUsers).some(c => c.name.includes(memberSearch))
      )
    : approvedMembers

  const handleStartEditMember = (member: UserProfile) => {
    setEditingMember(member)
    setLeaveKeepsAccess(false)
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
    const parsed = parseFamilyInfo(member.familyInfo)
    setEditFamilyNote(parsed.note)
    setEditSpouseName(parsed.spouseName || '')
    setEditChildren(getSharedChildren(member, allUsers))
    setAddressSyncChoice('keep')
  }

  /**
   * 가족 연결 대상을 바꿀 때, 그 사람이 이미 등록해 둔 자녀를 목록에 합쳐 옵니다.
   *
   * 🐛 과거 사고: 자녀 목록은 창을 열 때 한 번만 읽어 옵니다. 아직 가족으로 묶이지 않은
   * 두 분을 여기서 새로 연결하면, 상대의 자녀는 그 목록에 들어있지 않은 채로 저장되어
   * **상대 계정의 자녀가 통째로 지워졌습니다.** (실제로 자녀 두 명이 사라진 적이 있습니다)
   */
  const handleChangeLinkedMember = (targetId: string) => {
    setEditLinkedMemberId(targetId)
    setAddressSyncChoice('keep')
    const target = targetId ? allUsers.find(u => u.id === targetId) : null
    if (!target) return
    setEditChildren(prev => mergeChildrenLists(prev, parseFamilyInfo(target.familyInfo).children))
  }

  // 연결된 배우자와 주소가 서로 다르면(둘 다 입력되어 있고 값이 다름) 어느 쪽으로 맞출지 물어봅니다.
  // 주소를 함께 쓰는 건 부부(부/모)뿐이라, 조부모 등 다른 가족과 묶인 경우에는 묻지 않습니다.
  const addressConflictSpouse = (() => {
    const target = editLinkedMemberId ? allUsers.find(u => u.id === editLinkedMemberId) : null
    if (!target) return null
    const isParentRole = (role?: string) => role === '부' || role === '모'
    if (!isParentRole(editMemberData.familyRole) || !isParentRole(target.familyRole)) return null
    const theirs = (target.address || '').trim()
    const mine = (editMemberData.address || '').trim()
    return theirs && mine && theirs !== mine ? target : null
  })()

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

    if (!editMemberData.name?.trim()) {
      showToast('⚠️ 이름을 입력해 주세요.')
      return
    }

    const wasAdmin = editingMember.role === 'ADMIN'
    const willBeAdmin = editMemberData.role === 'ADMIN'
    if (wasAdmin && !willBeAdmin) {
      const otherAdmins = allUsers.filter(u => u.role === 'ADMIN' && u.id !== editingMember.id)
      if (otherAdmins.length === 0) {
        showToast('⚠️ 마지막 남은 총괄 관리자입니다.\n등급을 낮추면 아무도 관리자 기능을 사용할 수 없게 됩니다.\n\n먼저 다른 분을 총괄 관리자로 지정한 뒤 변경해 주세요.')
        return
      }
      if (currentUser && editingMember.id === currentUser.id) {
        if (!await askConfirm('본인의 등급을 낮추려고 합니다.\n저장하면 관리자 화면에 더 이상 들어올 수 없습니다.\n\n계속할까요?', { confirmLabel: '등급 낮추기', tone: 'danger' })) return
      }
    }

    setIsSavingMember(true)
    try {

    // 가족 현황(자녀 목록 + 기타 메모 + 미가입 배우자)을 저장용 문자열로 직렬화
    const ownAddressRequestedAt = parseFamilyInfo(editingMember.familyInfo).addressRequestedAt
    const serializedFamilyInfo = serializeFamilyInfo({ note: editFamilyNote, spouseName: editSpouseName.trim(), children: editChildren, addressRequestedAt: ownAddressRequestedAt })

    let resolvedFid: string | null = null

    if (editLinkedMemberId) {
      const targetMember = allUsers.find(u => u.id === editLinkedMemberId)
      resolvedFid = targetMember?.familyGroupId || editingMember.familyGroupId || `fam_${Date.now().toString(36)}`

      // 상대 계정에 있는 자녀가 이 목록에서 빠져 있으면, 저장 시 그 자녀가 지워집니다.
      // 실수로 지우는 일이 없도록 이름을 보여 주고 확인받습니다.
      if (targetMember) {
        const editIds = new Set(editChildren.map(c => c.id))
        const dropped = parseFamilyInfo(targetMember.familyInfo).children.filter(c => !editIds.has(c.id))
        if (dropped.length > 0) {
          const names = dropped.map(c => c.name?.trim() || '이름 없음').join(', ')
          if (!await askConfirm(`${targetMember.name} 님 계정에 등록된 자녀(${names})가 아래 목록에 없습니다.\n이대로 저장하면 해당 자녀 정보가 지워집니다.\n\n계속할까요?`)) {
            return
          }
        }
      }

      // 부부 주소 맞추기: 서로 다를 때만 관리자가 고른 쪽으로 맞춥니다(기본은 각자 유지).
      const spouseAddress = (targetMember?.address || '').trim()
      const selfAddressInput = (editMemberData.address || '').trim()
      const hasAddressConflict = !!targetMember && !!spouseAddress && !!selfAddressInput && spouseAddress !== selfAddressInput
      const finalSelfAddress = hasAddressConflict && addressSyncChoice === 'spouse' ? spouseAddress : editMemberData.address

      // 본인 업데이트
      const { error: selfUpdateError } = await dbUpdateProfile(editingMember.id, {
        name: editMemberData.name,
        phone: editMemberData.phone,
        address: finalSelfAddress,
        birthday: editMemberData.birthday,
        role: editMemberData.role,
        // TEACHER/ADMIN/LEADER는 담당 부서를 저장하고, 그 외 등급으로 바뀌면 의미가 없으니 비웁니다.
        teachGroup: ['TEACHER', 'ADMIN', 'LEADER'].includes(editMemberData.role) ? editMemberData.teachGroup : '',
        duty: editMemberData.duty,
        labriId: editMemberData.labriId || undefined,
        familyGroupId: resolvedFid,
        familyInfo: serializedFamilyInfo,
        familyRole: editMemberData.familyRole
      })
      if (selfUpdateError) {
        showToast(`⚠️ 저장 중 오류가 발생했습니다: ${selfUpdateError.message}\n다시 시도해 주세요.`)
        return
      }

      // 상대방도 같은 familyGroupId로 업데이트
      if (targetMember && targetMember.familyGroupId !== resolvedFid) {
        const { error: linkedUpdateError } = await dbUpdateProfile(targetMember.id, { familyGroupId: resolvedFid })
        if (linkedUpdateError) {
          showToast(`⚠️ 가족 연결 대상(${targetMember.name})의 정보 저장 중 오류가 발생했습니다: ${linkedUpdateError.message}`)
        }
      }

      // 배우자와 자녀 정보 동기화: 방금 편집한 자녀 목록을 배우자 계정에도 동일하게 반영 (기타 메모는 배우자 것을 그대로 보존)
      if (targetMember) {
        const targetNote = parseFamilyInfo(targetMember.familyInfo).note
        const targetAddressRequestedAt = parseFamilyInfo(targetMember.familyInfo).addressRequestedAt
        const syncedTargetFamilyInfo = serializeFamilyInfo({ note: targetNote, children: editChildren, addressRequestedAt: targetAddressRequestedAt })
        const { error: childSyncError } = await dbUpdateProfile(targetMember.id, { familyInfo: syncedTargetFamilyInfo })
        if (childSyncError) {
          showToast(`⚠️ 자녀 정보를 배우자 계정과 동기화하는 중 오류가 발생했습니다: ${childSyncError.message}`)
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
      // → 주소가 서로 다르면 관리자가 고른 쪽으로만 맞추고, 다르지 않으면
      //   새로 입력·수정했을 때만 배우자에게도 함께 저장합니다.
      const addressChanged = selfAddressInput !== (editingMember.address || '').trim()
      const shouldPushAddressToSpouse = hasAddressConflict
        ? addressSyncChoice === 'self'
        : (addressChanged && !!selfAddressInput)
      if (isSpousePair && targetMember && shouldPushAddressToSpouse) {
        const { error: addressSyncError } = await dbUpdateProfile(targetMember.id, { address: editMemberData.address })
        if (addressSyncError) {
          showToast(`⚠️ 배우자(${targetMember.name}) 계정 주소 동기화 중 오류가 발생했습니다: ${addressSyncError.message}`)
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
        showToast(`⚠️ 가족 연결은 완료되었으나, 개인 쿠폰 통합 중 오류가 발생했습니다: ${msg}`)
      }

      // 로컬 상태 동기화
      onUpdateUsers?.(prev => prev.map(u => {
        if (u.id === editingMember.id) {
          return {
            ...u,
            name: editMemberData.name,
            phone: editMemberData.phone,
            address: finalSelfAddress,
            birthday: editMemberData.birthday,
            role: editMemberData.role,
            // TEACHER/ADMIN/LEADER는 담당 부서를 저장하고, 그 외 등급으로 바뀌면 의미가 없으니 비웁니다.
        teachGroup: ['TEACHER', 'ADMIN', 'LEADER'].includes(editMemberData.role) ? editMemberData.teachGroup : '',
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
        // TEACHER/ADMIN/LEADER는 담당 부서를 저장하고, 그 외 등급으로 바뀌면 의미가 없으니 비웁니다.
        teachGroup: ['TEACHER', 'ADMIN', 'LEADER'].includes(editMemberData.role) ? editMemberData.teachGroup : '',
        duty: editMemberData.duty,
        labriId: editMemberData.labriId || undefined,
        familyGroupId: '',
        familyInfo: serializedFamilyInfo,
        familyRole: editMemberData.familyRole
      })
      if (soloUpdateError) {
        showToast(`⚠️ 저장 중 오류가 발생했습니다: ${soloUpdateError.message}\n다시 시도해 주세요.`)
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
            // TEACHER/ADMIN/LEADER는 담당 부서를 저장하고, 그 외 등급으로 바뀌면 의미가 없으니 비웁니다.
        teachGroup: ['TEACHER', 'ADMIN', 'LEADER'].includes(editMemberData.role) ? editMemberData.teachGroup : '',
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

  // "성도" 탭 명단도 출석/결석 명단과 동일한 기준(가장 최근 주일 기준 장기결석자 우선)으로 정렬하되,
  // 부부(같은 familyGroupId + 부/모 호칭)는 한 쌍으로 묶어서 나란히 보여줍니다.
  const sortedMemberUnits = useMemo(() => {
    const rows = filteredMembers.map(member => {
      const rec = latestAttendanceDate ? (dbAttendanceData[latestAttendanceDate] || []).find(r => r.userId === member.id) : undefined
      const isAbsent = rec?.status === 'ABSENT'
      return {
        member,
        isAbsent,
        absenceStreak: isAbsent ? getAbsenceStreak(member.id, latestAttendanceDate) : 0
      }
    })

    // 부부 묶기: 같은 familyGroupId를 가진 두 성도가 모두 이 목록 안에 있을 때만 한 쌍으로 묶습니다.
    // (자녀가 성도로 가입해 있어도 familyRole이 '자녀'면 부부 짝짓기 대상에서 제외)
    const paired = new Set<string>()
    const units = rows
      .filter(r => r.member.familyRole !== '자녀')
      .map(r => {
        if (paired.has(r.member.id)) return null
        const spouse = r.member.familyGroupId
          ? rows.find(o => o.member.id !== r.member.id && !paired.has(o.member.id) && o.member.familyRole !== '자녀' && o.member.familyGroupId === r.member.familyGroupId)
          : undefined
        if (spouse) {
          paired.add(r.member.id)
          paired.add(spouse.member.id)
          const members = [r, spouse].sort((a, b) =>
            (FAMILY_ROLE_ORDER[a.member.familyRole || ''] || 10) - (FAMILY_ROLE_ORDER[b.member.familyRole || ''] || 10)
          )
          return {
            members,
            isAbsent: members.some(m => m.isAbsent),
            absenceStreak: Math.max(...members.map(m => m.absenceStreak))
          }
        }
        paired.add(r.member.id)
        return { members: [r], isAbsent: r.isAbsent, absenceStreak: r.absenceStreak }
      })
      .filter((u): u is NonNullable<typeof u> => u !== null)

    // 자녀 호칭 성도(familyRole === '자녀')는 짝짓기 없이 단독 유닛으로 추가
    rows.filter(r => r.member.familyRole === '자녀').forEach(r => {
      units.push({ members: [r], isAbsent: r.isAbsent, absenceStreak: r.absenceStreak })
    })

    return units.sort((a, b) => {
      if (a.isAbsent !== b.isAbsent) return a.isAbsent ? -1 : 1
      if (a.isAbsent && b.absenceStreak !== a.absenceStreak) return b.absenceStreak - a.absenceStreak
      return a.members[0].member.name.localeCompare(b.members[0].member.name, 'ko')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMembers, attendanceDateKeysDesc, dbAttendanceData, latestAttendanceDate])

  const sortedFilteredMembers = useMemo(() => sortedMemberUnits.flatMap(u => u.members.map(x => x.member)), [sortedMemberUnits])

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
            className="w-full pl-8 pr-3 py-2.5 bg-white rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-brand shadow-2xs text-gray-900 font-medium"
          />
          {memberSearch && <button onClick={() => setMemberSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">✕</button>}
        </div>

        {/* 부모가 등록했지만 교회학교 그룹이 없는 자녀 — 그룹을 정해 주기 전까지
            주소록·생일·출석 어디에도 나오지 않으므로 여기서 알려 줍니다. */}
        {unassignedChildren.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
            <p className="text-2xs font-bold text-amber-900">
              🧒 교회학교 그룹을 정해 주세요 ({unassignedChildren.length}명)
            </p>
            <p className="text-2xs text-amber-700 leading-snug">
              부모가 등록한 자녀입니다. 그룹을 정하기 전까지는 주소록·생일·출석 명단에 나오지 않습니다.
              이름을 누르면 부모 카드를 찾아 드립니다.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {unassignedChildren.map(child => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setMemberSearch(child.name)}
                  className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-2xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  {child.name}
                  {child.parentName && <span className="font-normal text-amber-600 ml-1">{child.parentName}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 같은 이름의 미가입 명단과 가입 계정이 함께 있으면 조용히 알려줍니다.
            연결을 깜빡하면 같은 분이 출석 명단에 두 번 뜹니다. */}
        {claimSuggestions.length > 0 && !isLeader && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-1.5">
            <p className="text-2xs font-bold text-sky-900">
              🔗 같은 이름으로 가입한 분이 있습니다 ({claimSuggestions.length}명)
            </p>
            <p className="text-2xs text-sky-700 leading-snug">
              명단에 있는 미가입 성도와 이름이 같은 계정이 있습니다. 같은 분이면 연결해 주세요.
              연결하면 출석·식수 기록이 그대로 넘어갑니다. 동명이인이면 그냥 두시면 됩니다.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {claimSuggestions.map(({ placeholder }) => (
                <button
                  key={placeholder.id}
                  type="button"
                  onClick={() => openClaimModal(placeholder)}
                  className="px-2 py-1 bg-white border border-sky-200 rounded-lg text-2xs font-bold text-sky-900 hover:bg-sky-100 transition-colors"
                >
                  {placeholder.name} 연결하기
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-gray-400 font-semibold">총 {filteredMembers.length}명의 성도</p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 앱을 쓰지 않는 분을 명단에 직접 추가합니다 (출석체크·식수 가정에 포함) */}
            {!isLeader && (
              <button
                onClick={openAddUnregistered}
                className="px-2.5 h-8 bg-brand hover:bg-brand-hover text-white rounded-lg text-2xs font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
              >
                <UserPlus size={13} /> 미가입 성도
              </button>
            )}
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
        </div>

        {/* 탈퇴 처리된 성도 — 명단·출석에는 안 보이지만 여기서 복구하거나(기록 보존)
            기록이 전혀 없는 경우에 한해 완전 삭제할 수 있습니다. */}
        {!isLeader && leftMembers.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLeftMembers(v => !v)}
              className="w-full p-3 flex items-center justify-between text-left"
            >
              <span className="text-2xs font-bold text-gray-500">🚪 탈퇴 처리된 성도 ({leftMembers.length}명)</span>
              <span className="text-2xs text-gray-400">{showLeftMembers ? '접기 ▲' : '펼치기 ▼'}</span>
            </button>
            {showLeftMembers && (
              <div className="px-3 pb-3 space-y-1.5">
                {leftMembers.map(member => (
                  <div key={member.id} className="bg-white border border-gray-100 rounded-lg p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-700 truncate">{member.name}</p>
                      <p className="text-2xs text-gray-400">
                        {member.previousRole ? `이전 등급: ${member.previousRole}` : ''}
                        {member.isUnregistered ? ' · 미가입' : ''}
                        {member.keepAppAccess ? ' · 🟢 커뮤니티 접근 유지' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRestoreMember(member)}
                        disabled={restoringId === member.id}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-2xs font-bold rounded-lg disabled:opacity-50"
                      >
                        복구
                      </button>
                      <button
                        onClick={() => handleDeletePermanently(member)}
                        disabled={deletingId === member.id}
                        title="출석 기록이 없을 때만 완전 삭제할 수 있습니다"
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 성도 리스트 (장기결석자 우선 정렬 + 부부는 한 쌍으로 묶어서 표시) */}
        {sortedMemberUnits.map(unit => {
          const cards = unit.members.map(({ member }) => (
            <Card key={member.id} className="space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                    {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : getInitials(member.name)}
                  </div>
                  <div>
                    <SectionTitle>{getUserDisplayName(member, '')}</SectionTitle>
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
                  {member.isUnregistered && (
                    <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">미가입</span>
                  )}
                  {!isLeader && (
                    <button onClick={() => handleStartEditMember(member)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-all">
                      <Edit2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs text-gray-500 pl-14">
                <span>📞 {member.phone ? <a href={`tel:${member.phone}`} className="font-bold text-brand hover:underline">{member.phone}</a> : '미입력'}</span>
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

              {/* 이 분이 앱에 가입하셨다면, 관리자가 그 계정과 이어 붙입니다.
                  출석·식수 기록이 새 계정으로 그대로 넘어갑니다. */}
              {member.isUnregistered && !isLeader && (
                <div className="pl-14">
                  <button
                    onClick={() => openClaimModal(member)}
                    className="text-2xs font-bold text-brand bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                  >
                    가입 계정과 연결하기 ›
                  </button>
                </div>
              )}
            </Card>
          ))

          if (unit.members.length < 2) return cards[0]

          return (
            <div key={unit.members.map(({ member }) => member.id).join('-')} className="bg-blue-50/40 border border-blue-100 rounded-2xl p-2 space-y-2">
              <p className="text-2xs font-bold text-brand px-1">👫 부부</p>
              {cards}
            </div>
          )
        })}

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
                <input type="text" value={editMemberData.name} onChange={e => setEditMemberData(p => ({ ...p, name: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium" />
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
                    {DUTY_OPTIONS.map(d => (
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
                  {/* 출석을 따로 챙기지 않는 분(주로 미가입 배우자)을 출석체크 명단에서 뺍니다.
                      출석 그룹은 라브리1~3·미정뿐이라 이 값이면 어느 명단에도 뜨지 않습니다. */}
                  <option value={NO_ATTENDANCE}>출석 미적용 (출석체크 명단에서 제외)</option>
                </select>
              </div>

              {/*
                담당 자녀 그룹 — 교회학교 출석을 만질 수 있는 역할(선생님·리더·관리자) 모두에게 보입니다.
                🐛 과거 문제: 선생님(TEACHER)에게만 이 칸을 보여줬습니다. 그래서 목사님처럼
                관리자 등급으로 특정 부서(중고등부 등)를 직접 담당하시는 분은 자신의 부서를
                지정할 방법이 없었고, "부서 미지정 알림"은 부서 미지정 선생님들에게 뭉뚱그려
                가서, 정작 담당자는 알림을 못 받고 무관한 선생님이 받는 일이 있었습니다.
                → 아래에서 선택한 부서만 정확히 그 사람에게 보내도록 서버 함수도 함께 고쳤습니다.
              */}
              {(editMemberData.role === 'TEACHER' || editMemberData.role === 'ADMIN' || editMemberData.role === 'LEADER') && (
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">담당 자녀 그룹 (복수 선택 가능)</label>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {CHILD_ATTENDANCE_GROUPS.map(g => {
                      const selected = parseTeachGroups(editMemberData.teachGroup).includes(g)
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setEditMemberData(p => {
                            const cur = parseTeachGroups(p.teachGroup)
                            const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]
                            return { ...p, teachGroup: serializeTeachGroups(next) }
                          })}
                          className={`px-2.5 py-2 rounded-xl text-2xs font-bold border transition-all ${
                            selected
                              ? 'bg-brand text-white border-brand'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {selected ? '✓ ' : ''}{g}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-2xs text-gray-400 mt-1">
                    {editMemberData.role === 'TEACHER'
                      ? '하나도 고르지 않으면 모든 자녀 그룹을 담당하는 것으로 보고, 미완료 부서가 있을 때마다 전체 요약 알림을 받습니다.'
                      : '고른 부서의 출석체크 미완료 알림만 이 분께 갑니다. 출석체크 자체는 부서 선택과 무관하게 모든 부서를 할 수 있습니다.'}
                  </p>
                </div>
              )}

              {/* 연락처 */}
              <div>
                <label className="text-2xs text-gray-400 font-semibold">연락처</label>
                <input type="tel" value={editMemberData.phone} onChange={e => setEditMemberData(p => ({ ...p, phone: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium" placeholder="037-123-4567" />
              </div>

              {/* 주소 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-2xs text-gray-400 font-semibold">주소</label>
                  {editingMember && (
                    <button
                      type="button"
                      onClick={() => handleRequestAddress(editingMember)}
                      className={`text-2xs font-bold px-1.5 py-0.5 rounded-lg ${parseFamilyInfo(editingMember.familyInfo).addressRequestedAt ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-brand'}`}
                    >
                      {parseFamilyInfo(editingMember.familyInfo).addressRequestedAt ? '🏠 보완요청됨 (취소)' : '🏠 주소 보완요청'}
                    </button>
                  )}
                </div>
                <input type="text" value={editMemberData.address} onChange={e => setEditMemberData(p => ({ ...p, address: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium" placeholder="경남 A동 1023호" />

                {/* 부부의 주소가 서로 다를 때만 물어봅니다. 고르지 않으면 양쪽 다 그대로 둡니다. */}
                {addressConflictSpouse && (
                  <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                    <p className="text-2xs font-bold text-amber-900">
                      {addressConflictSpouse.name} 님과 주소가 다릅니다. 어느 쪽으로 맞출까요?
                    </p>
                    {([
                      { key: 'keep', label: '각자 주소 그대로 두기', detail: '' },
                      { key: 'self', label: '이 화면의 주소로 맞추기', detail: editMemberData.address },
                      { key: 'spouse', label: `${addressConflictSpouse.name} 님 주소로 맞추기`, detail: addressConflictSpouse.address || '' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setAddressSyncChoice(opt.key)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-2xs border transition-colors ${
                          addressSyncChoice === opt.key
                            ? 'bg-white border-amber-400 text-amber-900 font-bold'
                            : 'bg-white/50 border-amber-100 text-amber-700'
                        }`}
                      >
                        {addressSyncChoice === opt.key ? '● ' : '○ '}{opt.label}
                        {opt.detail && <span className="block font-normal text-amber-600 pl-3">{opt.detail}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 생년월일 */}
              <div>
                <label className="text-2xs text-gray-400 font-semibold">생년월일 (YYYY-MM-DD)</label>
                <input type="text" value={editMemberData.birthday} onChange={e => setEditMemberData(p => ({ ...p, birthday: e.target.value }))} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium" placeholder="1990-08-15" />
              </div>

              {/* 가족 연결 및 호칭 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">가족/배우자 연결 (가정별 묶음)</label>
                  <select
                    value={editLinkedMemberId}
                    onChange={e => handleChangeLinkedMember(e.target.value)}
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

              {/* 미가입 배우자 성함 (계정 연동 없이 텍스트로만 저장 시) */}
              {!editLinkedMemberId && (
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">미가입 배우자 성함 (앱에 미가입 시 직접 입력)</label>
                  <input
                    type="text"
                    value={editSpouseName}
                    onChange={e => setEditSpouseName(e.target.value)}
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium text-xs"
                    placeholder="예: 홍길순 (배우자가 있을 경우 입력)"
                  />
                </div>
              )}

              {/* 가족 현황: 미가입 자녀 등 (교회학교 그룹은 직접 지정합니다) */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-2xs text-gray-400 font-semibold">자녀 등 미가입 가족 (이름 / 생일 / 교회학교)</label>
                  <button type="button" onClick={addEditChild} className="text-2xs font-bold text-brand px-2 py-0.5 bg-blue-50 rounded-lg">+ 자녀 추가</button>
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
                        className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-brand/10 text-brand text-2xs font-bold flex items-center justify-center border border-brand/20 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {child.avatarUrl
                          ? <img src={child.avatarUrl} alt={child.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          : (photoChildId === child.id && isUploadingChildPhoto ? '…' : <Camera size={12} />)}
                      </button>
                      <input
                        type="text"
                        value={child.name}
                        onChange={e => updateEditChild(child.id, { name: e.target.value })}
                        placeholder="이름"
                        className="w-[24%] p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium text-2xs"
                      />
                      <input
                        type="text"
                        value={child.birthday || ''}
                        onChange={e => updateEditChild(child.id, { birthday: e.target.value })}
                        placeholder="생일 YYYY-MM-DD"
                        className="w-[36%] p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium text-2xs"
                      />
                      {/* 교회학교 그룹. 미지정이면 주소록 목록·생일 달력·출석체크에서 빠집니다. */}
                      <select
                        value={child.labriId || ''}
                        onChange={e => updateEditChild(child.id, { labriId: e.target.value })}
                        className="w-[30%] p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium text-2xs"
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
                <input type="text" value={editFamilyNote} onChange={e => setEditFamilyNote(e.target.value)} className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium" placeholder="관리자만 보는 메모 (성도에게는 안 보임)" />
              </div>

              {/* 탈퇴 처리 — 목록에서 바로 안 보이게 여기로만 옮겼습니다(오조작 방지) */}
              {!isLeader && (
                <div className="pt-2 border-t border-gray-100 space-y-1.5">
                  <label className="flex items-center gap-1.5 text-2xs text-gray-500 px-0.5">
                    <input
                      type="checkbox"
                      checked={leaveKeepsAccess}
                      onChange={e => setLeaveKeepsAccess(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    탈퇴 처리 후 홈페이지 접근 허용
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const left = await handleMarkLeft(editingMember, leaveKeepsAccess)
                      if (left) setEditingMember(null)
                    }}
                    disabled={leavingId === editingMember.id}
                    className="w-full py-2 text-2xs font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <UserMinus size={13} /> {leavingId === editingMember.id ? '처리 중...' : '이 성도 탈퇴 처리'}
                  </button>
                </div>
              )}

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

      {/* ── 미가입 성도 추가 모달 ── */}
      {showAddUnregistered && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setShowAddUnregistered(false))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-brand text-white px-5 py-4">
              <h3 className="font-black text-sm">미가입 성도 추가</h3>
              <p className="text-2xs text-blue-200 mt-0.5">앱을 쓰지 않는 분을 명단에만 올립니다</p>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-2xs text-gray-500 bg-gray-50 rounded-xl p-2.5 leading-relaxed">
                출석체크 명단과 식수 쿠폰의 가정 이름, 주소록에 이름·소속이 들어갑니다.
                <strong className="text-gray-700"> 주소록 세부정보는 공란으로 표시되고, 생일 달력에는 나오지 않습니다.</strong>
                <br />
                나중에 본인이 앱에 가입하면 이 명단과 연결해 출석 기록을 그대로 이어줄 수 있습니다.
              </p>

              <div>
                <label className="text-2xs text-gray-400 font-semibold">이름 <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={newMember.name}
                  onChange={e => setNewMember(p => ({ ...p, name: e.target.value }))}
                  placeholder="예: 홍길순"
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">직분</label>
                  <select
                    value={newMember.duty}
                    onChange={e => setNewMember(p => ({ ...p, duty: e.target.value }))}
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none"
                  >
                    {DUTY_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">연락처</label>
                  <input
                    type="tel"
                    value={newMember.phone}
                    onChange={e => setNewMember(p => ({ ...p, phone: e.target.value }))}
                    placeholder="선택"
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-2xs text-gray-400 font-semibold">출석 그룹</label>
                <select
                  value={newMember.labriId}
                  onChange={e => setNewMember(p => ({ ...p, labriId: e.target.value }))}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none"
                >
                  <option value="">라브리 미정 (출석체크 &quot;미정&quot; 명단에 표시)</option>
                  <option value="라브리1">라브리1</option>
                  <option value="라브리2">라브리2</option>
                  <option value="라브리3">라브리3</option>
                  <option value={NO_ATTENDANCE}>출석 미적용 (출석체크 명단에서 제외)</option>
                </select>
                <p className="text-2xs text-gray-400 mt-1">
                  실제로 예배에 나오시는 분은 라브리를, 배우자로만 표기하면 되는 분은 &apos;출석 미적용&apos;을 고르세요.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">가족 연결</label>
                  <select
                    value={newMember.familyMemberId}
                    onChange={e => setNewMember(p => ({ ...p, familyMemberId: e.target.value }))}
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none"
                  >
                    <option value="">단독 (가족 없음)</option>
                    {getFamilyGroupOptions(allUsers).map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-400 font-semibold">가족 내 호칭</label>
                  <select
                    value={newMember.familyRole}
                    onChange={e => setNewMember(p => ({ ...p, familyRole: e.target.value }))}
                    className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none"
                  >
                    <option value="">미지정</option>
                    {['조부', '조모', '부', '모', '자녀', '기타'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-2xs text-gray-400 font-semibold">생년월일 (YYYY-MM-DD)</label>
                <input
                  type="text"
                  value={newMember.birthday}
                  onChange={e => setNewMember(p => ({ ...p, birthday: e.target.value }))}
                  placeholder="선택 · 예: 1990-08-15"
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:border-brand text-gray-900 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAddUnregistered(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
                <button
                  onClick={handleCreateUnregistered}
                  disabled={isSavingNewMember}
                  className="flex-1 py-2.5 bg-brand text-white text-xs font-bold rounded-xl disabled:opacity-60"
                >
                  {isSavingNewMember ? '추가 중...' : '명단에 추가'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 미가입 성도 ↔ 가입 계정 연결 모달 ── */}
      {claimTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={backdropClose(() => setClaimTarget(null))}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-brand text-white px-5 py-4">
              <h3 className="font-black text-sm">{claimTarget.name}님 — 가입 계정과 연결</h3>
              <p className="text-2xs text-blue-200 mt-0.5">출석·식수 기록을 그대로 이어 붙입니다</p>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-2xs text-gray-500 bg-gray-50 rounded-xl p-2.5 leading-relaxed">
                이 분이 앱에 가입하셨다면, 그 계정을 골라 주세요. 명단에 쌓인 출석·식수 기록이
                <strong className="text-gray-700"> 그 계정으로 그대로 넘어갑니다.</strong>
                <br />
                두 프로필이 하나로 합쳐집니다. 명단의 직분·라브리·가족은 그대로 유지되고,
                연락처·주소·생년월일은 본인이 입력한 값이 채워집니다.
              </p>

              <div>
                <label className="text-2xs text-gray-400 font-semibold">연결할 가입 계정</label>
                <select
                  value={claimAccountId}
                  onChange={e => setClaimAccountId(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-none"
                >
                  <option value="">계정을 고르세요</option>
                  {allUsers
                    // 승인 대기 계정은 고를 수 없습니다. 승인 전에 연결하면 등급·직분이
                    // 기본값인 채로 섞여서, 어느 값이 관리자의 뜻인지 알 수 없게 됩니다.
                    // (서버 함수도 같은 이유로 PENDING 계정을 거부합니다)
                    .filter(u => !u.isUnregistered && u.id !== claimTarget.id && isApprovedMember(u.role))
                    // 이름이 같은 분을 맨 위로 올려 주되, 고르는 것은 관리자 판단입니다.
                    .sort((a, b) => {
                      const aMatch = a.name.trim() === claimTarget.name.trim() ? 0 : 1
                      const bMatch = b.name.trim() === claimTarget.name.trim() ? 0 : 1
                      return aMatch !== bMatch ? aMatch - bMatch : a.name.localeCompare(b.name, 'ko')
                    })
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}{u.email ? ` · ${u.email}` : ''}
                      </option>
                    ))}
                </select>
                <p className="text-2xs text-rose-500 mt-1 leading-snug">
                  이름이 같아도 다른 분일 수 있습니다. 반드시 이메일까지 확인하고 고르세요.
                </p>
                {/* 목록에 없어서 관리자가 헤매지 않도록, 승인만 안 된 경우를 짚어 줍니다. */}
                {allUsers.some(u => !u.isUnregistered && u.role === 'PENDING' && u.name.trim() === claimTarget.name.trim()) && (
                  <p className="text-2xs text-amber-600 mt-1 leading-snug font-semibold">
                    같은 이름으로 승인 대기 중인 계정이 있습니다. [가입 승인]에서 먼저 승인하면 여기에 나타납니다.
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setClaimTarget(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
                <button
                  onClick={handleClaim}
                  disabled={isClaiming || !claimAccountId}
                  className="flex-1 py-2.5 bg-brand text-white text-xs font-bold rounded-xl disabled:opacity-60"
                >
                  {isClaiming ? '연결 중...' : '연결하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
