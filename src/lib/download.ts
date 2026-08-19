/**
 * 사진을 실제로 기기에 저장하기 위한 헬퍼.
 *
 * 🐛 과거 버그: "장별 저장 / 전체 저장"을 눌러도 사진이 저장되지 않고
 * 새 탭에 열리기만 했습니다. 원인은 두 가지였습니다.
 *
 *  ① `<a download>` 는 **같은 도메인의 파일에만** 동작합니다(브라우저 보안 규칙).
 *     우리 사진은 Supabase 서버에 있어 다른 도메인이라 `download` 지시가 통째로 무시됐습니다.
 *  ② 전체 저장은 0.3초 간격으로 새 탭을 여러 개 열려고 해서, 브라우저가 팝업으로 보고
 *     두 번째부터 막았습니다. 그래서 "다 보이지도 않고 저장도 안 되는" 상태가 됐습니다.
 *
 * → 해결:
 *  ① Supabase 공개 URL 뒤에 `?download=파일명` 을 붙이면 서버가 "이건 저장하세요"라는
 *    신호(Content-Disposition)를 함께 보내줍니다. 이건 브라우저가 반드시 따릅니다.
 *  ② 휴대폰에서는 다운로드 폴더보다 **사진 앱에 저장**하는 게 자연스러우므로,
 *    가능하면 공유 시트(navigator.share)를 먼저 시도합니다.
 *
 * 파일명은 한글 대신 영문/숫자를 씁니다. 한글 파일명은 일부 기기에서 깨집니다.
 */

/** 공개 URL에 저장 신호를 붙입니다. 이미 다른 물음표가 있어도 안전하게 처리합니다. */
export function toDownloadUrl(url: string, fileName: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    if (fileName) u.searchParams.set('download', fileName)
    else u.searchParams.set('download', '')
    return u.toString()
  } catch {
    // 주소 형식이 아니면 원본을 그대로 씁니다.
    return url
  }
}

/**
 * 사진 한 장을 기기에 **저장**합니다.
 *
 * 🐛 1차 수정 때의 문제: 휴대폰에서 "공유 시트"를 먼저 띄웠더니, 저장하려는 분에게
 * 카톡·메일 공유 창이 떠서 오히려 헷갈렸습니다(안드로이드). 또 전체 저장에서 첫 장만
 * 공유 창이 뜨고 나머지는 창이 닫히는 사이에 묻혀 실제로 저장되지 않았습니다.
 * → 공유 시트를 쓰지 않고 **항상 다운로드**합니다.
 *
 * 방법: 사진을 먼저 받아서(fetch) 브라우저 안의 임시 파일로 바꾼 뒤 저장합니다.
 * 이렇게 하면 "다른 도메인 파일에는 download 지시가 안 통한다"는 제약을 피할 수 있습니다.
 * 받아오기 자체가 막히면 Supabase의 `?download=` 신호로 대신 저장합니다.
 *
 * 성공하면 true, 저장이 시작되지 못했으면 false를 돌려줍니다.
 */
export async function saveImage(url: string, fileName: string): Promise<boolean> {
  if (!url) return false

  const clickDownload = (href: string, revoke = false) => {
    const a = document.createElement('a')
    a.href = href
    a.download = fileName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (revoke) setTimeout(() => URL.revokeObjectURL(href), 20_000)
  }

  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      clickDownload(URL.createObjectURL(blob), true)
      return true
    }
  } catch {
    // 네트워크/CORS 문제 → 아래 대체 경로
  }

  // 대체 경로: 서버가 "저장하세요" 신호를 붙여 보내도록 요청합니다.
  try {
    clickDownload(toDownloadUrl(url, fileName))
    return true
  } catch {
    return false
  }
}
