// ── 교회 공식 계정 / 명의 관련 상수 및 헬퍼 ──
//
// DB의 posts.author_id 컬럼은 UUID 타입이므로 실제 작성자(관리자)의 currentUser.id가 저장되어야
// 외래키 및 RLS 정책을 정상 통과합니다.
//
// 관리자가 "더브릿지 교회 이름으로 올리기"를 선택하면:
// - authorId: currentUser.id (실제 관리자 UUID)
// - authorName: CHURCH_AUTHOR_NAME ('더브릿지 교회')
//
// UI(아바타, 카드, 목록)에서는 isChurchAuthor()로 감지하여 교회 로고와 이름을 일관되게 표시합니다.

export const CHURCH_AUTHOR_ID = 'CHURCH'
export const CHURCH_AUTHOR_NAME = '더브릿지 교회'
export const CHURCH_AVATAR_URL = '/logo-square.png'

/** 글이나 댓글의 작성자가 교회 공식 명의인지 확인 */
export function isChurchAuthor(authorId?: string | null, authorName?: string | null): boolean {
  if (authorId === CHURCH_AUTHOR_ID) return true
  const name = (authorName || '').trim()
  return name === CHURCH_AUTHOR_NAME || name === '더브릿지교회' || name === '더브릿지 교회'
}
