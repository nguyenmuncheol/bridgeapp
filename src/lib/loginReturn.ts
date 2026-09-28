'use client'

/**
 * 아이폰 홈 화면 앱에서 로그인하고 돌아왔을 때를 돕습니다. (리뷰 B-6)
 *
 * 🐛 아이폰의 홈 화면 앱은 사파리와 저장공간(쿠키)이 따로입니다. 그래서 이런 일이 생깁니다.
 *  ① 카카오 로그인 도중 카카오톡 앱으로 넘어갔다가 **사파리**로 돌아오면, 로그인이 사파리에서
 *     끝나 버리고 홈 화면 앱은 여전히 로그아웃 상태입니다. 성도는 "로그인했는데 왜 안 되지?" 합니다.
 *  ② 로그인 창(앱 안에 뜨는 사파리 창)에서 로그인을 마치고 [완료]를 눌러 돌아와도,
 *     앱 화면이 그대로라 로그인이 안 된 것처럼 보일 수 있습니다.
 *
 * → 로그인 버튼을 누를 때 "로그인 시작" 시각을 적어 둡니다. 앱으로 돌아왔을 때(화면이 다시 보일 때)
 *   아직 로그아웃 상태라면
 *   · 저장공간에 로그인 정보가 이미 들어와 있으면(②) 앱을 새로 읽어 바로 로그인 상태로 만들고,
 *   · 없으면(①) 홈 화면 앱일 때만 "여기서 다시 로그인해 주세요" 안내를 띄웁니다.
 */
const KEY = 'bridge:loginStartedAt'
const WINDOW_MS = 10 * 60 * 1000

export function markLoginStarted() {
  try { localStorage.setItem(KEY, String(Date.now())) } catch { /* 저장 못 해도 로그인은 계속 */ }
}

export function clearLoginStarted() {
  try { localStorage.removeItem(KEY) } catch { /* 무시 */ }
}

export function loginStartedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(KEY) || 0)
    return at > 0 && Date.now() - at < WINDOW_MS
  } catch {
    return false
  }
}

/**
 * 로그인 교환 실패 메시지를 성도가 이해할 수 있는 말로 바꿉니다.
 * 로그인을 시작한 곳(홈 화면 앱)과 끝난 곳(사파리)이 달라 "확인 코드"를 못 찾을 때 나는 오류입니다.
 */
export function explainAuthError(raw: string): string {
  if (/verifier|code challenge|flow state|pkce/i.test(raw)) {
    return '로그인을 시작한 곳과 끝난 곳이 달라 연결하지 못했습니다. ' +
      '(아이폰 홈 화면 앱에서 로그인하다 카카오톡·사파리로 넘어간 경우 자주 생깁니다) ' +
      '앱으로 돌아가 로그인 버튼을 한 번 더 눌러 주세요.'
  }
  return raw
}
