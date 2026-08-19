/**
 * 한글 초성 검색 헬퍼.
 *
 * 🐛 과거 문제: 주소록 검색이 `name.includes(검색어)` 뿐이라, 어르신이 "ㄱ"을 입력해
 * 김/강/고 성도를 찾으려 하면 결과가 하나도 안 나왔습니다.
 * 또 한글 키보드는 "김"을 입력하는 도중 "ㄱ", "기" 같은 중간 글자를 거치기 때문에
 * 타이핑 중 목록이 순간적으로 비어 보이는 문제도 있었습니다.
 *
 * → 검색어가 초성(ㄱ~ㅎ)으로만 이루어져 있으면 이름의 초성과 비교합니다.
 */

// 한글 음절의 초성 19자 (유니카드 조합 순서)
const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
]

const HANGUL_START = 0xac00 // '가'
const HANGUL_END = 0xd7a3   // '힣'

/** 검색어가 초성만으로 이루어져 있는지 (예: "ㄱ", "ㄱㅁ") */
function isChosungOnly(query: string): boolean {
  if (!query) return false
  return [...query].every(ch => CHOSUNG.includes(ch))
}

/** 문자열을 초성 문자열로 변환 ("김목사" → "ㄱㅁㅅ"). 한글이 아닌 글자는 그대로 둡니다. */
export function toChosung(text: string): string {
  return [...text].map(ch => {
    const code = ch.charCodeAt(0)
    if (code >= HANGUL_START && code <= HANGUL_END) {
      return CHOSUNG[Math.floor((code - HANGUL_START) / 588)]
    }
    return ch
  }).join('')
}

/**
 * 이름이 검색어에 해당하는지 판정.
 * - 검색어가 초성만이면 이름의 초성과 비교 ("ㄱㅁ" → "김목사" 매칭)
 * - 그 외에는 기존처럼 부분 일치 (대소문자 무시)
 */
export function matchesKoreanSearch(name: string, query: string): boolean {
  const target = (name || '').trim()
  const q = (query || '').trim()
  if (!q) return true
  if (!target) return false

  if (isChosungOnly(q)) {
    return toChosung(target).includes(q)
  }
  return target.toLowerCase().includes(q.toLowerCase())
}
