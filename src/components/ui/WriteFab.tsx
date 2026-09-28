'use client'

import { Pencil } from 'lucide-react'
import { useIsTyping } from '../../lib/useIsTyping'

/**
 * 글쓰기 버튼 (화면 오른쪽 아래에 떠 있는 버튼)
 *
 * 예전에는 + 동그라미만 있어서 무엇을 쓰는 버튼인지 알기 어려웠고, 게시판마다 글쓰기 버튼의
 * 위치·모양이 달랐습니다(나눔은 떠 있는 +, 가족소식은 목록 위 작은 버튼).
 * → 모든 게시판에서 같은 자리에 "무엇을 쓰는지" 글자를 붙인 버튼으로 맞춥니다.
 *
 * 🐛 지켜야 할 것 (나눔 탭에서 겪은 문제)
 *  ① 아이폰 홈 화면 앱은 하단 메뉴 아래에 안전영역(약 34px)이 붙습니다 → 그만큼 더 올립니다.
 *  ② 오른쪽 아래가 댓글 [등록] 버튼 자리라, 글자를 입력하는 동안(키보드가 올라와 있는 동안)은 숨깁니다.
 *  ③ 목록 맨 끝이 이 버튼에 가리지 않도록, 버튼을 쓰는 화면은 목록 아래 여백(pb-24)을 둡니다.
 */
export default function WriteFab({ label, onClick }: { label: string; onClick: () => void }) {
  const isTyping = useIsTyping()
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={isTyping ? -1 : undefined}
      aria-hidden={isTyping || undefined}
      className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 sm:right-[calc(50%-200px)] z-40 flex items-center gap-1.5 pl-3.5 pr-4 py-3 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-bold shadow-lg transition-all duration-200 ${
        isTyping ? 'opacity-0 translate-y-4 pointer-events-none' : ''
      }`}
    >
      <Pencil size={16} strokeWidth={2.5} />
      {label}
    </button>
  )
}
