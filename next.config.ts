import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // 서비스워커는 절대 캐시되면 안 됩니다.
        // 브라우저가 옛 sw.js를 최대 하루까지 붙들고 있을 수 있는데, 그러면
        // 서비스워커에 문제가 생겼을 때 고친 버전조차 전달되지 않습니다
        // (= 비상 정지 스위치가 안 먹습니다).
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // 기본 보안 헤더
        source: "/:path*",
        headers: [
          // 다른 사이트가 우리 앱을 몰래 감싸서(iframe) 성도의 클릭을 가로채는 것을 방지
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // 파일 종류를 브라우저가 멋대로 추측하지 않도록
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 외부 사이트로 이동할 때 우리 주소의 상세 경로가 새어나가지 않도록
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
