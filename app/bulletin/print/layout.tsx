import type { Metadata } from 'next'

// /bulletin/print 는 로그인 후 클라이언트에서만 권한을 확인하는 관리자 전용 화면입니다.
// 서버가 내려주는 최초 HTML에는 인증 정보가 없으므로, 검색엔진이 이 페이지를
// 색인하지 않도록 명시적으로 noindex를 지정합니다. (/analytics 와 같은 방식)
export const metadata: Metadata = {
  title: '주보 인쇄',
  robots: { index: false, follow: false },
}

export default function BulletinPrintLayout({ children }: { children: React.ReactNode }) {
  return children
}
