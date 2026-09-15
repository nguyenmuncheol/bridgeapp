'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useModalDismiss } from '../lib/useModalDismiss'

/**
 * 앱 안에서 뜨는 "정말 하시겠습니까?" 확인창.
 *
 * 🐛 예전엔 브라우저 기본 confirm() 을 33곳에서 썼습니다. 홈 화면에 설치해 쓰는 PWA 에서는
 *    주소창이 없는 화면에 갑자기 "hanoibridge.vercel.app 내용:" 이라는 회색 시스템 창이 떠서
 *    앱이 아니라 웹사이트라는 게 드러났습니다. 특히 탈퇴·삭제처럼 **가장 신중해야 할 순간에
 *    가장 조잡한 화면**이 떴습니다.
 *
 * ⚠️ 묻는 횟수와 흐름은 그대로입니다. 확인을 한 번 더 받는 안전장치는 잘 동작하고 있으니
 *    생김새만 앱답게 바꾸는 것이 전부입니다.
 *
 * 쓰는 법 — confirm() 과 거의 같고 await 만 붙습니다. 훅이 아니라 그냥 함수라서
 * 컴포넌트 안이든 밖이든 어디서나 부를 수 있습니다.
 *
 *   if (!(await askConfirm('이 댓글을 지울까요?\n지운 댓글은 되돌릴 수 없습니다.'))) return
 *
 * 문자열을 넘기면 **첫 줄이 제목, 나머지가 설명**이 됩니다. confirm() 에 쓰던 문구를
 * 그대로 옮겨도 자연스럽게 나뉩니다. 버튼 글씨나 빨간 강조가 필요하면 객체로 넘깁니다.
 *
 *   await askConfirm({ title: '명도준 님을 삭제할까요?', message: '되돌릴 수 없습니다.',
 *                      confirmLabel: '삭제', tone: 'danger' })
 */

export interface ConfirmOptions {
  /** 굵게 나오는 한 줄. 무엇을 하려는지 적습니다. */
  title: string
  /** 아래 작은 글씨. 되돌릴 수 없다는 점 등 결과를 적습니다. 줄바꿈(\n)은 그대로 표시됩니다. */
  message?: string
  /** 실행 버튼 글씨. 기본값 '확인'. "삭제", "탈퇴 처리"처럼 할 일을 그대로 적는 편이 좋습니다. */
  confirmLabel?: string
  /** 취소 버튼 글씨. 기본값 '취소'. */
  cancelLabel?: string
  /** 되돌릴 수 없는 작업이면 'danger'. 실행 버튼이 빨간색이 되고 경고 아이콘이 붙습니다. */
  tone?: 'default' | 'danger'
  /** true 면 버튼이 하나만 나옵니다(알려 주기만 할 때). showAlert 가 이걸 씁니다. */
  noticeOnly?: boolean
}

// ─────────────────────────────────────────────────────────────
// 화면에 떠 있는 ConfirmProvider 를 가리키는 연결점.
//
// 훅(useConfirm) 대신 모듈 함수로 만든 이유: 확인창은 관리자 화면·나눔·댓글 등
// 33곳에서 부르는데, 그 자리마다 훅을 끼워 넣으려면 컴포넌트 구조를 건드려야 합니다.
// 토스트 라이브러리들이 쓰는 방식대로 Provider 가 자기 자신을 여기 등록해 두고,
// 부르는 쪽은 그냥 함수를 쓰게 했습니다. Provider 는 앱 전체에 하나뿐입니다.
// ─────────────────────────────────────────────────────────────
let openConfirm: ((opts: ConfirmOptions) => Promise<boolean>) | null = null

function normalize(input: ConfirmOptions | string, extra?: Partial<ConfirmOptions>): ConfirmOptions {
  if (typeof input !== 'string') return { ...input, ...extra }
  const [first, ...rest] = input.split('\n')
  return { title: first, message: rest.join('\n').trim() || undefined, ...extra }
}

/**
 * 확인창을 띄우고 답을 기다립니다. true = 실행, false = 취소.
 *
 * 아직 Provider 가 붙기 전(서버 렌더 직후의 아주 짧은 순간)에 불리면 브라우저 기본
 * confirm 으로 대신 물어봅니다. 확인 절차가 조용히 사라져서 곧바로 삭제되는 일은
 * 없어야 하기 때문입니다.
 */
export function askConfirm(
  input: ConfirmOptions | string,
  /** 문구는 그대로 두고 버튼 글씨나 빨간 강조만 얹고 싶을 때 씁니다. */
  extra?: Partial<ConfirmOptions>
): Promise<boolean> {
  const opts = normalize(input, extra)
  if (openConfirm) return openConfirm(opts)
  if (typeof window === 'undefined') return Promise.resolve(false)
  const text = [opts.title, opts.message].filter(Boolean).join('\n')
  if (opts.noticeOnly) {
    window.alert(text)
    return Promise.resolve(true)
  }
  return Promise.resolve(window.confirm(text))
}

/**
 * 알려 주기만 하고 답은 받지 않는 창. 브라우저 alert() 자리를 대신합니다.
 *
 * 토스트(showToast)가 있는 화면에서는 그쪽이 더 가볍고 좋습니다. 이 함수는 토스트가 없는
 * 화면(로그인 전 화면, 프로필 최초 설정, 설치 안내)에서만 씁니다.
 */
export function showAlert(input: ConfirmOptions | string, extra?: Partial<ConfirmOptions>): Promise<boolean> {
  return askConfirm(input, { confirmLabel: '확인', ...extra, noticeOnly: true })
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null)
  // 열려 있는 동안 답을 기다리는 쪽에 결과를 돌려줄 통로입니다.
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const close = useCallback((ok: boolean) => {
    // 먼저 답부터 돌려주고 창을 닫습니다.
    resolveRef.current?.(ok)
    resolveRef.current = null
    setState(null)
  }, [])

  // 배경 탭·ESC·폰 뒤로가기는 모두 "취소"로 처리합니다.
  // (실행 쪽으로 새어 나가면 되돌릴 수 없는 작업이 실수로 일어납니다)
  const handleDismiss = useCallback(() => close(false), [close])
  useModalDismiss(state !== null, handleDismiss)

  // 🐛 backdropClose(handleDismiss) 를 JSX 안에서 직접 부르면, handleDismiss 가 결국
  // resolveRef.current 를 읽는 close() 로 이어진다는 걸 린트가 정적으로 추적하고
  // "렌더 중에 ref 를 읽을 수도 있다"고 (오탐으로) 표시합니다. 실제로는 이 호출이
  // onClose 를 그 자리에서 실행하는 게 아니라 이벤트 핸들러를 새로 만들어 반환할 뿐이라
  // 안전하지만, 아예 useCallback 으로 한 번 감싸 배경 클릭 핸들러 자체를 만들어 두면
  // 린트도, 사람이 읽기에도 더 명확합니다.
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (e.target === e.currentTarget) {
      e.preventDefault()
      handleDismiss()
    }
  }, [handleDismiss])

  useEffect(() => {
    openConfirm = (opts) => new Promise<boolean>(resolve => {
      // 이미 떠 있는 확인창이 있으면 그것부터 취소로 정리합니다(두 개가 겹치지 않도록).
      resolveRef.current?.(false)
      resolveRef.current = resolve
      setState(opts)
    })
    return () => {
      openConfirm = null
      // 화면을 떠나는데 답을 기다리는 쪽이 남아 있으면 취소로 끊어 줍니다.
      resolveRef.current?.(false)
      resolveRef.current = null
    }
  }, [])

  const isDanger = state?.tone === 'danger'

  return (
    <>
      {children}

      {state && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-5"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-start gap-3">
              {isDanger && (
                <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} />
                </span>
              )}
              <div className="min-w-0 space-y-1">
                <h2 id="confirm-dialog-title" className="text-xs font-bold text-gray-900 break-keep leading-relaxed">
                  {state.title}
                </h2>
                {state.message && (
                  <p className="text-2xs text-gray-500 whitespace-pre-wrap break-keep leading-relaxed">
                    {state.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {!state.noticeOnly && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors active:scale-[0.98]"
                >
                  {state.cancelLabel || '취소'}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold transition-colors active:scale-[0.98] ${
                  isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand hover:bg-brand-hover'
                }`}
              >
                {state.confirmLabel || '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
