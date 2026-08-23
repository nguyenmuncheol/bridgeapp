'use client'

import { useState, useMemo } from 'react'
import { Bell, Send } from 'lucide-react'
import { dbSendManualNotification } from '../../lib/db'
import { UserProfile, getUserDisplayName, isChurchMember } from '../../lib/mockData'

interface NotificationJobsTabProps {
  showToast: (msg: string) => void
  currentUser?: UserProfile
  allUsers: UserProfile[]
}

const CHURCH_SENDER = '더브릿지교회'

/**
 * 받는 사람 "빠른 선택" 그룹.
 *
 * 그룹을 누르면 그 사람들이 아래 개인 목록에 체크됩니다.
 * 여러 그룹을 함께 눌러도 되고, 체크된 사람을 하나씩 빼거나 더할 수도 있습니다.
 * 실제 발송은 **항상 체크된 개인 목록**으로 나가므로 겹치는 사람도 한 번만 받습니다.
 */
interface QuickGroup {
  key: string
  label: string
  match: (m: UserProfile) => boolean
}

interface JobRow {
  id: string
  icon: string
  label: string
  when: string
  desc: string
  /** 이 알림이 휴대폰 푸시로도 나가는지 (2026-08-20 푸시 도입) */
  push: boolean
}

/**
 * 정해진 시각에 서버가 알아서 보내는 알림들입니다.
 * 시각은 모두 **베트남 시각** 기준입니다.
 */
const JOBS: JobRow[] = [
  { id: 'meal',        icon: '🍚', label: '식사 미응답',       when: '[1차:금 20시][2차:토 12시]', push: true,
    desc: '다가오는 주일 식사를 아직 신청하지 않은 가정에게 (2차는 마감 2시간 전 한 번 더)' },
  { id: 'bulletin',    icon: '📖', label: '새 주보 알림',      when: '금·토 저녁 8시', push: true,
    desc: '아직 안 보낸 주보가 있으면 전 성도에게 (주보 1건당 딱 한 번)' },
  { id: 'birthday',    icon: '🎂', label: '생일 축하',         when: '매일 아침 8시', push: true,
    desc: '생일자 본인에게 축하 알림 + 우리소식에 교회 명의 축하글' },
  { id: 'attend',      icon: '📋', label: '출석 리마인더',     when: '[1차:일 20시][2차:월 12시][3차:월 20시]', push: true,
    desc: '출석이 아직 입력 안 된 라브리의 리더에게' },
  { id: 'unreadDigest', icon: '🔔', label: '안읽은 알림 요약',  when: '[오전 11시][오후 9시]', push: true,
    desc: '확인하지 않은 알림(새 주보/댓글/공지 등)이 있는 성도에게 미확인 소식 요약 푸시 1건 (모두 읽었으면 발송 안 함)' },
  { id: 'infoRequest', icon: '📝', label: '정보 보완 요청',   when: '매주 금 20시', push: false,
    desc: '주소 보완 요청 대상자 또는 자녀 생일 미입력 성도에게 앱 내 알림 (푸시 없음)' },
  { id: 'cleanup',     icon: '🧹', label: '오래된 알림 정리',   when: '매일 새벽 4시', push: false,
    desc: '60일이 지난 알림을 자동으로 지웁니다' },
]

/**
 * 관리자 알림 화면.
 *
 * 위: 관리자가 직접 써서 보내는 알림
 * 아래: 서버가 정해진 시각에 알아서 보내는 알림 목록 (보기 전용)
 */
export default function NotificationJobsTab({ showToast, currentUser, allUsers }: NotificationJobsTabProps) {
  // ── 알림 직접 보내기 ──
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [useChurchName, setUseChurchName] = useState(true)
  const [sending, setSending] = useState(false)

  const members = useMemo(
    () => allUsers.filter(u => isChurchMember(u.role)).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [allUsers]
  )

  // 실제로 사람이 있는 라브리만 버튼으로 만듭니다.
  const quickGroups = useMemo<QuickGroup[]>(() => {
    const labris = Array.from(new Set(members.map(m => m.labriId || '미정'))).sort()
    return [
      { key: '전체', label: '전체', match: () => true },
      ...labris.map(l => ({ key: l, label: l, match: (m: UserProfile) => (m.labriId || '미정') === l })),
      { key: '리더', label: '라브리 리더', match: (m: UserProfile) => m.role === 'LEADER' },
      { key: '선생님', label: '선생님', match: (m: UserProfile) => m.role === 'TEACHER' },
      { key: '관리자', label: '관리자', match: (m: UserProfile) => m.role === 'ADMIN' },
    ].filter(g => members.some(g.match))
  }, [members])

  // 그 그룹 사람이 **전부** 체크돼 있으면 켜진 것으로 봅니다.
  const isGroupOn = (g: QuickGroup) => {
    const ids = members.filter(g.match).map(m => m.id)
    return ids.length > 0 && ids.every(id => pickedIds.includes(id))
  }

  const toggleGroup = (g: QuickGroup) => {
    const ids = members.filter(g.match).map(m => m.id)
    setPickedIds(prev => isGroupOn(g)
      ? prev.filter(id => !ids.includes(id))          // 켜져 있으면 그 그룹만 빼기
      : Array.from(new Set([...prev, ...ids])))       // 아니면 더하기 (겹쳐도 한 번만)
  }

  const senderName = useChurchName
    ? CHURCH_SENDER
    : (currentUser ? getUserDisplayName(currentUser) : CHURCH_SENDER)

  const togglePicked = (id: string) => {
    setPickedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const receiverCount = pickedIds.length

  const handleSend = async () => {
    if (sending) return
    if (!title.trim()) { showToast('제목을 입력해 주세요'); return }
    if (receiverCount === 0) { showToast('받는 사람이 없습니다'); return }
    // 알림은 되돌릴 수 없으므로 반드시 한 번 확인합니다.
    if (!confirm(
      `${receiverCount}명에게 알림을 보냅니다.\n\n` +
      `보낸 사람: ${senderName}\n제목: ${title.trim()}\n\n` +
      '보낸 알림은 되돌릴 수 없습니다. 계속할까요?'
    )) return

    setSending(true)
    const { sent, error } = await dbSendManualNotification({
      title: title.trim(),
      body: body.trim(),
      target: 'USERS',
      userIds: pickedIds,
      senderName,
    })
    setSending(false)
    if (error) { showToast('보내지 못했습니다'); return }
    showToast(`${sent}명에게 보냈습니다`)
    setTitle(''); setBody(''); setPickedIds([])
  }

  return (
    <div className="space-y-3">
      {/* ── 알림 직접 보내기 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Send size={14} className="text-[#335f87]" />
          <h3 className="font-bold text-sm text-gray-900">알림 보내기</h3>
        </div>

        <div className="space-y-1">
          <label className="text-2xs text-gray-400 font-bold">보낸 사람</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setUseChurchName(true)}
              className={`py-2 rounded-xl text-2xs font-bold transition-all ${useChurchName ? 'bg-[#335f87] text-white' : 'bg-gray-100 text-gray-600'}`}
            >⛪ {CHURCH_SENDER}</button>
            <button
              type="button"
              onClick={() => setUseChurchName(false)}
              className={`py-2 rounded-xl text-2xs font-bold transition-all ${!useChurchName ? 'bg-[#335f87] text-white' : 'bg-gray-100 text-gray-600'}`}
            >🙋 {currentUser ? getUserDisplayName(currentUser) : '관리자 본인'}</button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-2xs text-gray-400 font-bold">받는 사람 — 그룹으로 한 번에 고르기</label>
            {pickedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setPickedIds([])}
                className="text-2xs font-bold text-gray-400 hover:text-rose-500"
              >모두 해제</button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {quickGroups.map(g => (
              <button
                key={g.key}
                type="button"
                onClick={() => toggleGroup(g)}
                className={`py-1.5 px-1 rounded-lg text-2xs font-bold transition-all ${isGroupOn(g) ? 'bg-[#335f87] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >{g.label}</button>
            ))}
          </div>
          <p className="text-2xs text-gray-400 leading-relaxed">
            그룹을 누르면 아래 명단에 자동으로 ☑ 표시됩니다. 여러 그룹을 함께 골라도 되고, 한 사람씩 빼거나 더할 수 있습니다.
          </p>
        </div>

        <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-0.5">
          {members.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => togglePicked(m.id)}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-2xs transition-colors ${pickedIds.includes(m.id) ? 'bg-[#335f87]/10 text-[#335f87] font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {pickedIds.includes(m.id) ? '☑' : '☐'} {getUserDisplayName(m)}
              <span className="text-gray-400 font-normal"> · {m.labriId || '미정'}</span>
            </button>
          ))}
        </div>

        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="제목 (예: 이번 주 특별새벽기도 안내)"
          className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87] text-gray-900 font-medium"
        />
        <textarea
          rows={3}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="내용"
          className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-none focus:border-[#335f87] resize-none text-gray-900 font-medium"
        />

        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-gray-500">
            받는 사람 <strong className="text-[#335f87]">{receiverCount}명</strong>
          </p>
          <button
            onClick={handleSend}
            disabled={sending || !title.trim() || receiverCount === 0}
            className="px-3.5 py-2 rounded-xl bg-[#335f87] text-white text-2xs font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
          >
            <Send size={11} />
            {sending ? '보내는 중' : '보내기'}
          </button>
        </div>
        <p className="text-2xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
          ⚠️ 보낸 알림은 되돌릴 수 없습니다. 받는 사람과 인원을 꼭 확인해 주세요.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
        <div className="flex items-center gap-1.5">
          <Bell size={14} className="text-[#335f87]" />
          <h3 className="font-bold text-sm text-gray-900">자동 알림</h3>
        </div>
        <p className="text-2xs text-gray-500 leading-relaxed">
          아래 알림들은 <strong>정해진 시각에 서버가 알아서</strong> 보냅니다. (시각은 모두 베트남 시각)<br />
          따로 켜거나 끄실 것은 없고, 조건에 맞을 때만 나갑니다. 보낼 대상이 없으면 조용히 넘어갑니다.<br />
          같은 알림을 <strong>두 번 보내지 않습니다.</strong>
        </p>
      </div>

      <div className="space-y-2">
        {JOBS.map(job => (
          <div key={job.id} className="bg-white rounded-2xl border border-gray-100 p-3.5">
            <p className="text-xs font-bold text-gray-900">
              <span className="mr-1">{job.icon}</span>{job.label}
              {job.push && (
                <span className="ml-1.5 text-2xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded" title="휴대폰 알림을 켠 성도에게 푸시도 나갑니다">
                  📱 푸시
                </span>
              )}
              <span className="ml-1.5 text-2xs font-semibold text-[#335f87] bg-[#335f87]/8 px-1.5 py-0.5 rounded">
                {job.when}
              </span>
            </p>
            <p className="text-2xs text-gray-500 leading-relaxed mt-0.5">{job.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
