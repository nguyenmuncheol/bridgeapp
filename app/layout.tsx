import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "../src/components/PwaRegister";
import UserActivityTracker from "../src/components/UserActivityTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 검색/AI 크롤러에게 노출되는 유일한 공개 화면(비로그인 방문자용 랜딩+홈탭)의 메타데이터입니다.
// 제목·설명은 실제 검색 의도(하노이 거주 한인이 "하노이 한인교회"를 찾는 상황)에 맞춰
// 지역명·예배시간과, 아기·어린이가 있는 가정/신혼부부/청년(20~40대)을 우선하되
// 중장년층도 포함한 모든 세대를 환영한다는 점을 함께 담습니다.
const SITE_URL = "https://hanoibridge.vercel.app";
const SITE_TITLE = "더브릿지교회 | 베트남 하노이 한인교회 (미딩)";
const SITE_DESCRIPTION =
  "베트남 하노이 미딩(Mỹ Đình)에서 매주 일요일 오전 11시 예배하는 한인교회, 더브릿지교회입니다. 아기·어린이가 있는 가정, 신혼부부, 20~40대 청년은 물론 중장년층까지 모든 또래를 환영합니다. 유아·유치부, 중고등부 예배도 함께 진행됩니다.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  // 카톡·문자로 주소를 공유했을 때 뜨는 미리보기 (가로형 로고)
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: "더브릿지교회",
    statusBarStyle: "default",
  },
};

// Church/WebSite/WebPage 구조화 데이터 (JSON-LD).
// 비회원에게는 랜딩페이지·HomeTab만 보이므로, 그 화면에 실제로 나오는 정보
// (이름, 위치, 주일예배 시간, 대상 세대)만 담고 확인되지 않은 geo 좌표·SNS 링크는
// 넣지 않습니다 — 카페(제3자 업체)의 지도 좌표를 교회 좌표로 잘못 표기하지 않기 위함입니다.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Church",
      "@id": `${SITE_URL}/#organization`,
      name: "더브릿지교회",
      alternateName: "The Bridge Church",
      url: SITE_URL,
      logo: `${SITE_URL}/logo-wide.png`,
      image: `${SITE_URL}/og-image.png`,
      description: SITE_DESCRIPTION,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Mỹ Đình Golden Palace (지하1층 달팽이카페, K-Mart 안쪽)",
        addressLocality: "Nam Từ Liêm",
        addressRegion: "Hà Nội",
        addressCountry: "VN",
      },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "https://schema.org/Sunday",
          opens: "11:00",
          description: "열린 주일 예배 · 유아·유치부 · 중고등부 (Sunday Worship)",
        },
      ],
      inLanguage: "ko",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_TITLE,
      inLanguage: "ko",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      inLanguage: "ko",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      primaryImageOfPage: `${SITE_URL}/og-image.png`,
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale/userScalable 제거:
  // 어르신이 많은 교회인데 화면 확대(핀치줌)를 막아두면, 작은 글씨를 키울 방법이
  // 아예 없어집니다. 안드로이드는 이 설정을 실제로 따르기 때문에 확대가 불가능했습니다.
  viewportFit: "cover",
  themeColor: "#335f87",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-gray-100 text-gray-900 break-keep selection:bg-[#335f87] selection:text-white">
        <PwaRegister />
        <UserActivityTracker />
        {children}
      </body>
    </html>
  );
}
