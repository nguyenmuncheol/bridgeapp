'use client'

import { useState, useMemo } from 'react'
import { Bell, Play, RefreshCw, Send } from 'lucide-react'
import { dbRunNotificationJob, NotificationJob, dbSendManualNotification, NotifyTarget } from '../../lib/db'
import { UserProfile, getUserDisplayName, isChurchMember } from '../../lib/mockData'

interface NotificationJobsTabProps {
  showToast: (msg: string) => void
  currentUser?: UserProfile
  allUsers: UserProfile[]
}

const CHURCH_SENDER = '더브릿지교회'

const TARGETS: { key: NotifyTarget; label: string }[] = [
  { key: 'ALL', label: '전체 성도' },
  { key: 'LABRI', label: '특정 라브리' },
  { key: 'TEACHER', label: '선생님 전원' },
  { key: 'ADMIN', label: '관리자 전원' },
  { key: 'USERS', label: '개인 지정' },
]

interface JobRow {
  id: NotificationJob
  icon: string
  label: string
  when: string
  desc: string
}

/**
 * 정해진 시각에 서버가 알아서 보내는 알림들입니다.
 * 시각은 모두 **베트남 시각** 기준입니다.
 */
const JOBS: JobRow[] = [
  { id: 'meal1',    icon: '🍚', label: '식사 미응답 1차', when: '금 저녁 8시',
    desc: '다가오는 주일 식사를 아직 신청하지 않은 가정에게' },
  { id: 'meal2',    icon: '🍚', label: '식사 미응답 2차', when: '토 낮 12시',
    desc: '마감 2시간 전 한 번 더' },
  { id: 'bulletin', icon: '📖', label: '새 주보 알림',    when: '금·토 저녁 8시',
    desc: '아직 안 보낸 주보가 있으면 전 성도에게 (주보 1건당 딱 한 번)' },
  { id: 'birthday', icon: '🎂', label: '생일 축하',       when: '매일 아침 8시',
    desc: '생일자 본인에게 축하 알림 + 우리소식에 교회 명의 축하글' },
  { id: 'attend1',  icon: '📋', label: '출석 리마인더 1차', when: '주일 저녁 8시',
    desc: '출석이 아직 입력 안 된 라브리의 리더에게' },
  { id: 'attend2',  icon: '📋', label: '출석 리마인더 2차', when: '월 낮 12시', desc: '위와 같음' },
  { id: 'attend3',  icon: '📋', label: '출석 리마인더 3차', when: '월 저녁 8시', desc: '위와 같음' },
  { id: 'cleanup',  icon: '🧹', label: '오래된 알림 정리',  when: '매일 새벽 4시',
    desc: '60일이 지난 알림을 자동으로 지웁니다' },
]

/**
 * 자동 알림 점검 화면 (관리자 전용).
 *
 * 금요일 저녁까지 기다리지 않아도, 여기서 **지금 한 번 실행**을 눌러
 * 알림이 제대로 나가는지 바로 확인하실 수 있습니다.
 */
export default function NotificationJobsTab({ showToast, currentUser, allUsers }: NotificationJobsTabProps) {
  const [running, setRunning] = useState('')
  const [results, setResults] = useState<Record<string, string>>({})

  // ── 알림 직접 보내기 ──
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState<NotifyTarget>('ALL')
  const [labriId, setLabriId] = useState('라브리1')
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [useChurchName, setUseChurchName] = useState(true)
  const [sending, setSending] = useState(false)

  const members = useMemo(
    () => allUsers.filter(u => isChurchMember(u.role)).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [allUsers]
  )
  const labriOptions = useMemo(() => {
    const set = new Set(members.map(m => m.labriId || '미정').filter(Boolean))
    return Array.from(set).sort()
  }, [members])

  // 보내기 전에 "몇 명에게 가는지" 미리 세어 보여줍니다.
  const receiverCount = useMemo(() => {
    if (target === 'ALL') return members.length
    if (target === 'LABRI') return members.filter(m => (m.labriId || '미정') === labriId).length
    if (target === 'TEACHER') return members.filter(m => m.role === 'TEACHER').length
    if (target === 'ADMIN') return members.filter(m => m.role === 'ADMIN').length
    return pickedIds.length
  }, [target, members, labriId, pickedIds])

  const senderName = useChurchName
    ? CHURCH_SENDER
    : (currentUser ? getUserDisplayName(currentUser) : CHURCH_SENDER)

  const togglePicked = (id: string) => {
    setPickedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

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
      target,
      labriId: target === 'LABRI' ? labriId : undefined,
      userIds: target === 'USERS' ? pickedIds : undefined,
      senderName,
    })
    setSending(false)
    if (error) { showToast('보내지 못했습니다'); return }
    showToast(`${sent}명에게 보냈습니다`)
    setTitle(''); setBody(''); setPickedIds([])
  }

  const run = async (job: NotificationJob, force: boolean) => {
    if (running) return
    setRunning(job)
    const { message, error } = await dbRunNotificationJob(job, force)
    setRunning('')
    if (error) {
      const text = error.message || '실행하지 못했습니다.'
      setResults(prev => ({ ...prev, [job]: `⚠️ ${text}` }))
      showToast('실행 실패')
      return
    }
    setResults(prev => ({ ...prev, [job]: `✅ ${message}` }))
    showToast('실행 완료')
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
        <div className="flex items-center gap-1.5">
          <Bell size={14} className="text-[#335f87]" />
          <h3 className="font-bold text-sm text-gray-900">자동 알림</h3>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          아래 알림들은 <strong>정해진 시각에 서버가 알아서</strong> 보냅니다. (베트남 시각 기준)<br />
          잘 도는지 확인하고 싶으실 때 <strong>지금 실행</strong>을 눌러 보세요.
          이미 보낸 알림은 다시 보내지 않으며, 정말 다시 보내려면 <strong>다시 보내기</strong>를 누르시면 됩니다.
        </p>
        <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
          ⚠️ 실제로 성도님들 알림함에 알림이 쌓입니다. 시험 삼아 여러 번 누르지 마세요.
        </p>
      </div>

      {/* ── 알림 직접 보내기 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Send size={14} className="text-[#335f87]" />
          <h3 className="font-bold text-sm text-gray-900">알림 보내기</h3>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 font-bold">보낸 사람</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setUseChurchName(true)}
              className={`py-2 rounded-xl text-[11px] font-bold transition-all ${useChurchName ? 'bg-[#335f87] text-white' : 'bg-gray-100 text-gray-600'}`}
            >⛪ {CHURCH_SENDER}</button>
            <button
              type="button"
              onClick={() => setUseChurchName(false)}
              className={`py-2 rounded-xl text-[11px] font-bold transition-all ${!useChurchName ? 'bg-[#335f87] text-white' : 'bg-gray-100 text-gray-600'}`}
            >🙋 {currentUser ? getUserDisplayName(currentUser) : '관리자 본인'}</button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 font-bold">받는 사람</label>
          <div className="grid grid-cols-3 gap-1">
            {TARGETS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTarget(t.key)}
                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all ${target === t.key ? 'bg-[#335f87] text-white' : 'bg-gray-100 text-gray-600'}`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {target === 'LABRI' && (
          <select
            value={labriId}
            onChange={e => setLabriId(e.target.value)}
            className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs focus:outline-none"
          >
            {labriOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}

        {target === 'USERS' && (
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-0.5">
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => togglePicked(m.id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition-colors ${pickedIds.includes(m.id) ? 'bg-[#335f87]/10 text-[#335f87] font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {pickedIds.includes(m.id) ? '☑' : '☐'} {getUserDisplayName(m)}
              </button>
            ))}
          </div>
        )}

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
          <p className="text-[11px] text-gray-500">
            받는 사람 <strong className="text-[#335f87]">{receiverCount}명</strong>
          </p>
          <button
            onClick={handleSend}
            disabled={sending || !title.trim() || receiverCount === 0}
            className="px-3.5 py-2 rounded-xl bg-[#335f87] text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
          >
            <Send size={11} />
            {sending ? '보내는 중' : '보내기'}
          </button>
        </div>
        <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
          ⚠️ 보낸 알림은 되돌릴 수 없습니다. 받는 사람과 인원을 꼭 확인해 주세요.
        </p>
      </div>

      <div className="space-y-2">
        {JOBS.map(job => (
          <div key={job.id} className="bg-white rounded-2xl border border-gray-100 p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900">
                  <span className="mr-1">{job.icon}</span>{job.label}
                  <span className="ml-1.5 text-[10px] font-semibold text-[#335f87] bg-[#335f87]/8 px-1.5 py-0.5 rounded">
                    {job.when}
                  </span>
                </p>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{job.desc}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => run(job.id, false)}
                  disabled={!!running}
                  className="px-2.5 py-1.5 rounded-lg bg-[#335f87] text-white text-[10px] font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
                >
                  <Play size={10} />
                  {running === job.id ? '실행 중' : '지금 실행'}
                </button>
                {job.id !== 'cleanup' && (
                  <button
                    onClick={() => run(job.id, true)}
                    disabled={!!running}
                    className="px-2 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
                    title="이미 보냈더라도 다시 보냅니다"
                  >
                    <RefreshCw size={10} />
                    다시
                  </button>
                )}
              </div>
            </div>
            {results[job.id] && (
              <p className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">{results[job.id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
