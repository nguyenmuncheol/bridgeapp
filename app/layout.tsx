import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "../src/components/PwaRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "더브릿지교회 | The Bridge Church",
  description: "더브릿지교회 성도들을 위한 모바일 스마트 웹앱",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "더브릿지교회",
    statusBarStyle: "default",
  },
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
      <body className="min-h-full flex flex-col bg-gray-100 text-gray-900 selection:bg-[#335f87] selection:text-white">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
