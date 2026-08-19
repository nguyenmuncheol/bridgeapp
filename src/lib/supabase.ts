'use client'

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// 구글/카카오 OAuth 로그인만 사용 — PKCE code verifier를 쿠키에 저장해
// 서버(app/auth/callback)의 세션 교환 로직과 저장 방식을 일치시킴
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
