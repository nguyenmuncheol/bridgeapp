'use client'

import { supabase } from './supabase'
import { isRunningStandalone } from './pwaInstall'

export interface UserDeviceInfo {
  isPwa: boolean
  platform: string  // 'iOS', 'Android', 'Windows', 'Mac', 'Linux', 'Other'
  browser: string   // 'Safari', 'Chrome', 'Samsung Internet', 'KakaoTalk', 'Edge', 'Firefox', 'Other'
}

/** 클라이언트 기기 환경 및 브라우저 감지 */
export function detectDeviceInfo(): UserDeviceInfo {
  if (typeof window === 'undefined') {
    return { isPwa: false, platform: 'Unknown', browser: 'Unknown' }
  }

  const isPwa = isRunningStandalone()
  const ua = window.navigator.userAgent || ''
  
  // 1. 플랫폼(OS) 판별
  let platform = 'Other'
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    platform = 'iOS'
  } else if (/Android/.test(ua)) {
    platform = 'Android'
  } else if (/Windows/.test(ua)) {
    platform = 'Windows'
  } else if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(ua)) {
    platform = 'Mac'
  } else if (/Linux/.test(ua)) {
    platform = 'Linux'
  }

  // 2. 브라우저 판별
  let browser = 'Other'
  if (/KAKAOTALK/i.test(ua)) {
    browser = 'KakaoTalk'
  } else if (/NAVER/i.test(ua)) {
    browser = 'Naver'
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet'
  } else if (/Edg/i.test(ua)) {
    browser = 'Edge'
  } else if (/Chrome|CriOS/i.test(ua)) {
    browser = 'Chrome'
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    browser = 'Safari'
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'Firefox'
  }

  return { isPwa, platform, browser }
}

/**
 * 성도의 접속 일시, PWA 설치 여부, 기기 환경을 자동 기록합니다.
 * DB 부하를 방지하기 위해 15분 단위로 Throttling(중복 방지)합니다.
 */
export async function trackUserActivity(userId?: string | null) {
  if (!userId || typeof window === 'undefined') return

  const sessionKey = `bridge_last_tracked_${userId}`
  const lastTracked = sessionStorage.getItem(sessionKey)
  const now = Date.now()

  // 15분 내 이미 기록했으면 스킵
  if (lastTracked && now - Number(lastTracked) < 15 * 60 * 1000) {
    return
  }

  const info = detectDeviceInfo()
  const nowIso = new Date().toISOString()
  const nowHour = new Date().getHours()
  const nowDay = new Date().getDay()

  try {
    sessionStorage.setItem(sessionKey, String(now))
    
    // 1. profiles 테이블 업데이트
    await supabase.from('profiles').update({
      last_active_at: nowIso,
      is_pwa: info.isPwa,
      device_platform: info.platform,
      browser_name: info.browser,
    }).eq('id', userId)

    // 2. 시간대별 통계 로그 테이블 (테이블 존재 시 삽입)
    try {
      await supabase.from('user_access_logs').insert({
        user_id: userId,
        hour_of_day: nowHour,
        day_of_week: nowDay,
        is_pwa: info.isPwa,
        device_platform: info.platform,
      })
    } catch {
      // 무시
    }
  } catch {
    // 무시 (오프라인이거나 컬럼 미존재 시에도 사용자 경험 영향 없음)
  }
}
