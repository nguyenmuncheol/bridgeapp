'use client'

import { useEffect } from 'react'
import { startListeningForInstallPrompt } from '../lib/pwaInstall'

// 앱 최상위(app/layout.tsx)에 항상 붙어 있는 컴포넌트입니다.
// 두 가지 일을 합니다.
//  1) public/sw.js 등록 — 안드로이드에서 "홈 화면에 앱 추가" 버튼이 뜨려면 필요합니다.
//     개발 모드(next dev)에서는 등록하지 않습니다.
//  2) 브라우저의 설치 신호(beforeinstallprompt)를 **앱 시작 시점에** 가로채 보관합니다.
//     설치 버튼은 내정보 탭 안쪽에 있어서 나중에야 화면에 나타나는데, 신호는 앱을 켜고
//     1~2초 뒤 딱 한 번만 오기 때문에, 버튼이 직접 기다리면 영영 못 받습니다.
export default function PwaRegister() {
  useEffect(() => {
    // 설치 신호 수신은 개발/배포 모드와 무관하게 항상 켜 둡니다.
    const stopListening = startListeningForInstallPrompt()

    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 서비스워커 등록 실패는 앱 사용 자체를 막지 않으므로 조용히 무시
      })
    }

    return stopListening
  }, [])

  return null
}
