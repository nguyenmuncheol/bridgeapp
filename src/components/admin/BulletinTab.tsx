'use client'

/**
 * 주보 작성 탭 (관리자 전용)
 *
 * 주보 4쪽 구조 그대로 네 개 섹션으로 나눠 입력합니다. 저장하면 bulletins.content
 * (jsonb) 에 통째로 들어가고, 같은 데이터로 성도용 웹 화면과 A4 인쇄본이 만들어집니다.
 *
 * 매주 쓰게 만드는 장치 세 가지를 우선으로 넣었습니다.
 *   · [지난 주보 불러오기] — 예배순서·섬김표·헌금계좌는 거의 안 바뀝니다.
 *   · [절 나누기]          — 성경 본문을 통째로 붙여넣으면 절 단위로 잘라 줍니다.
 *   · [미리보기]           — 실제 지면 그대로 보면서 넘침을 눈으로 확인합니다.
 *
 * 대표기도자는 이름을 타이핑하는 대신 **가입 성도 중에서 고릅니다.** 고른 사람은
 * 계정과 연결되어(prayerAssignments) 나중에 그 사람에게만 알림을 보낼 수 있습니다.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, ChevronUp, ChevronDown, Save, Eye, EyeOff, Printer,
  RefreshCw, Copy, Sparkles, ChevronRight, Undo2, AlignCenter,
} from 'lucide-react'
import { UserProfile } from '../../lib/mockData'
import {
  BulletinContent, BulletinOrderItem, BulletinNewsItem,
  EMPTY_BULLETIN_CONTENT, normalizeBulletinContent,
  parseVersesFromText, buildServingMonths, sampleBulletinContent,
  makeServingMonth, nextServingDate, ymOf, MEAL_OPTIONS,
  rollServingForDate, servingMonthsMatchDate,
  prayerLeaderForDate, applyPrayerLeaderToOrder,
  SERVING_PRAYER_COL as PRAYER_COL, SERVING_MEAL_COL as MEAL_COL,
} from '../../lib/bulletinContent'
import {
  dbFetchBulletinByDate, dbFetchBulletinsWithContent, dbUpsertBulletin, BulletinData,
} from '../../lib/db'
import { getUpcomingSundays, getMostRecentSunday, formatBulletinDisplay } from '../../lib/dateUtils'
import BulletinView from '../bulletin/BulletinView'

interface BulletinTabProps {
  currentUser?: UserProfile
  allUsers: UserProfile[]
  showToast: (msg: string) => void
}

export default function BulletinTab({ currentUser, allUsers, showToast }: BulletinTabProps) {
  // 고를 수 있는 주일: 지난 2주 + 이번 주 이후 4주
  const sundays = useMemo(() => {
    const past = [getMostRecentSunday(-2), getMostRecentSunday(-1)]
    return [...past, ...getUpcomingSundays(4)]
  }, [])

  const [dateStr, setDateStr] = useState(sundays[2]?.dateStr || '')
  const [content, setContent] = useState<BulletinContent>(EMPTY_BULLETIN_CONTENT)
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  // 어느 주일까지 불러왔는지. 고른 날짜와 다르면 '불러오는 중' 입니다.
  // (effect 본문에서 곧바로 setState 하지 않으려고 상태를 파생값으로 둡니다)
  const [loadedFor, setLoadedFor] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // 같은 날짜에 이미 올라간 스캔 이미지. 주보 탭은 이미지를 다루지 않지만,
  // 저장할 때 빈 배열로 덮어쓰면 홈탭에서 올린 사진이 지워집니다. 그대로 되돌려 줍니다.
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({ cover: true })
  const [versePaste, setVersePaste] = useState('')

  /** 대표기도자로 고를 수 있는 사람: 실제 계정이 있는 성도만 (자녀 가상항목·미가입자 제외) */
  const selectableMembers = useMemo(
    () => allUsers
      .filter(u => !u.isDependent && !u.isUnregistered && u.role !== 'PENDING')
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [allUsers]
  )

  // 날짜를 바꾸면 그 주일 주보를 불러옵니다 (없으면 빈 주보).
  useEffect(() => {
    if (!dateStr) return
    let cancelled = false

    const load = async () => {
      const row = await dbFetchBulletinByDate(dateStr).catch(() => null)
      if (cancelled) return
      const display = formatBulletinDisplay(dateStr)
      setExistingImageUrls(row?.imageUrls || [])
      if (row?.content) {
        setContent(normalizeBulletinContent(row.content))
        setStatus(row.status === 'draft' ? 'draft' : 'published')
      } else {
        setContent({
          ...EMPTY_BULLETIN_CONTENT,
          date: display,
          servingMonths: buildServingMonths(dateStr),
        })
        setStatus('draft')
      }
      setLoadedFor(dateStr)
    }

    load()
    return () => { cancelled = true }
  }, [dateStr])

  const isLoading = loadedFor !== dateStr

  /**
   * 미리보기에 넘길 내용.
   *
   * 🐛 미리보기를 켜 두면 글자 하나 칠 때마다 A5 네 쪽을 통째로 다시 그렸습니다.
   *    폰에서는 이 계산이 한글 조합(마지막 글자를 만드는 중)보다 오래 걸려서,
   *    조합 중이던 마지막 글자가 통째로 날아가곤 했습니다.
   *    useDeferredValue 로 미리보기만 한 박자 늦게 그리게 하면, 타이핑은 먼저
   *    처리되고 미리보기는 손을 멈춘 뒤 따라옵니다.
   */
  const previewContent = useDeferredValue(content)

  const patch = (next: Partial<BulletinContent>) => setContent(prev => ({ ...prev, ...next }))

  /**
   * patch 와 같지만 바꿀 값을 **지금 상태에서** 계산합니다.
   *
   * 🐛 목록 칸(공지·헌금·절)은 `patch({ notices: content.notices.map(...) })` 처럼
   *    화면을 그릴 때의 content 를 보고 새 배열을 만들었습니다. 글자를 빨리 치면
   *    두 번의 입력이 같은 content 를 보고 계산돼, 나중 것이 앞 것을 덮어씁니다
   *    (= 방금 친 글자가 안 들어간 것처럼 보입니다). prev 로 계산하면 사라지지
   *    않습니다.
   */
  const patchFrom = (make: (prev: BulletinContent) => Partial<BulletinContent>) =>
    setContent(prev => ({ ...prev, ...make(prev) }))

  /**
   * 섬김표에 배정된 이 주일의 대표기도자를 예배 순서 '기도' 줄 담당자로 옮겨 적습니다.
   * 두 곳에 따로 적게 두면 한쪽만 고치고 지나가기 쉬워서, 섬김표를 기준으로 맞춥니다.
   */
  const withPrayerLeader = (c: BulletinContent): BulletinContent => {
    const name = prayerLeaderForDate(c.servingMonths, dateStr)
    if (!name) return c
    const pre = applyPrayerLeaderToOrder(c.orderPre, name)
    if (pre) return { ...c, orderPre: pre }
    const post = applyPrayerLeaderToOrder(c.orderPost, name)
    return post ? { ...c, orderPost: post } : c
  }

  /** patch 와 같지만, 바꾼 뒤 대표기도자를 예배 순서에 반영합니다 */
  const patchAndSync = (next: Partial<BulletinContent>) =>
    setContent(prev => withPrayerLeader({ ...prev, ...next }))

  // ── 지난 주보 불러오기 ────────────────────────────────────────────────
  const handleCopyPrevious = async () => {
    const rows = await dbFetchBulletinsWithContent(10).catch(() => [] as BulletinData[])
    const source = rows.find(r => r.date !== dateStr && r.content)
    if (!source?.content) {
      showToast('⚠️ 불러올 지난 주보가 없습니다')
      return
    }
    const prev = normalizeBulletinContent(source.content)
    // 섬김표는 이 주보의 달로 굴려 옵니다. 9월 주보에서 [9월,10월] 을 가져오면
    // 10월 주보에서는 [10월,11월] 이 되고, 이미 적어 둔 10월 섬김이 앞칸으로 따라옵니다.
    const rolled = rollServingForDate(prev.servingMonths, prev.prayerAssignments, dateStr)
    setContent({
      ...prev,
      // 그 주에만 해당하는 것은 비웁니다 — 지난주 설교·소식이 그대로 실리면 사고입니다.
      date: formatBulletinDisplay(dateStr),
      sermon: { ...prev.sermon, title: '', sub: '' },
      scriptureRef: '',
      verses: [],
      messageTitle: '',
      messageBody: '',
      churchNews: [],
      memberNews: [],
      servingMonths: rolled.servingMonths,
      // 대표기도 배정은 달마다 정해지므로 그대로 가져옵니다(자리만 옮겨서).
      prayerAssignments: rolled.prayerAssignments.map(a => ({ ...a, notifiedAt: undefined })),
    })
    // 가져온 섬김표에 이 주일 대표기도자가 있으면 예배 순서에도 채워 둡니다
    setContent(c => withPrayerLeader(c))
    setStatus('draft')
    showToast(`📋 ${formatBulletinDisplay(source.date)} 주보를 불러왔습니다`)
  }

  const handleFillSample = () => {
    setContent(sampleBulletinContent(dateStr, formatBulletinDisplay(dateStr)))
    setStatus('draft')
    showToast('✨ 샘플 내용을 채웠습니다 (저장 전에는 반영되지 않습니다)')
  }

  // ── 저장 ──────────────────────────────────────────────────────────────
  const handleSave = async (nextStatus: 'draft' | 'published') => {
    if (isSaving) return
    if (!dateStr) {
      showToast('⚠️ 주일 날짜를 먼저 골라 주세요')
      return
    }
    setIsSaving(true)
    try {
      // 기존 칼럼(title/preacher/passage)에도 같이 써 줍니다.
      // 홈 화면 미리보기와 알림 트리거가 이 칼럼들을 읽고 있습니다.
      const { error } = await dbUpsertBulletin({
        date: dateStr,
        title: content.sermon.title,
        preacher: content.sermon.by,
        passage: content.scriptureRef,
        summary: content.messageTitle.replace(/\n/g, ' '),
        imageUrls: existingImageUrls,   // 사진으로 올린 주보를 지우지 않습니다
        content,
        status: nextStatus,
      })
      if (error) {
        showToast(`❌ 저장 실패: ${error.message || '알 수 없는 오류'}`)
        return
      }
      setStatus(nextStatus)
      showToast(nextStatus === 'published' ? '✅ 주보를 발행했습니다' : '💾 임시저장했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * 발행 상태를 뒤집습니다 — 발행 전이면 발행하고, 발행됨이면 발행을 거둡니다.
   *
   * 어느 쪽이든 지금 편집 중인 내용을 함께 저장하므로, 발행을 거두면서 고친 내용이
   * 사라지지 않습니다. 저장이 끝나면 dbUpsertBulletin 이 'bulletin:latest' 캐시를
   * 무효화하므로, 홈 화면으로 넘어가면 바뀐 상태가 그대로 반영됩니다
   * (성도 화면은 status='published' 인 주보만 가져갑니다).
   */
  const handleTogglePublish = () => handleSave(status === 'published' ? 'draft' : 'published')

  // ── 목록 편집 공통 ────────────────────────────────────────────────────
  const moveItem = <T,>(list: T[], from: number, dir: -1 | 1): T[] => {
    const to = from + dir
    if (to < 0 || to >= list.length) return list
    const next = [...list]
    ;[next[from], next[to]] = [next[to], next[from]]
    return next
  }

  const section = (key: string, title: string, subtitle: string, body: React.ReactNode) => (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))}
        className="w-full flex items-center gap-2 p-3.5 text-left cursor-pointer hover:bg-gray-50"
      >
        <ChevronRight
          size={15}
          className={`text-gray-400 transition-transform ${open[key] ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">{title}</p>
          <p className="text-2xs text-gray-400 truncate">{subtitle}</p>
        </div>
      </button>
      {open[key] && <div className="px-3.5 pb-4 space-y-3">{body}</div>}
    </div>
  )

  // ⚠️ 여기에 폭(w-*)을 넣지 마세요. 쓰는 곳에서 w-full / flex-1 / w-20 을 붙이는데,
  //    Tailwind 는 class 문자열 순서가 아니라 CSS 출력 순서로 이기기 때문에
  //    여기 폭이 있으면 그쪽을 눌러 버립니다(절 내용·버튼이 화면 밖으로 밀려남).
  const inputCls = 'p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs min-w-0 focus:outline-none focus:border-blue-400'
  const miniBtn = 'p-1.5 rounded-lg text-gray-400 hover:text-slate-900 hover:bg-gray-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'
  const addBtn = 'w-full py-2 border border-dashed border-gray-300 rounded-lg text-2xs font-semibold text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer flex items-center justify-center gap-1'

  /**
   * 예배 순서 목록 편집기 (설교 앞/뒤 공용)
   *
   * 보통 줄은 [이름][담당] 두 칸입니다. 가운데 강조 칸은 **쓰는 줄에만** 아랫줄로
   * 펼칩니다 — 모든 줄에 늘 띄워 두면 칸이 좁아 이름도 담당도 읽기 어려웠습니다.
   * 줄 오른쪽의 가운데정렬 아이콘으로 켜고 끕니다.
   */
  const orderEditor = (list: BulletinOrderItem[], onChange: (next: BulletinOrderItem[]) => void) => {
    return (
      <div className="space-y-1.5">
        {list.map((o, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <input
                className={inputCls + ' w-20 shrink-0'}
                value={o.item}
                placeholder="묵    도"
                onChange={e => onChange(list.map((x, j) => j === i ? { ...x, item: e.target.value } : x))}
              />
              <input
                className={inputCls + ' flex-1 basis-0'}
                value={o.by}
                placeholder="담당"
                onChange={e => onChange(list.map((x, j) => j === i ? { ...x, by: e.target.value } : x))}
              />
              <button className={miniBtn} disabled={i === 0} onClick={() => onChange(moveItem(list, i, -1))} aria-label="위로"><ChevronUp size={13} /></button>
              <button className={miniBtn} disabled={i === list.length - 1} onClick={() => onChange(moveItem(list, i, 1))} aria-label="아래로"><ChevronDown size={13} /></button>
              <button className={miniBtn} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="삭제"><Trash2 size={13} /></button>
            </div>
            {typeof o.center === 'string' && (
              <div className="flex items-center gap-1.5 pl-4">
                <span className="text-gray-300 text-2xs shrink-0">↳</span>
                <input
                  className={inputCls + ' flex-1 basis-0 bg-blue-50/60 font-semibold'}
                  value={o.center}
                  placeholder="가운데에 크게 넣을 글 (예: 요한복음 3:1-12)"
                  onChange={e => onChange(list.map((x, j) => j === i ? { ...x, center: e.target.value } : x))}
                />
              </div>
            )}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-1.5">
          <button className={addBtn} onClick={() => onChange([...list, { item: '', by: '' }])}>
            <Plus size={12} /> 순서 추가
          </button>
          <button className={addBtn} onClick={() => onChange([...list, { item: '', center: '', by: '' }])}>
            <AlignCenter size={12} /> 강조 순서 추가
          </button>
        </div>
      </div>
    )
  }

  /** 소식 목록 편집기 (교회소식 / 교우소식 공용) */
  const newsEditor = (list: BulletinNewsItem[], onChange: (next: BulletinNewsItem[]) => void) => (
    <div className="space-y-2">
      {list.map((n, i) => (
        <div key={i} className="p-2.5 bg-gray-50 rounded-xl space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              className={inputCls + ' flex-1 basis-0 bg-white font-semibold'}
              value={n.title}
              placeholder="소식 제목"
              onChange={e => onChange(list.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
            />
            <button className={miniBtn} disabled={i === 0} onClick={() => onChange(moveItem(list, i, -1))} aria-label="위로"><ChevronUp size={13} /></button>
            <button className={miniBtn} disabled={i === list.length - 1} onClick={() => onChange(moveItem(list, i, 1))} aria-label="아래로"><ChevronDown size={13} /></button>
            <button className={miniBtn} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="삭제"><Trash2 size={13} /></button>
          </div>
          <textarea
            className={inputCls + ' w-full bg-white leading-relaxed'}
            rows={2}
            value={n.body}
            placeholder="내용 (줄바꿈하면 주보에도 줄이 나뉩니다)"
            onChange={e => onChange(list.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
          />
        </div>
      ))}
      <button className={addBtn} onClick={() => onChange([...list, { title: '', body: '' }])}>
        <Plus size={12} /> 소식 추가
      </button>
    </div>
  )

  /** 섬김표 한 칸에 성도를 지정합니다 (이름은 표에, userId 는 알림용으로 기록). */
  const assignPrayer = (mi: number, ri: number, userId: string) => {
    const user = selectableMembers.find(u => u.id === userId)
    const name = user ? `${user.name}${user.duty ? ` ${user.duty}` : ''}`.trim() : ''

    const months = content.servingMonths.map((m, j) =>
      j !== mi ? m : {
        ...m,
        rows: m.rows.map((r, k) => {
          if (k !== ri) return r
          const next = [...r]
          next[PRAYER_COL] = name
          return next
        }),
      }
    )

    const others = content.prayerAssignments.filter(a => !(a.monthIndex === mi && a.rowIndex === ri))
    // 이 주보의 주일에 배정한 것이면 예배 순서 '기도' 줄에도 바로 반영됩니다
    patchAndSync({
      servingMonths: months,
      prayerAssignments: userId ? [...others, { monthIndex: mi, rowIndex: ri, userId, name }] : others,
    })
  }

  /** 섬김표의 식사 섬김 칸을 바꿉니다 */
  const setMealCell = (mi: number, ri: number, value: string) => {
    patch({
      servingMonths: content.servingMonths.map((x, j) =>
        j !== mi ? x : {
          ...x,
          rows: x.rows.map((rr, k) => {
            if (k !== ri) return rr
            const next = [...rr]
            next[MEAL_COL] = value
            return next
          }),
        }),
    })
  }

  /**
   * 섬김표에서 주차 줄 하나를 지웁니다.
   *
   * 지운 줄에 배정돼 있던 대표기도자는 함께 지우고, 그 아래 줄들의 번호(rowIndex)는
   * 한 칸씩 당겨 줍니다. 이걸 빼먹으면 지운 뒤 엉뚱한 줄의 이름이 바뀝니다.
   * 남은 줄의 '1주/2주…' 이름도 다시 매깁니다.
   */
  const removeServingRow = (mi: number, ri: number) => {
    patch({
      // 줄 이름이 주일 날짜(9/6)라서 다시 매길 필요가 없습니다.
      servingMonths: content.servingMonths.map((x, j) =>
        j !== mi ? x : { ...x, rows: x.rows.filter((_, k) => k !== ri) }),
      prayerAssignments: content.prayerAssignments
        .filter(a => !(a.monthIndex === mi && a.rowIndex === ri))
        .map(a => (a.monthIndex === mi && a.rowIndex > ri ? { ...a, rowIndex: a.rowIndex - 1 } : a)),
    })
  }

  /** 섬김표에 주일 줄 하나를 더합니다 (지웠다가 되돌릴 때 등) */
  const addServingRow = (mi: number) => {
    patch({
      servingMonths: content.servingMonths.map((x, j) =>
        j !== mi ? x : { ...x, rows: [...x.rows, [nextServingDate(x.ym, x.rows.length), '', '']] }),
    })
  }

  /**
   * 표의 달을 바꿉니다. 그 달의 주일 날짜로 줄을 다시 깔되, 이미 적어 둔
   * 대표기도·식사 섬김은 줄 순서대로 이어받습니다. 새 달의 주일 수가 더 적으면
   * 넘치는 줄의 대표기도 배정은 버립니다(가리킬 줄이 없어지므로).
   */
  const setServingMonthYm = (mi: number, ym: string) => {
    const next = makeServingMonth(ym, content.servingMonths[mi]?.rows)
    patch({
      servingMonths: content.servingMonths.map((x, j) => (j === mi ? next : x)),
      prayerAssignments: content.prayerAssignments.filter(
        a => a.monthIndex !== mi || a.rowIndex < next.rows.length
      ),
    })
  }

  const prayerUserIdAt = (mi: number, ri: number) =>
    content.prayerAssignments.find(a => a.monthIndex === mi && a.rowIndex === ri)?.userId || ''

  return (
    <div className="space-y-3 text-xs">
      {/* ── 상단 : 주일 선택 · 상태 · 저장 ── */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-100 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={dateStr}
            onChange={e => setDateStr(e.target.value)}
            className={inputCls + ' flex-1 basis-0 font-bold cursor-pointer'}
          >
            {sundays.map(s => (
              <option key={s.dateStr} value={s.dateStr}>{s.labelStr}</option>
            ))}
          </select>
          <span className={`px-2.5 py-1.5 rounded-lg text-2xs font-bold shrink-0 ${
            status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {status === 'published' ? '발행됨' : '임시저장'}
          </span>
          {isLoading && <RefreshCw size={14} className="animate-spin text-blue-500 shrink-0" />}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={handleCopyPrevious} className="py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-2xs font-bold text-slate-700 cursor-pointer flex items-center justify-center gap-1">
            <Copy size={12} /> 지난 주보 불러오기
          </button>
          <button onClick={handleFillSample} className="py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-2xs font-bold text-slate-700 cursor-pointer flex items-center justify-center gap-1">
            <Sparkles size={12} /> 샘플 내용 채우기
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleSave('draft')}
            disabled={isSaving}
            className="py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Save size={13} /> 임시저장
          </button>
          {/* 누를 때마다 발행 ↔ 발행 전이 뒤집힙니다 */}
          <button
            onClick={handleTogglePublish}
            disabled={isSaving}
            className={`py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              status === 'published'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {isSaving
              ? <RefreshCw size={13} className="animate-spin" />
              : status === 'published' ? <Undo2 size={13} /> : <Save size={13} />}
            {status === 'published' ? '발행 취소' : '발행하기'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setShowPreview(v => !v)}
            className="py-2 border border-gray-200 rounded-lg text-2xs font-bold text-slate-600 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1"
          >
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />} {showPreview ? '미리보기 닫기' : '미리보기'}
          </button>
          <a
            href={`/bulletin/print?date=${dateStr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 border border-gray-200 rounded-lg text-2xs font-bold text-slate-600 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-1"
          >
            <Printer size={12} /> 인쇄 화면 열기
          </a>
        </div>

        <p className="text-3xs text-gray-400 leading-relaxed">
          임시저장한 주보는 성도 화면에 나오지 않고 알림도 가지 않습니다.
          내용을 다 채운 뒤 <strong>발행하기</strong>를 누르면 홈 화면 &ldquo;이번 주 주보&rdquo;에
          올라갑니다. 한 번 더 누르면 <strong>발행 취소</strong>되어 다시 내려갑니다.
        </p>
      </div>

      {/* ── ① 표지 ── */}
      {section('cover', '① 표지 · 예배 순서', '날짜 / 예배시간 / 순서 / 설교', (
        <>
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">예배 안내 (날짜 옆 작은 글씨)</label>
            <input className={inputCls + ' w-full'} value={content.dateSub} placeholder="주일예배 · 오전 11:00"
              onChange={e => patch({ dateSub: e.target.value })} />
          </div>

          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">설교 앞 순서</label>
            {orderEditor(content.orderPre, next => patch({ orderPre: next }))}
          </div>

          <div className="p-2.5 bg-blue-50 rounded-xl space-y-1.5">
            <label className="block text-2xs font-bold text-blue-700">설교</label>
            <div className="flex gap-1.5">
              <input className={inputCls + ' bg-white w-24 shrink-0'} value={content.sermon.label} placeholder="설    교"
                onChange={e => patch({ sermon: { ...content.sermon, label: e.target.value } })} />
              <input className={inputCls + ' bg-white flex-1 basis-0'} value={content.sermon.by} placeholder="설교자"
                onChange={e => patch({ sermon: { ...content.sermon, by: e.target.value } })} />
            </div>
            <input className={inputCls + ' w-full bg-white font-bold'} value={content.sermon.title} placeholder="설교 제목 (예배 순서 줄 가운데에 들어갑니다)"
              onChange={e => patch({ sermon: { ...content.sermon, title: e.target.value } })} />
            <input className={inputCls + ' w-full bg-white'} value={content.sermon.sub} placeholder="제목 아래 작은 줄 (비워도 됩니다)"
              onChange={e => patch({ sermon: { ...content.sermon, sub: e.target.value } })} />
          </div>

          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">설교 뒤 순서</label>
            {orderEditor(content.orderPost, next => patch({ orderPost: next }))}
          </div>
        </>
      ))}

      {/* ── ② 소식 ── */}
      {section('news', '② 교회소식 · 교우소식', `교회 ${content.churchNews.length}건 / 교우 ${content.memberNews.length}건`, (
        <>
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">교회소식</label>
            {newsEditor(content.churchNews, next => patch({ churchNews: next }))}
          </div>
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">교우소식</label>
            {newsEditor(content.memberNews, next => patch({ memberNews: next }))}
          </div>
        </>
      ))}

      {/* ── ③ 성경말씀 ── */}
      {section('scripture', '③ 성경말씀', `${content.scriptureRef || '본문 미지정'} · ${content.verses.length}절`, (
        <>
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">본문</label>
            <input className={inputCls + ' w-full'} value={content.scriptureRef} placeholder="요한복음 3:1-12"
              onChange={e => patch({ scriptureRef: e.target.value })} />
          </div>

          <div className="p-2.5 bg-gray-50 rounded-xl space-y-1.5">
            <label className="block text-2xs font-bold text-gray-500">
              본문 붙여넣기 — 절 번호가 붙어 있으면 그대로, 없으면 한 줄에 한 절
            </label>
            <textarea
              className={inputCls + ' w-full bg-white leading-relaxed'}
              rows={4}
              value={versePaste}
              placeholder={'1 바리새인 중에 니고데모라 하는 사람이 있으니…\n2 그가 밤에 예수께 와서 이르되…'}
              onChange={e => setVersePaste(e.target.value)}
            />
            <button
              className={addBtn}
              onClick={() => {
                const parsed = parseVersesFromText(versePaste)
                if (parsed.length === 0) { showToast('⚠️ 나눌 본문이 없습니다'); return }
                patch({ verses: parsed })
                setVersePaste('')
                showToast(`📖 ${parsed.length}절로 나눴습니다`)
              }}
            >
              <Plus size={12} /> 절 나누기 ({parseVersesFromText(versePaste).length}절)
            </button>
          </div>

          <div className="space-y-1.5">
            {content.verses.map((v, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <input
                  className={inputCls + ' w-11 shrink-0 text-center'}
                  value={v.n}
                  inputMode="numeric"
                  onChange={e => patchFrom(c => ({ verses: c.verses.map((x, j) => j === i ? { ...x, n: Number(e.target.value) || x.n } : x) }))}
                />
                <textarea
                  className={inputCls + ' flex-1 basis-0 leading-relaxed'}
                  rows={2}
                  value={v.t}
                  onChange={e => patchFrom(c => ({ verses: c.verses.map((x, j) => j === i ? { ...x, t: e.target.value } : x) }))}
                />
                <button className={miniBtn} onClick={() => patchFrom(c => ({ verses: c.verses.filter((_, j) => j !== i) }))} aria-label="삭제">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button className={addBtn} onClick={() => patchFrom(c => ({ verses: [...c.verses, { n: c.verses.length + 1, t: '' }] }))}>
              <Plus size={12} /> 절 추가
            </button>
          </div>
        </>
      ))}

      {/* ── ④ 메시지 · 섬김 · 공지 · 헌금 ── */}
      {section('back', '④ 메시지 · 섬김 · 공지 · 헌금', `공지 ${content.notices.length}건 · 대표기도 ${content.prayerAssignments.length}명 지정`, (
        <>
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">메시지 제목 (줄바꿈 가능)</label>
            <textarea className={inputCls + ' w-full font-bold'} rows={2} value={content.messageTitle}
              onChange={e => patch({ messageTitle: e.target.value })} />
          </div>
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">메시지 본문 (5~7줄 권장)</label>
            <textarea className={inputCls + ' w-full leading-relaxed'} rows={6} value={content.messageBody}
              onChange={e => patch({ messageBody: e.target.value })} />
          </div>

          {/* 섬김표 — 대표기도는 성도 선택 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-2xs font-bold text-gray-500">기도 및 식사 섬김 (월별 두 달치)</label>
              <button
                className="text-2xs font-bold text-gray-400 hover:text-rose-600 hover:underline cursor-pointer shrink-0"
                onClick={() => patch({ servingMonths: buildServingMonths(dateStr), prayerAssignments: [] })}
              >
                비우고 새로
              </button>
            </div>

            {/* 달이 넘어가면 뒤칸의 표를 앞칸으로 옮겨 옵니다 (적어 둔 섬김은 그대로) */}
            {!servingMonthsMatchDate(content.servingMonths, dateStr) && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                <p className="text-2xs text-amber-800 leading-relaxed flex-1">
                  이 주보는 <strong>{ymOf(dateStr, 0).replace('-', '년 ')}월</strong>인데
                  표는 {content.servingMonths.map(m => m.head[0] || '?').join('·') || '비어 있음'}입니다.
                </p>
                <button
                  className="shrink-0 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-2xs font-bold cursor-pointer"
                  onClick={() => patchAndSync(rollServingForDate(content.servingMonths, content.prayerAssignments, dateStr))}
                >
                  달 맞추기
                </button>
              </div>
            )}
            <p className="text-3xs text-gray-400 leading-relaxed">
              대표기도에 성도를 고르면 그 주일 주보의 예배 순서 <strong>기도</strong> 줄
              담당자로 자동으로 들어갑니다.
              달을 고르면 그 달의 주일 날짜로 줄이 깔립니다. 모자라거나 남으면
              줄 끝의 휴지통으로 지우고 <strong>주일 줄 추가</strong>로 더하세요.
              달이 넘어가면 <strong>달 맞추기</strong>로 뒤칸 표를 앞으로 옮겨 옵니다
              (적어 둔 섬김은 따라옵니다). <strong>비우고 새로</strong>는 전부 지우고 다시 만듭니다.
            </p>

            {content.servingMonths.map((m, mi) => (
              <div key={mi} className="p-2.5 bg-gray-50 rounded-xl space-y-1.5">
                {/* 연도·월을 받아야 그 달의 주일 날짜(9/6 …)를 뽑을 수 있습니다 */}
                <input
                  type="month"
                  className={inputCls + ' bg-white font-bold w-36 shrink-0 cursor-pointer'}
                  value={m.ym || ymOf(dateStr, mi)}
                  onChange={e => setServingMonthYm(mi, e.target.value)}
                />
                <div className="flex items-center gap-1.5 px-0.5">
                  <span className="w-12 shrink-0 text-3xs font-bold text-gray-400">주일</span>
                  <span className="flex-1 text-3xs font-bold text-gray-400">대표기도 (성도 선택)</span>
                  <span className="w-[4.5rem] shrink-0 text-3xs font-bold text-gray-400">식사</span>
                  <span className="w-[26px] shrink-0" />
                </div>
                {m.rows.map((r, ri) => (
                  <div key={ri} className="flex items-center gap-1.5">
                    <span className="w-12 text-2xs font-bold text-gray-500 shrink-0 tabular-nums">{r[0]}</span>
                    <select
                      className={inputCls + ' bg-white flex-1 basis-0 cursor-pointer'}
                      value={prayerUserIdAt(mi, ri)}
                      onChange={e => assignPrayer(mi, ri, e.target.value)}
                    >
                      <option value="">— 선택 안 함 —</option>
                      {selectableMembers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}{u.duty ? ` ${u.duty}` : ''}</option>
                      ))}
                    </select>
                    {/* 식사 섬김은 라브리 1·2·3 이 돌아가므로 드롭다운으로 좁게 둡니다 */}
                    <select
                      className={inputCls + ' bg-white w-[4.5rem] shrink-0 cursor-pointer'}
                      value={MEAL_OPTIONS.includes(r[MEAL_COL] || '') ? r[MEAL_COL] : ''}
                      onChange={e => setMealCell(mi, ri, e.target.value)}
                    >
                      <option value="">—</option>
                      {MEAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {/* 주일이 네 번인 달은 남는 줄을 여기서 지웁니다 */}
                    <button
                      className={miniBtn + ' shrink-0'}
                      onClick={() => removeServingRow(mi, ri)}
                      aria-label={`${r[0]} 줄 삭제`}
                      title="이 주일 줄 삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button className={addBtn} onClick={() => addServingRow(mi)}>
                  <Plus size={12} /> 주일 줄 추가
                </button>
              </div>
            ))}

          </div>

          {/* 공지 */}
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">공지 제목</label>
            <input
              className={inputCls + ' w-full font-bold'}
              value={content.noticeTitle}
              placeholder="공지 사항"
              onChange={e => patch({ noticeTitle: e.target.value })}
            />
            <label className="block text-2xs font-bold text-gray-500 mt-2 mb-1">공지 내용</label>
            <div className="space-y-1.5">
              {content.notices.map((n, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className={inputCls + ' flex-1 basis-0'} value={n}
                    onChange={e => patchFrom(c => ({ notices: c.notices.map((x, j) => j === i ? e.target.value : x) }))} />
                  <button className={miniBtn} onClick={() => patchFrom(c => ({ notices: c.notices.filter((_, j) => j !== i) }))} aria-label="삭제">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button className={addBtn} onClick={() => patchFrom(c => ({ notices: [...c.notices, ''] }))}>
                <Plus size={12} /> 공지 추가
              </button>
            </div>
            <p className="text-3xs text-gray-400 leading-relaxed mt-1.5">
              내용을 하나도 적지 않으면 주보에서 공지 칸이 통째로 빠집니다
              (빈 상자만 남지 않도록).
            </p>
          </div>

          {/* 헌금 */}
          <div>
            <label className="block text-2xs font-bold text-gray-500 mb-1">헌금 계좌 (한 줄에 하나)</label>
            <div className="space-y-1.5">
              {content.offeringLines.map((l, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className={inputCls + ' flex-1 basis-0'} value={l}
                    onChange={e => patchFrom(c => ({ offeringLines: c.offeringLines.map((x, j) => j === i ? e.target.value : x) }))} />
                  <button className={miniBtn} onClick={() => patchFrom(c => ({ offeringLines: c.offeringLines.filter((_, j) => j !== i) }))} aria-label="삭제">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button className={addBtn} onClick={() => patchFrom(c => ({ offeringLines: [...c.offeringLines, ''] }))}>
                <Plus size={12} /> 줄 추가
              </button>
            </div>
            <input className={inputCls + ' w-full mt-1.5'} value={content.offeringQr}
              placeholder="QR 이미지 주소 (비우면 QR 자리만 표시)"
              onChange={e => patch({ offeringQr: e.target.value })} />

            <label className="block text-2xs font-bold text-gray-500 mt-3 mb-1">
              교회 홈페이지 QR (헌금 계좌 왼쪽)
            </label>
            <div className="flex items-center gap-1.5">
              <input className={inputCls + ' flex-1 basis-0'} value={content.homepageQr}
                placeholder="QR 이미지 주소 (비우면 이 칸이 빠집니다)"
                onChange={e => patch({ homepageQr: e.target.value })} />
              <input className={inputCls + ' w-28'} value={content.homepageLabel}
                placeholder="교회홈페이지"
                onChange={e => patch({ homepageLabel: e.target.value })} />
            </div>
          </div>
        </>
      ))}

      {/* ── 미리보기 ── */}
      {showPreview && (
        <div className="bg-slate-200 rounded-2xl p-3">
          <p className="text-2xs font-bold text-slate-500 mb-2">
            미리보기 — 화면 폭에 맞춰 줄여 보여 줍니다. 글이 넘치면 쪽 아래가 잘립니다.
          </p>
          {/* flex 로 감싸면 BulletinView 가 내용 너비(561px)로 부풀어 축소가 걸리지
              않습니다. 가운데 정렬은 BulletinView 안쪽(.doc)이 이미 합니다. */}
          <BulletinView content={previewContent} mode="web" />
        </div>
      )}

      {currentUser?.role !== 'ADMIN' && (
        <p className="text-2xs text-rose-500 font-semibold">이 탭은 관리자만 저장할 수 있습니다.</p>
      )}
    </div>
  )
}
