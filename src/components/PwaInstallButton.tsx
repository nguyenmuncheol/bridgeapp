'use client'

import { useEffect, useState } from 'react'
import { canInstall, isRunningStandalone, subscribeInstallState, triggerInstall } from '../lib/pwaInstall'

// 안드로이드(Chrome 등)에서 버튼 한 번으로 홈 화면에 설치할 수 있게 합니다.
// 아이폰(Safari)은 이 방식 자체를 지원하지 않아 버튼이 뜨지 않습니다 —
// 아이폰 안내는 MyPageTab.tsx의 수동 가이드를 그대로 사용합니다.
//
// 🐛 과거 버그: 이 컴포넌트가 브라우저 설치 신호를 **직접** 기다렸는데,
// 그 신호는 앱을 켜고 1~2초 뒤 한 번만 오고 이 버튼은 [내정보 → 아코디언 펼치기]를
// 해야 나타나므로 신호를 절대 받을 수 없었습니다(= 버튼이 영영 안 떴습니다).
// → 이제 앱 시작 시점에 PwaRegister가 신호를 받아 보관하고, 여기서는 꺼내 씁니다.
export default function PwaInstallButton() {
  const [available, setAvailable] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => {
      setAvailable(canInstall())
      setStandalone(isRunningStandalone())
    }
    sync()
    return subscribeInstallState(sync)
  }, [])

  // 이미 홈 화면 앱으로 실행 중이면 안내가 필요 없습니다.
  if (standalone) {
    return (
      <div className="w-full py-2.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl text-center border border-emerald-100">
        ✅ 이미 홈 화면 앱으로 실행 중입니다
      </div>
    )
  }

  if (!available) return null

  const handleInstallClick = async () => {
    setBusy(true)
    const outcome = await triggerInstall()
    setBusy(false)
    if (outcome === 'unavailable') {
      alert('지금은 설치를 시작할 수 없습니다. 아래 안내를 참고해 직접 추가해 주세요.')
    }
  }

  return (
    <button
      onClick={handleInstallClick}
      disabled={busy}
      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
    >
      {busy ? '설치 창을 여는 중...' : '📲 지금 바로 앱 설치하기'}
    </button>
  )
}
