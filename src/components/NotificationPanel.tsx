'use client'

import { useEffect, useState } from 'react'
import { X, Trash2, Bell } from 'lucide-react'
import { NotificationItem, UserProfile, getUserDisplayName } from '../lib/mockData'
import { dbFetchNotifications, dbMarkAllNotificationsRead, dbDeleteNotification } from '../lib/db'
import { formatDateTimeShort } from '../lib/dateUtils'

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
 */
function destinationOf(n: NotificationItem): { tab: string; sub: string } {
  // ① 서버가 시간에 맞춰 보내는 알림은 글이 아니라 "할 일"이라 목적지가 정해져 있습니다.
  if (n.type === 'MEAL') return { tab: 'request', sub: '' }
  if (n.type === 'ATTENDANCE') return { tab: 'mypage', sub: '' }   // 관리 화면은 내 정보에서 들어갑니다
  if (n.type === 'BULLETIN') return { tab: 'home', sub: '' }
  if (n.type === 'BIRTHDAY') return { tab: 'news', sub: 'memberNews' }
  if (n.type === 'MANUAL') return { tab: 'home', sub: '' }

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
  return '📢'
}

/** 서버가 자동으로 보내는 알림인지 (사람이 만든 알림과 문장 모양이 다릅니다) */
function isSystemType(type: NotificationItem['type']): boolean {
  return type === 'MEAL' || type === 'ATTENDANCE' || type === 'BIRTHDAY' || type === 'BULLETIN' || type === 'MANUAL'
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
    onNavigate(tab, sub || undefined)
    onClose()
  }

  const handleDelete = async (e: any, id: string) => {
    e.stopPropagation()
    const backup = items
    setItems(items.filter(x => x.id !== id))
    const { error: delError } = await dbDeleteNotification(id)
    if (delError) setItems(backup)   // 실패하면 되돌립니다
  }

  return (
    <div className="fixed inset-0 z-[75]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25" />
      {/* 헤더 이름 버튼 바로 아래에 붙는 패널 */}
      <div
        onClick={e => e.stopPropagation()}
        className="absolute top-[60px] right-3 w-[min(92vw,340px)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <Bell size={14} className="text-[#335f87]" />
            <h3 className="font-bold text-sm text-gray-900">알림</h3>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1 text-gray-400 hover:text-gray-600" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {isLoading && <p className="py-8 text-center text-xs text-gray-400">불러오는 중...</p>}

          {!isLoading && error && (
            <p className="py-8 px-4 text-center text-xs text-amber-700">{error}</p>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="py-10 text-center space-y-1">
              <p className="text-2xl">🔔</p>
              <p className="text-xs text-gray-400">새로운 알림이 없습니다</p>
            </div>
          )}

          {!isLoading && !error && items.map(n => (
            <button
              key={n.id}
              onClick={() => handleOpen(n)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-b-0 flex gap-2.5 hover:bg-gray-50 transition-colors ${
                n.isRead ? '' : 'bg-blue-50/40'
              }`}
            >
              <span className="text-base leading-none mt-0.5 shrink-0">{iconOf(n.type)}</span>
              <span className="flex-1 min-w-0 space-y-0.5">
                {isSystemType(n.type) ? (
                  <>
                    <span className="block text-xs text-gray-800 leading-snug font-bold">{n.title}</span>
                    <span className="block text-2xs text-gray-500 leading-relaxed">{n.body}</span>
                    {/* 관리자가 직접 보낸 알림은 누가 보냈는지 밝힙니다 */}
                    {n.type === 'MANUAL' && n.actorName && (
                      <span className="block text-2xs text-gray-400">보낸 사람 · {n.actorName}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="block text-xs text-gray-800 leading-snug">
                      <strong className="font-bold">{n.actorName}</strong>
                      {n.type === 'COMMENT' && '님이 댓글을 남겼습니다'}
                      {n.type === 'LIKE' && `님이 ${n.body}`}
                      {n.type === 'NOTICE' && '님이 새 공지를 올렸습니다'}
                    </span>
                    <span className="block text-2xs text-gray-500 truncate">
                      {n.type === 'COMMENT' ? `"${n.body}"` : n.title}
                    </span>
                  </>
                )}
                <span className="block text-2xs text-gray-400">{whenText(n.createdAt)}</span>
              </span>
              <span
                onClick={e => handleDelete(e, n.id)}
                className="p-1.5 -m-1 text-gray-300 hover:text-rose-500 shrink-0 self-start"
                title="이 알림 지우기"
              >
                <Trash2 size={12} />
              </span>
            </button>
          ))}
        </div>

        {/* 내 정보 / 로그아웃 — 예전에 이름 버튼이 하던 일을 여기로 옮겼습니다 */}
        <div className="border-t border-gray-100 p-2 space-y-1 bg-gray-50/60">
          <button
            onClick={() => { onGoMyPage(); onClose() }}
            className="w-full py-2 text-xs font-bold text-[#335f87] rounded-lg hover:bg-white transition-colors"
          >
            {getUserDisplayName(currentUser)} · 내 정보 보기
          </button>
          {canLogout && (
            <button
              onClick={() => { onClose(); onLogout() }}
              className="w-full py-2 text-xs font-bold text-gray-400 rounded-lg hover:bg-white hover:text-rose-500 transition-colors"
            >
              로그아웃
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
