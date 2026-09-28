'use client'

import { useEffect, useState } from 'react'
import { Trash2, Bell } from 'lucide-react'
import { NotificationItem, UserProfile, getUserDisplayName } from '../lib/mockData'
import { dbFetchNotifications, dbMarkAllNotificationsRead, dbDeleteNotification, dbDeleteAllNotifications } from '../lib/db'
import { formatDateTimeShort } from '../lib/dateUtils'
import { useModalDismiss, runAfterHistoryPop } from '../lib/useModalDismiss'
import { askConfirm } from './ConfirmDialog'
import SectionTitle from './ui/SectionTitle'
import { ModalCloseButton, ModalBottomCloseButton } from './ui/Modal'

/** 교회 명의로 나가는 알림의 보낸 사람 이름 (서버 함수들과 같은 값) */
const CHURCH_NAME = '더브릿지교회'

interface NotificationPanelProps {
  currentUser: UserProfile
  items: NotificationItem[]
  setItems: (next: NotificationItem[]) => void
  onClose: () => void
  /** 알림을 눌렀을 때 해당 화면(+서브탭)으로 이동 */
  onNavigate: (tab: string, subTab?: string) => void
  /** 내 정보 화면으로 이동 */
  onGoMyPage: () => void
  onLogout: () => void
  canLogout: boolean
}

/**
 * 알림 하나 → 어느 화면으로 보낼지.
 *
 * 큰 탭만 정하면 나눔은 늘 "기도제목"이, 우리소식은 늘 "교회일정"이 먼저 보입니다.
 * 그래서 **서브탭까지** 함께 정해서 돌려줍니다.
 *
 * 휴대폰 푸시 알림을 눌렀을 때도(app/page.tsx) 이 함수로 목적지를 정합니다 — 두 곳이 같은 규칙.
 * tab 이 'admin' 이면 관리자 대시보드의 그 탭(sub)을 엽니다. 권한이 없으면 내정보로 갑니다.
 */
export function destinationOf(n: NotificationItem): { tab: string; sub: string } {
  // ① 서버가 시간에 맞춰 보내는 알림은 글이 아니라 "할 일"이라 목적지가 정해져 있습니다.
  if (n.type === 'MEAL') return { tab: 'request', sub: 'meal' }
  // 본문이 "(관리 화면 > 출석)" 이라고 안내하므로 그 탭을 바로 엽니다.
  if (n.type === 'ATTENDANCE') return { tab: 'admin', sub: 'stats' }
  if (n.type === 'BULLETIN') return { tab: 'home', sub: '' }
  if (n.type === 'BIRTHDAY') return { tab: 'news', sub: 'memberNews' }
  if (n.type === 'MANUAL') return { tab: 'home', sub: '' }
  if (n.type === 'SIGNUP_REQUEST') return { tab: 'admin', sub: 'approval' }

  // ② 댓글·좋아요·공지는 그 글이 실제로 있는 게시판으로 보냅니다.
  switch (n.postCategory) {
    case 'NOTICE':       return { tab: 'home',    sub: '' }
    case 'MEMBER_NEWS':  return { tab: 'news',    sub: 'memberNews' }
    case 'PHOTO':        return { tab: 'sharing', sub: 'photo' }
    case 'PRAISE':       return { tab: 'sharing', sub: 'praise' }
    case 'PRAYER':       return { tab: 'sharing', sub: 'prayer' }
    case 'LABRI':        return { tab: 'sharing', sub: 'prayer' }
    default:
      // 글 종류를 알 수 없으면(옛날 알림 등) 알림 종류로 최선의 추측을 합니다.
      return n.type === 'NOTICE' ? { tab: 'home', sub: '' } : { tab: 'sharing', sub: 'prayer' }
  }
}

function iconOf(type: NotificationItem['type']): string {
  if (type === 'COMMENT') return '💬'
  if (type === 'LIKE') return '🙏'
  if (type === 'MEAL') return '🍚'
  if (type === 'ATTENDANCE') return '📋'
  if (type === 'BIRTHDAY') return '🎂'
  if (type === 'BULLETIN') return '📖'
  if (type === 'MANUAL') return '📨'
  if (type === 'SIGNUP_REQUEST') return '🙋'
  return '📢'
}

/** 서버가 자동으로 보내는 알림인지 (사람이 만든 알림과 문장 모양이 다릅니다) */
function isSystemType(type: NotificationItem['type']): boolean {
  return type === 'MEAL' || type === 'ATTENDANCE' || type === 'BIRTHDAY' || type === 'BULLETIN' || type === 'MANUAL' || type === 'SIGNUP_REQUEST'
}

/** '2026-08-19T05:12:00Z' → '방금 전 / 3시간 전 / 8/18 21:30' */
function whenText(iso: string): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const diffMin = Math.floor((Date.now() - t) / 60000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}시간 전`
  return formatDateTimeShort(iso)
}

/**
 * 앱 안 알림함 (1단계).
 *
 * 폰이 울리는 푸시 알림이 아니라, 헤더의 내 이름을 눌러 확인하는 방식입니다.
 * 아이폰·안드로이드·PC 어디서나 **설치 없이 똑같이** 동작하고,
 * 잘못 눌러도 성도님들 폰이 울리지 않아 안전합니다.
 * (나중에 진짜 푸시를 붙일 때도 이 알림 기록을 그대로 씁니다)
 */
export default function NotificationPanel({
  currentUser, items, setItems, onClose, onNavigate, onGoMyPage, onLogout, canLogout,
}: NotificationPanelProps) {
  const [isLoading, setIsLoading] = useState(items.length === 0)
  const [error, setError] = useState('')

  // 이 패널은 부모가 조건부로만 mount하므로(showNotifications && <NotificationPanel/>),
  // mount ~ unmount 구간 동안 배경 스크롤을 잠급니다(공용 훅이 잠근 팝업 수를 세므로 겹쳐도 안전).
  //
  // 🐛 예전엔 스크롤만 잠그고 기록(history)은 쌓지 않아서, 안드로이드에서 패널을 연 채
  //    뒤로가기를 누르면 패널은 그대로 떠 있고 뒤에서 탭만 바뀌었습니다.
  // → 다른 팝업처럼 useModalDismiss 를 써서 뒤로가기 = 패널 닫기로 만듭니다.
  useModalDismiss(true, onClose)

  // 패널 안 버튼이 다른 화면으로 보내거나 확인창을 띄울 때는, 패널이 기록에서 빠진 **다음에** 실행합니다.
  // (먼저 실행하면 패널이 닫히며 되돌리는 기록이 방금 옮긴 탭·확인창을 지워 버립니다 — runAfterHistoryPop 주석)
  const closeThen = (fn: () => void) => {
    runAfterHistoryPop(fn)
    onClose()
  }

  // ESC 로 닫기 (PC·키보드 사용자). 위에 "모두 삭제" 확인창이 떠 있으면 그 창이 먼저입니다.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[aria-labelledby="confirm-dialog-title"]')) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // 열 때마다 최신 알림을 다시 받아옵니다.
  useEffect(() => {
    let cancelled = false
    dbFetchNotifications(currentUser.id)
      .then(list => {
        if (cancelled) return
        setItems(list)
        setIsLoading(false)
        // 열어봤으면 읽은 것으로 처리합니다(빨간 표시가 계속 남지 않도록).
        if (list.some(n => !n.isRead)) {
          dbMarkAllNotificationsRead(currentUser.id).catch(() => {})
        }
      })
      .catch(err => {
        if (cancelled) return
        setError(err?.message || '알림을 불러오지 못했습니다.')
        setIsLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id])

  const handleOpen = (n: NotificationItem) => {
    setItems(items.map(x => (x.id === n.id ? { ...x, isRead: true } : x)))
    const { tab, sub } = destinationOf(n)
    closeThen(() => onNavigate(tab, sub || undefined))
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const backup = items
    setItems(items.filter(x => x.id !== id))
    const { error: delError } = await dbDeleteNotification(id)
    if (delError) setItems(backup)   // 실패하면 되돌립니다
  }

  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const handleDeleteAll = async () => {
    if (isDeletingAll || items.length === 0) return
    if (!await askConfirm('알림을 모두 삭제할까요?\n삭제하면 되돌릴 수 없습니다.', { confirmLabel: '삭제', tone: 'danger' })) return
    const backup = items
    setIsDeletingAll(true)
    setItems([])
    const { error: delError } = await dbDeleteAllNotifications(currentUser.id)
    setIsDeletingAll(false)
    if (delError) setItems(backup)   // 실패하면 되돌립니다
  }

  return (
    <div className="fixed inset-0 z-[75]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25" />
      {/* 헤더 이름 버튼 바로 아래에 붙는 패널.
          🐛 예전엔 브라우저 화면의 오른쪽 끝을 기준으로 붙여서, PC처럼 앱이 가운데 좁게 뜨는
             화면에서는 이름 버튼과 멀리 떨어진 곳에 떴습니다. → 앱 본문과 같은 폭의 틀을 기준으로 붙입니다. */}
      <div className="relative w-full max-w-lg md:max-w-xl mx-auto h-0">
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="알림"
        className="absolute top-[60px] right-3 w-[min(92vw,340px)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <Bell size={14} className="text-brand" />
            <SectionTitle>알림</SectionTitle>
          </div>
          <div className="flex items-center gap-2">
            {!isLoading && !error && items.length > 0 && (
              <button
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="text-2xs font-bold text-gray-500 hover:text-rose-500 disabled:opacity-50"
              >
                전체삭제
              </button>
            )}
            <ModalCloseButton onClick={onClose} className="-mr-1.5" />
          </div>
        </div>

        <div className="max-h-vp-55 overflow-y-auto">
          {isLoading && <p className="py-8 text-center text-xs text-gray-500">불러오는 중...</p>}

          {!isLoading && error && (
            <p className="py-8 px-4 text-center text-xs text-amber-700">{error}</p>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="py-10 text-center space-y-1">
              <p className="text-2xl">🔔</p>
              <p className="text-xs text-gray-500">새로운 알림이 없습니다</p>
            </div>
          )}

          {/* 🐛 예전엔 지우기 아이콘이 알림 버튼 **안에** 들어 있었습니다(버튼 속 버튼). 화면 낭독기가
                 둘을 하나로 읽었고, 12px 아이콘이라 손가락으로 누르면 알림이 열리기 일쑤였습니다.
              → 알림 줄과 지우기 버튼을 나란히 두고, 지우기 버튼은 줄 높이 전체를 누를 수 있게 했습니다. */}
          {!isLoading && !error && items.map(n => (
            <div
              key={n.id}
              className={`flex border-b border-gray-50 last:border-b-0 transition-colors ${
                n.isRead ? '' : 'bg-brand-50/40'
              }`}
            >
            <button
              onClick={() => handleOpen(n)}
              className="flex-1 min-w-0 text-left pl-4 pr-1 py-3 flex gap-2.5 hover:bg-gray-50 transition-colors"
            >
              {/* 교회 명의로 나간 알림은 이모지 대신 교회 로고를 보여줍니다 */}
              {n.actorName === CHURCH_NAME ? (
                <span className="w-6 h-6 shrink-0 mt-0.5 flex items-center justify-center">
                  <img src="/logo-square.png" alt="더브릿지교회" className="w-full h-full object-contain" />
                </span>
              ) : (
                <span className="text-base leading-none mt-0.5 shrink-0">{iconOf(n.type)}</span>
              )}
              <span className="flex-1 min-w-0 space-y-0.5">
                {isSystemType(n.type) ? (
                  <>
                    <span className="block text-xs text-gray-800 leading-snug font-bold">{n.title}</span>
                    <span className="block text-2xs text-gray-500 leading-relaxed">{n.body}</span>
                    {/* 관리자가 직접 보낸 알림은 누가 보냈는지 밝힙니다 */}
                    {n.type === 'MANUAL' && n.actorName && (
                      <span className="block text-2xs text-gray-500">보낸 사람 · {n.actorName}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="block text-xs text-gray-800 leading-snug">
                      {/* 뒤에 '님이'를 붙이므로, 이름 끝에 '님'이 이미 있으면 떼어 '님님'을 막습니다 */}
                      <strong className="font-bold">{n.actorName.replace(/\s*님$/, '')}</strong>
                      {n.type === 'COMMENT' && '님이 댓글을 남겼습니다'}
                      {n.type === 'LIKE' && `님이 ${n.body}`}
                      {n.type === 'NOTICE' && '님이 새 공지를 올렸습니다'}
                    </span>
                    <span className="block text-2xs text-gray-500 truncate">
                      {n.type === 'COMMENT' ? `"${n.body}"` : n.title}
                    </span>
                  </>
                )}
                <span className="block text-2xs text-gray-500">{whenText(n.createdAt)}</span>
              </span>
            </button>
            <button
              onClick={e => handleDelete(e, n.id)}
              className="shrink-0 w-11 flex items-start justify-center pt-3.5 text-gray-400 hover:text-rose-500 hover:bg-gray-50 transition-colors"
              aria-label="이 알림 지우기"
              title="이 알림 지우기"
            >
              <Trash2 size={14} />
            </button>
            </div>
          ))}
        </div>

        {/* 내 정보 / 로그아웃 — 예전에 이름 버튼이 하던 일을 여기로 옮겼습니다 */}
        <div className="border-t border-gray-100 p-2 space-y-1 bg-gray-50/60">
          <button
            onClick={() => closeThen(onGoMyPage)}
            className="w-full py-2 text-xs font-bold text-brand rounded-lg hover:bg-white transition-colors"
          >
            {getUserDisplayName(currentUser)} · 내 정보 보기
          </button>
          {canLogout && (
            <button
              onClick={() => closeThen(onLogout)}
              className="w-full py-2 text-xs font-bold text-gray-500 rounded-lg hover:bg-white hover:text-rose-500 transition-colors"
            >
              로그아웃
            </button>
          )}
          <ModalBottomCloseButton onClick={onClose} className="w-full py-2! text-xs!" />
        </div>
      </div>
      </div>
    </div>
  )
}
