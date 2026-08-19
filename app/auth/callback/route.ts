import { NextResponse } from 'next/server'
import { createClient } from '../../../src/lib/supabase/server'

/**
 * 구글/카카오 로그인 후 되돌아오는 지점.
 *
 * 🐛 과거 버그 2가지
 * 1) 로그인 교환에 실패해도 **아무 메시지 없이** 홈으로 돌려보냈습니다. 성도 입장에서는
 *    화면이 한 번 깜빡이고 다시 로그인 화면인데 이유를 알 수 없어, "앱이 고장났나?" 하며
 *    몇 번 더 누르다 포기하게 됩니다. (특히 아이폰에서 홈 화면에 설치한 앱으로 로그인하면
 *    저장공간이 분리돼 실패할 수 있는데, 그때도 조용히 실패했습니다.)
 *    → 실패 사유를 쿼리로 넘겨 화면에서 안내하도록 합니다.
 *
 * 2) `x-forwarded-host` 헤더를 그대로 믿고 그 주소로 되돌려보냈습니다. 이 헤더는
 *    요청자가 마음대로 넣을 수 있어서, 앞단 프록시가 덮어쓰지 않는 환경이라면
 *    성도를 가짜 사이트로 보내는 데 쓰일 수 있습니다.
 *    → 우리 도메인 목록에 있는 경우에만 사용합니다.
 */

/** 되돌아갈 수 있는 우리 도메인 (NEXT_PUBLIC_SITE_URL 환경변수로 추가 지정 가능) */
function resolveRedirectBase(request: Request, origin: string): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (!forwardedHost) return origin

  const allowed = new Set<string>()
  try {
    allowed.add(new URL(origin).host)
  } catch { /* origin 파싱 실패 시 무시 */ }

  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    try {
      allowed.add(new URL(configured).host)
    } catch { /* 잘못된 환경변수는 무시 */ }
  }

  return allowed.has(forwardedHost) ? `https://${forwardedHost}` : origin
}

/** 열린 리다이렉트 방지: 우리 사이트 내부 경로만 허용 */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  // OAuth 제공자가 직접 거절한 경우 (사용자가 동의를 취소한 경우 등)
  const providerError = searchParams.get('error_description') || searchParams.get('error')
  if (providerError) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(providerError)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent('로그인 정보가 전달되지 않았습니다.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error.message)}`)
  }

  const isLocalEnv = process.env.NODE_ENV === 'development'
  const base = isLocalEnv ? origin : resolveRedirectBase(request, origin)
  return NextResponse.redirect(`${base}${next}`)
}
