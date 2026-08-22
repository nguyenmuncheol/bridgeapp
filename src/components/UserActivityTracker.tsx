'use client'

import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { trackUserActivity } from '../lib/activityTracker'

/**
 * 앱 최상위(RootLayout)에 상주하며 성도의 접속을 실시간/백그라운드로 자동 감지하여 기록합니다.
 */
export default function UserActivityTracker() {
  useEffect(() => {
    // 1. 현재 세션 확인 및 즉시 기록
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        trackUserActivity(session.user.id)
      }
    })

    // 2. 로그인 상태 변경 시 기록
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id) {
        trackUserActivity(session.user.id)
      }
    })

    // 3. 브라우저 탭으로 복귀할 때(visibility change) 기록
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) {
            trackUserActivity(session.user.id)
          }
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}
