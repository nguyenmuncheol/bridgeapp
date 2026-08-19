'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { UserProfile, Role, getUserDisplayName } from '../../lib/mockData'
import { dbUpdateProfile, dbReapplyUser } from '../../lib/db'
import { FamilyChildInfo, parseFamilyInfo, serializeFamilyInfo, mergeChildrenLists } from '../../lib/familyInfo'
import { getFamilyGroupOptions, requestAddressUpdate } from '../../lib/adminHelpers'

interface ApprovalTabProps {
  allUsers: UserProfile[]
  onApproveUser: (userId: string, labriId: string, role: Role, duty: string, familyInfo: string, familyGroupId?: string, familyRole?: string) => Promise<{ error: any }>
  onRejectUser: (userId: string) => Promise<{ error: any }>
  onUpdateUsers?: React.Dispatch<React.SetStateAction<UserProfile[]>>
  showToast: (msg: string) => void
}

export default function ApprovalTab({ allUsers, onApproveUser, onRejectUser, onUpdateUsers, showToast }: ApprovalTabProps) {
  // ── 승인 ──
  const [familyInputs, setFamilyInputs] = useState<Record<string, string>>({})
  const [selectedLabris, setSelectedLabris] = useState<Record<string, string>>({})
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role>>({})
  const [dutyInputs, setDutyInputs] = useState<Record<string, string>>({})
  const [selectedFamilyMember, setSelectedFamilyMember] = useState<Record<string, string>>({})
  const [selectedFamilyRole, setSelectedFamilyRole] = useState<Record<string, string>>({})
  // 승인 시 자녀 등 미가입 가족 구성원 입력 (이름 + 소속만. 생일은 관리자가 알 수 없으므로 부모가 마이페이지에서 직접 입력)
  const [pendingChildren, setPendingChildren] = useState<Record<string, FamilyChildInfo[]>>({})
  const pendingUsers = allUsers.filter(u => u.role === 'PENDING')
  // 거절된 신청 — 실수로 거절했거나 다시 받아주기로 한 경우 여기서 되돌립니다.
  // (거절이 '완전 삭제'에서 '상태 변경'으로 바뀌면서, 이 목록이 없으면 거절된 분이
  //  관리자 화면 어디에도 안 보여 Supabase 대시보드를 직접 열어야 복구할 수 있습니다)
  const rejectedUsers = allUsers.filter(u => u.role === 'REJECTED')
  const [showRejected, setShowRejected] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const handleRestore = async (user: UserProfile) => {
    if (restoringId) return
    if (!confirm(`${user.name}님을 다시 "승인 대기" 상태로 되돌릴까요?`)) return
    setRestoringId(user.id)
    const res = await dbReapplyUser(user.id)
    setRestoringId(null)
    if (res.error) {
      showToast(`⚠️ 되돌리지 못했습니다: ${res.error.message || ''}`)
      return
    }
    onUpdateUsers?.(prev => prev.map(u => u.id === user.id ? { ...u, role: 'PENDING' as Role } : u))
    showToast(`${user.name}님을 승인 대기로 되돌렸습니다.`)
  }

  const addPendingChild = (pendingId: string) => {
    setPendingChildren(prev => ({
      ...prev,
      [pendingId]: [...(prev[pendingId] || []), { id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '' }]
    }))
  }
  const updatePendingChild = (pendingId: string, childId: string, updates: Partial<FamilyChildInfo>) => {
    setPendingChildren(prev => ({
      ...prev,
      [pendingId]: (prev[pendingId] || []).map(c => c.id === childId ? { ...c, ...updates } : c)
    }))
  }
  const removePendingChild = (pendingId: string, childId: string) => {
    setPendingChildren(prev => ({
      ...prev,
      [pendingId]: (prev[pendingId] || []).filter(c => c.id !== childId)
    }))
  }

  const handleRequestAddress = async (user: UserProfile) => {
    await requestAddressUpdate(user, onUpdateUsers, showToast)
  }

  const handleApprove = async (userId: string) => {
    const assignedLabri = selectedLabris[userId] || '미정'
    const assignedRole = selectedRoles[userId] || 'MEMBER'
    const assignedDuty = dutyInputs[userId] || '성도'
    const childrenForUser = pendingChildren[userId] || []
    const pendingUserObj = allUsers.find(u => u.id === userId)
    const pendingAddressRequestedAt = pendingUserObj ? parseFamilyInfo(pendingUserObj.familyInfo).addressRequestedAt : ''
    const familyInfo = serializeFamilyInfo({ note: familyInputs[userId] || '', children: childrenForUser, addressRequestedAt: pendingAddressRequestedAt })
    const assignedFamilyRole = selectedFamilyRole[userId] || '부'

    // 자동 가족 그룹 ID 결정 (드롭다운에서 선택된 성도 기준)
    const targetMemberId = selectedFamilyMember[userId]
    let resolvedFamilyGroupId = ''

    if (targetMemberId) {
      const targetMember = allUsers.find(u => u.id === targetMemberId)
      if (targetMember && targetMember.familyGroupId) {
        resolvedFamilyGroupId = targetMember.familyGroupId
      } else {
        // 상대방도 아직 familyGroupId가 없으면 새로 생성하여 둘 다에게 부여
        const newFamilyGroupId = `fam_${Date.now().toString(36)}`
        const { error: familyLinkError } = await dbUpdateProfile(targetMemberId, { familyGroupId: newFamilyGroupId })
        if (familyLinkError) {
          alert(`가족 연결 저장 중 오류가 발생했습니다: ${familyLinkError.message}\n가족 연결 없이 승인만 계속 진행합니다.`)
        } else {
          resolvedFamilyGroupId = newFamilyGroupId
          onUpdateUsers?.(prev => prev.map(u => u.id === targetMemberId ? { ...u, familyGroupId: resolvedFamilyGroupId } : u))
        }
      }

      // 배우자와 자녀 정보 공유: 입력한 자녀 목록을 연결 대상 계정에도 동일하게 반영
      if (targetMember && childrenForUser.length > 0) {
        const targetNote = parseFamilyInfo(targetMember.familyInfo).note
        const targetAddressRequestedAt = parseFamilyInfo(targetMember.familyInfo).addressRequestedAt
        const mergedChildren = mergeChildrenLists(childrenForUser, parseFamilyInfo(targetMember.familyInfo).children)
        const syncedFamilyInfo = serializeFamilyInfo({ note: targetNote, children: mergedChildren, addressRequestedAt: targetAddressRequestedAt })
        const { error: childSyncError } = await dbUpdateProfile(targetMemberId, { familyInfo: syncedFamilyInfo })
        if (childSyncError) {
          alert(`자녀 정보를 배우자 계정과 동기화하는 중 오류가 발생했습니다: ${childSyncError.message}`)
        } else {
          onUpdateUsers?.(prev => prev.map(u => u.id === targetMemberId ? { ...u, familyInfo: syncedFamilyInfo } : u))
        }
      }
    }

    // 🐛 과거 버그: 결과를 확인하지 않아, 저장이 실패해도 승인 대기 카드가 사라지고
    // "✅ 가입 승인 완료" 토스트가 떴습니다. 관리자는 처리한 줄 알지만 그 성도는
    // 계속 "승인 대기 중" 화면을 보게 되고, 아무도 문제를 알아채지 못합니다.
    const res = await onApproveUser(userId, assignedLabri, assignedRole, assignedDuty, familyInfo, resolvedFamilyGroupId || undefined, assignedFamilyRole)
    if (res?.error) {
      showToast(`⚠️ 승인하지 못했습니다: ${res.error.message || ''}`)
      return
    }
    showToast(`✅ 가입 승인 완료 (${assignedLabri} · ${assignedDuty} · ${assignedRole})`)
  }

  // 🐛 과거 버그: "거절"이 확인 창도 없이 프로필을 완전히 삭제했습니다.
  // 승인 버튼 바로 옆에 같은 크기로 붙어 있어 폰에서 오조작하기 쉬웠고,
  // 그분이 입력한 연락처/주소/생일이 되돌릴 수 없이 사라졌습니다.
  // (게다가 로그인 계정은 남아서, 그분이 앱을 다시 열면 대기 목록에 또 올라왔습니다)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const handleReject = async (user: UserProfile) => {
    if (rejectingId) return
    if (!confirm(`${user.name}님의 가입 신청을 거절할까요?\n\n거절해도 기록은 남으며, 나중에 다시 승인할 수 있습니다.`)) return
    setRejectingId(user.id)
    const res = await onRejectUser(user.id)
    setRejectingId(null)
    if (res?.error) {
      showToast(`⚠️ 처리하지 못했습니다: ${res.error.message || ''}`)
      return
    }
    showToast(`${user.name}님의 가입 신청을 거절했습니다.`)
  }

  return (
    <div className="space-y-3">
      {pendingUsers.length > 0 ? (
        pendingUsers.map((pending) => (
          <div key={pending.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-sm text-gray-900">{getUserDisplayName(pending)}</h3>
                <p className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                  <span>{pending.phone} | 주소: {pending.address || '미입력'}</span>
                  <button
                    type="button"
                    onClick={() => handleRequestAddress(pending)}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${parseFamilyInfo(pending.familyInfo).addressRequestedAt ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-[#335f87]'}`}
                  >
                    {parseFamilyInfo(pending.familyInfo).addressRequestedAt ? '🏠 보완요청됨' : '🏠 주소 보완요청'}
                  </button>
                </p>
              </div>
              <span className="text-[10px] bg-rose-50 text-rose-600 font-bold px-2 py-0.5 rounded-full">승인 대기</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold">소속 라브리</label>
                  <select value={selectedLabris[pending.id] || '미정'} onChange={(e) => setSelectedLabris({ ...selectedLabris, [pending.id]: e.target.value })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <option value="미정">라브리 미정</option>
                    <option value="라브리1">라브리1</option>
                    <option value="라브리2">라브리2</option>
                    <option value="라브리3">라브리3</option>

                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold">부여 권한</label>
                  <select value={selectedRoles[pending.id] || 'MEMBER'} onChange={(e) => setSelectedRoles({ ...selectedRoles, [pending.id]: e.target.value as Role })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <option value="MEMBER">일반 성도</option>
                    <option value="LEADER">라브리 리더</option>
                    <option value="TEACHER">교회학교 선생님</option>
                    <option value="COUPON">쿠폰 관리자</option>
                    <option value="ADMIN">총괄 관리자</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">직분</label>
                <select value={dutyInputs[pending.id] || '성도'} onChange={(e) => setDutyInputs({ ...dutyInputs, [pending.id]: e.target.value })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  {['성도', '학생', '청년', '집사', '안수집사', '권사', '장로', '선생', '목사', '전도사', '사모'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold">가족/배우자 연결 (가정별 묶음)</label>
                  <select
                    value={selectedFamilyMember[pending.id] || ''}
                    onChange={(e) => setSelectedFamilyMember({ ...selectedFamilyMember, [pending.id]: e.target.value })}
                    className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none"
                  >
                    <option value="">선택 안함 (단독 세대)</option>
                    {getFamilyGroupOptions(allUsers).map(opt => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold">가족 내 호칭/역할</label>
                  <select
                    value={selectedFamilyRole[pending.id] || '부'}
                    onChange={(e) => setSelectedFamilyRole({ ...selectedFamilyRole, [pending.id]: e.target.value })}
                    className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none"
                  >
                    {['부', '모', '자녀1', '자녀2', '자녀3', '조부', '조모', '자녀', '기타'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-gray-400 font-semibold">자녀 등 미가입 가족 (이름) · 생일은 부모가 마이페이지에서 입력하면 나이대(유아/어린이/학생/청년)가 자동 표시됩니다</label>
                  <button type="button" onClick={() => addPendingChild(pending.id)} className="text-[10px] font-bold text-[#335f87] px-2 py-0.5 bg-blue-50 rounded-lg">+ 자녀 추가</button>
                </div>
                <div className="mt-1 space-y-1.5">
                  {(pendingChildren[pending.id] || []).map(child => (
                    <div key={child.id} className="flex gap-1 items-center">
                      <input
                        type="text"
                        value={child.name}
                        onChange={e => updatePendingChild(pending.id, child.id, { name: e.target.value })}
                        placeholder="이름"
                        className="flex-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium text-[11px]"
                      />
                      <button type="button" onClick={() => removePendingChild(pending.id, child.id)} className="p-1.5 text-gray-400 hover:text-rose-500">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-semibold">기타 가족 메모</label>
                <input type="text" placeholder="가족현황란에 보이는 내용" value={familyInputs[pending.id] || ''} onChange={(e) => setFamilyInputs({ ...familyInputs, [pending.id]: e.target.value })} className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none text-gray-900 font-medium" />
              </div>
            </div>
            {/* 승인(주 동작)을 넓게, 거절(되돌리기 어려운 동작)은 좁게 두어 오조작을 줄였습니다 */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => handleReject(pending)}
                disabled={rejectingId !== null}
                className="w-24 py-3 bg-gray-100 text-gray-500 text-xs font-bold rounded-xl hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >거절</button>
              <button
                onClick={() => handleApprove(pending.id)}
                className="flex-1 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700"
              >가입 승인</button>
            </div>
          </div>
        ))
      ) : (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 text-center text-xs text-gray-400">현재 승인 대기 중인 신규 성도가 없습니다.</div>
      )}

      {/* ── 거절된 신청 (접혀 있음) ── */}
      {rejectedUsers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
          <button
            onClick={() => setShowRejected(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <span className="text-xs font-bold text-gray-500">
              거절된 신청 ({rejectedUsers.length})
            </span>
            <span className="text-gray-400 text-xs">{showRejected ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {showRejected && (
            <div className="px-4 pb-4 space-y-2 border-t border-gray-50 pt-3">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                거절된 분도 본인 화면에서 직접 다시 신청할 수 있습니다.
                실수로 거절하셨다면 아래에서 바로 되돌릴 수 있습니다.
              </p>
              {rejectedUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-700 truncate">{u.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{u.email || '이메일 없음'}</p>
                  </div>
                  <button
                    onClick={() => handleRestore(u)}
                    disabled={restoringId !== null}
                    className="px-3 py-2 bg-white border border-gray-200 text-gray-600 text-[11px] font-bold rounded-lg hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 shrink-0 ml-2"
                  >
                    승인 대기로
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
