'use client'

import { useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 배경 스크롤 잠금 — 팝업이 겹쳐도 안전하게
//
// 🐛 이 앱은 같은 종류의 사고를 이미 여러 번 겪었습니다(89fad4a, 5472706, 318666b).
//    원인은 늘 같았습니다. 두 곳에서 각자 document.body.style.overflow 를 저장했다가
//    되돌리는데, **되돌리는 순서가 저장한 순서의 역순이라는 보장이 없다**는 것입니다.
//
//    특히 확인 모달(ConfirmDialog)은 화면 맨 바깥 레이아웃에 붙어 있고, 그 위에서
//    글쓰기 모달은 children 안쪽에 있습니다. React 는 정리(cleanup)를 트리 순서대로
//    실행하므로 안쪽(글쓰기 모달)이 먼저 풀리고 바깥(확인 모달)이 나중에 풀립니다.
//    그러면 확인 모달이 "내가 저장해 둔 값은 hidden 이었지" 하며 **다시 잠가 버립니다.**
//    = 팝업을 다 닫았는데 페이지가 스크롤되지 않는 그 증상입니다.
//
// → 누가 먼저 풀든 상관없도록 **잠근 팝업 수를 셉니다.** 0 → 1 로 올라갈 때만 실제로
//   잠그면서 원래 값을 기억하고, 1 → 0 으로 내려올 때만 그 값을 되돌립니다.
//   중간에 몇 개가 겹치든, 어떤 순서로 풀리든 결과가 같습니다.
// ─────────────────────────────────────────────────────────────────────────────
let scrollLockCount = 0
let scrollLockSaved: {
  bodyOverflow: string
  bodyOverscroll: string
  docOverscroll: string
} | null = null

function lockBackgroundScroll() {
  if (scrollLockCount === 0) {
    scrollLockSaved = {
      bodyOverflow: document.body.style.overflow,
      bodyOverscroll: document.body.style.overscrollBehaviorY,
      docOverscroll: document.documentElement.style.overscrollBehaviorY,
    }
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehaviorY = 'none'
    document.documentElement.style.overscrollBehaviorY = 'none'
  }
  scrollLockCount += 1
}

function unlockBackgroundScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0 && scrollLockSaved) {
    document.body.style.overflow = scrollLockSaved.bodyOverflow
    document.body.style.overscrollBehaviorY = scrollLockSaved.bodyOverscroll
    document.documentElement.style.overscrollBehaviorY = scrollLockSaved.docOverscroll
    scrollLockSaved = null
  }
}

/**
 * 팝업이 열려있는 동안 폰/브라우저 "뒤로가기"를 페이지 이동 대신 팝업 닫기로 가로챕니다.
 *
 * 🐛 과거 불편: 팝업이 떠 있을 때 뒤로가기를 누르면 팝업은 그대로 있고 페이지(탭)가
 * 바뀌어버렸습니다. 안드로이드 사용자는 뒤로가기를 습관적으로 눌러서 자주 겪는 문제였습니다.
 *
 * 🐛 과거 버그: 내용이 길어 팝업 안에서 스크롤이 필요한 화면(행사사진 상세, 공지 등)은
 * 배경 페이지의 스크롤이 잠겨 있지 않았습니다. 팝업 안을 위/아래로 밀다가 팝업의 스크롤이
 * 끝(맨 위/맨 아래)에 닿으면, 그 드래그가 그대로 배경 페이지로 새어나가 뒤에서 페이지가
 * 같이 스크롤되거나(출석체크 모달에서 먼저 발견된 것과 같은 문제) 당겨서 새로고침이
 * 걸렸습니다. → useWriteModalGuard(글쓰기 모달)에는 이미 있던 잠금을, 훨씬 많은 화면이
 * 쓰는 이 훅에도 걸어서 한 곳만 고치면 모든 팝업에 적용되게 합니다.
 */
/**
 * 팝업이 열려 있는 동안 배경 페이지 스크롤을 잠급니다.
 *
 * useModalDismiss(뒤로가기 가로채기)나 useWriteModalGuard(작성 중 이탈 방지)가 필요 없고
 * **잠금만** 필요한 팝업에서 씁니다. 안에서 위 참조 카운트 헬퍼를 쓰므로, 다른 팝업이나
 * 확인창이 위에 겹쳐 떠도 서로 잠금을 빼앗지 않습니다.
 *
 * 부모가 조건부로 mount 하는 팝업이면 그냥 useBackgroundScrollLock() 처럼 부르면 됩니다.
 */
export function useBackgroundScrollLock(isOpen: boolean = true) {
  useEffect(() => {
    if (!isOpen) return
    lockBackgroundScroll()
    return unlockBackgroundScroll
  }, [isOpen])
}

// 팝업마다 쌓는 기록 칸에 붙이는 이름표.
// 🐛 과거 버그: 팝업 위에 확인창이 겹쳐 뜬 상태에서 확인창이 닫히면(취소·확인·뒤로가기 모두),
//    그 기록 되돌리기(popstate)를 **아래 팝업도 자기 것으로 알고** 함께 닫혔습니다.
//    예) 알림 [전체삭제] → [취소] 를 눌렀는데 알림 패널까지 닫힘.
// → 되돌아온 칸이 내 이름표면 "내 위의 팝업이 닫힌 것"이므로 나는 그대로 둡니다.
let popupSeq = 0
const isMyEntry = (id: number) => (history.state as { popupId?: number } | null)?.popupId === id

export function useModalDismiss(isOpen: boolean, onClose: () => void) {
  const closedByBackRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    closedByBackRef.current = false
    const popupId = ++popupSeq
    history.pushState({ modal: true, popupId }, '')

    const onPopState = () => {
      if (isMyEntry(popupId)) return
      closedByBackRef.current = true
      onClose()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      // X 버튼 등 뒤로가기가 아닌 방식으로 닫혔으면, 아까 쌓아둔 히스토리 항목을 정리합니다.
      if (!closedByBackRef.current) history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    lockBackgroundScroll()
    return unlockBackgroundScroll
  }, [isOpen])
}

/**
 * 글 작성/수정 모달 전용 가드 훅.
 *
 * 1. 모바일 풀-투-리프레시(Pull to Refresh) 차단:
 *    모달이 열리면 document.body와 documentElement의 overscroll-behavior를 'none'으로 지정하고
 *    body overflow를 'hidden'으로 잠가, 모바일 화면을 위아래로 당겨도 페이지가 새로고침되지 않도록 방지합니다.
 * 2. 브라우저 새로고침/탭 닫기 경고 (beforeunload):
 *    작성 중인 내용이 있을 때 새로고침/이동 시도 시 브라우저 기본 경고창을 띄웁니다.
 * 3. 폰 뒤로가기 키(Android Back Button) 안전 차단:
 *    작성 중인 내용이 있을 때 뒤로가기를 누르면 바로 닫히지 않고 확인 창을 띄웁니다.
 */
export function useWriteModalGuard(
  isOpen: boolean,
  hasUnsavedChanges: boolean,
  onClose: () => void
) {
  const closedByBackRef = useRef(false)
  const hasUnsavedRef = useRef(hasUnsavedChanges)

  // 🐛 예전엔 렌더 도중 곧바로 hasUnsavedRef.current 에 값을 넣었습니다. React 는 렌더를
  //    "순수한 계산"으로 보고 도중에 버리거나 두 번 돌릴 수 있어서, 렌더 중에 바깥 값을
  //    건드리면 예고 없이 어긋날 수 있습니다.
  // → 렌더가 끝난 뒤(effect)에 옮겨 적습니다. 이 값을 읽는 쪽은 beforeunload/popstate
  //   이벤트 핸들러뿐이고 그건 항상 렌더·effect 이후에 실행되므로 동작은 같습니다.
  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedChanges
  })

  useEffect(() => {
    if (!isOpen) return

    // 1. 모바일 브라우저 풀-투-리프레시 및 배경 스크롤 차단
    //    (위 참조 카운트 헬퍼를 씁니다 — 확인 모달이 이 위에 겹쳐 떠도 안전합니다)
    lockBackgroundScroll()

    // 2. 브라우저 새로고침 / 이탈 방지
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedRef.current) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // 3. 폰 뒤로가기 키 처리
    closedByBackRef.current = false
    const popupId = ++popupSeq
    history.pushState({ writeModal: true, popupId }, '')

    const onPopState = () => {
      // 이 창 위에 뜬 확인창이 닫힌 것뿐이면(되돌아온 칸이 내 것) 아무것도 하지 않습니다.
      if (isMyEntry(popupId)) return
      if (hasUnsavedRef.current) {
        const leave = window.confirm('작성 중인 내용이 있습니다. 정말 창을 닫으시겠습니까?\n작성 중인 내용은 저장되지 않습니다.')
        if (!leave) {
          history.pushState({ writeModal: true, popupId }, '')
          return
        }
      }
      closedByBackRef.current = true
      onClose()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      unlockBackgroundScroll()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', onPopState)
      if (!closedByBackRef.current) {
        history.back()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
}

/**
 * 팝업을 닫은 **다음에** 할 일을 예약합니다. (팝업 안의 버튼이 다른 화면으로 보내거나, 다른 팝업을 띄울 때)
 *
 * 🐛 useModalDismiss 팝업은 열릴 때 기록을 한 칸 쌓고, 닫힐 때 history.back() 으로 그 칸을 지웁니다.
 *    그런데 history.back() 은 **나중에** 처리되고 pushState 는 **즉시** 처리됩니다. 그래서 닫자마자
 *    탭을 옮기거나(pushState) 확인창을 띄우면, 늦게 도착한 back() 이 방금 쌓은 칸을 지워 버립니다.
 *    (탭 이동이 취소되거나, "로그아웃 하시겠습니까?" 창이 뜨자마자 닫힘)
 * → 기록 되돌리기가 끝났다는 신호(popstate)를 받은 뒤에 실행합니다.
 *   신호가 안 오는 드문 경우를 대비해 조금 기다렸다가 그래도 실행합니다.
 *
 *   runAfterHistoryPop(() => onNavigate('news'))
 *   onClose()   // ← 반드시 예약 다음에 닫습니다
 */
export function runAfterHistoryPop(fn: () => void, fallbackMs = 700) {
  let done = false
  const run = () => {
    if (done) return
    done = true
    window.removeEventListener('popstate', onPop)
    clearTimeout(timer)
    fn()
  }
  // popstate 를 받은 같은 순간에는 다른 처리기(화면 전환 등)가 아직 돌고 있으므로 한 박자 뒤에 실행합니다.
  const onPop = () => { setTimeout(run, 0) }
  window.addEventListener('popstate', onPop)
  const timer = setTimeout(run, fallbackMs)
}

/** 팝업 바깥 배경(backdrop)을 눌렀을 때만 닫히는 클릭 핸들러 (안쪽 내용 클릭은 무시, 이벤트 전파 차단). */
export function backdropClose(onClose: () => void) {
  return (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    if (e.target === e.currentTarget) {
      e.preventDefault()
      onClose()
    }
  }
}

