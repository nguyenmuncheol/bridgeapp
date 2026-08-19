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

/** 이 기기가 "파일 공유(사진에 저장)"를 지원하는지 */
function canShareFiles(files: File[]): boolean {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null
  return !!(nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files }))
}

/**
 * 사진 한 장을 기기에 저장합니다.
 * 1순위: 휴대폰 공유 시트("사진에 저장" / "카톡으로 보내기")
 * 2순위: 브라우저 다운로드 (Supabase 저장 신호 사용)
 * 어떤 경로든 실패하면 조용히 2순위로 넘어가므로, 화면이 멈추지 않습니다.
 */
export async function saveImage(url: string, fileName: string): Promise<void> {
  if (!url) return

  // ── 1순위: 공유 시트 ──
  try {
    const res = await fetch(url)
    if (res.ok) {
      const blob = await res.blob()
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
      if (canShareFiles([file])) {
        try {
          await (navigator as any).share({ files: [file] })
          return
        } catch (err: any) {
          // 사용자가 공유 창을 그냥 닫은 경우입니다. 다시 다운로드를 시도하면
          // 원하지도 않은 파일이 저장되므로 여기서 끝냅니다.
          if (err?.name === 'AbortError') return
        }
      }

      // ── 공유가 안 되면 받아온 파일을 그대로 저장 (같은 도메인 취급이라 download가 동작합니다) ──
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      // 저장이 시작될 시간을 준 뒤 정리합니다.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
      return
    }
  } catch {
    // 네트워크 오류나 CORS 문제 → 아래 2순위로 넘어갑니다.
  }

  // ── 2순위: Supabase 저장 신호 ──
  const a = document.createElement('a')
  a.href = toDownloadUrl(url, fileName)
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
