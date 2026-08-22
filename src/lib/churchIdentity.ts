// ── 교회 공식 계정 상수 (DB에 실제 계정 없음 — UI 표시 전용) ──
//
// 관리자가 "교회 이름으로 올리기"를 선택하면 authorId/authorName/authorAvatar에
// 아래 값이 설정됩니다. allUsers에서 이 ID를 찾으려 할 때 없어도 Avatar 컴포넌트가
// 교회 로고를 직접 렌더링하므로 문제없습니다.
//
// 수정/삭제 권한: authorId === CHURCH_AUTHOR_ID 일 때는 isAdmin 조건으로만 체크합니다.
// (이미 모든 게시판에 `post.authorId === currentUser.id || isAdmin` 형태로 되어 있어
//  별도 추가 작업 없이 관리자가 수정/삭제 가능합니다.)

export const CHURCH_AUTHOR_ID = 'CHURCH'
export const CHURCH_AUTHOR_NAME = '더브릿지 교회'
export const CHURCH_AVATAR_URL = '/logo-square.png'
