// 유튜브 비디오 ID 추출 헬퍼 함수
// 찬양/묵상나눔 게시판(PraiseBoard)의 목록/상세 모달에서 공용으로 사용합니다.
//
// 🐛 과거 버그: `youtube.com/live/...` 형식을 인식하지 못했습니다.
// 교회 예배 실시간 스트리밍을 유튜브 앱에서 "공유"하면 바로 이 형식이 나오는데,
// 붙여넣으면 영상이 안 뜨고 검은 상자만 표시됐습니다.
// (watch?v=, youtu.be/, shorts/, m.youtube.com, 추가 파라미터가 붙은 주소는 원래도 정상이었습니다)
export function getYouTubeVideoId(url?: string): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // 유튜브 영상 ID는 항상 11글자(영문/숫자/-/_)입니다.
  const regExp = /(?:youtu\.be\/|\/v\/|\/u\/\w\/|\/embed\/|\/live\/|\/shorts\/|[?&]v=)([A-Za-z0-9_-]{11})/
  const match = trimmed.match(regExp)
  if (match) return match[1]

  // 주소 없이 영상 ID만 붙여넣은 경우도 허용
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed

  return null
}
