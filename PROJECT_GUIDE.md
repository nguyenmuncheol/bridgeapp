# ⛪ 더브릿지 교회 웹앱 — 프로젝트 현황 및 토큰 절약 가이드

이 문서는 **더브릿지 교회 웹앱**의 현재 코드 구조, 구현된 핵심 기능, 향후 유지보수 및 추가 수정 작업 시 **토큰 소모를 극적으로 절약하기 위한 작업 방침**을 정리한 가이드 문서입니다.

---

## 🏗️ 1. 프로젝트 핵심 구조 및 시스템 아키텍처

- **프레임워크**: Next.js 16.3.0 (Turbopack, App Router), React 19, TypeScript, TailwindCSS
- **메인 진입점**: [`app/page.tsx`](file:///c:/Users/Guest_VNP/Desktop/The%20Bridge/webapp/my-church-app/app/page.tsx) (전체 탭 전환 및 상단 계정 시뮬레이터 / 브랜드 헤더)
- **공통 헬퍼 / 데이터**:
  - [`src/lib/mockData.ts`](file:///c:/Users/Guest_VNP/Desktop/The%20Bridge/webapp/my-church-app/src/lib/mockData.ts): `UserProfile`, `getUserDisplayName` (이름 + 직분 + 님 호칭 통일), `INITIAL_BULLETIN`, `INITIAL_USERS` 등 더미 데이터
  - [`src/lib/dateUtils.ts`](file:///c:/Users/Guest_VNP/Desktop/The%20Bridge/webapp/my-church-app/src/lib/dateUtils.ts): `getUpcomingSundays` (월요일 기준 주일 날짜 동적 계산), `isMealRegistrationLocked` (토요일 14시 식수 마감 계산)

---

## 📱 2. 탭별 구현 핵심 기능 요약

### 🏠 1) HomeTab (`src/components/home/HomeTab.tsx`)
- **교회 소개 분기**: 로그인 성도 / 비로그인 방문자 분기 UI 및 교회 안내 모달
- **이번 주 주보**:
  - 관리자 주보 날짜 선택 (향후 1~2주 일요일 선택 픽커)
  - 실물 주보 이미지 2~4장 직접 파일 업로드 (`input[type=file][multiple]`)
  - 주보 전체보기 시 다중 면 슬라이드 탭(1면, 2면) 제공
- **공지사항**: 세로 스크롤 UI, 관리자 공지 작성 및 🗑️ 삭제 기능
- **헌금 계좌**: 헌금 계좌 번호 숫자만 클립보드 복사 (`110123456789`) 및 1초 소멸 토스트

### 📅 2) NewsTab (`src/components/news/NewsTab.tsx`)
- **출석체크 버튼 강조**: 미완료 시 `🚨 8월9일(일) 출석체크` (rose 파동 애니메이션), 완료 시 `✅ 출석체크 완료` (emerald)
- **출석체크 UI**: 전원 출석 단축 버튼, 결석 사유 선택사항(optional), 결석 태그 5종 (`[출근/출장, 여행, 아파요, 개인사정, 가족방문]`)
- **교회 일정 달력**:
  - 관리자/리더: 달력 날짜 클릭 시 해당 날짜 일정 추가/삭제 편집 모달
  - **생일 자동 연동 🎂**: 성도 생일(MM-DD) 매칭하여 달력 표시 및 이달의 생일자 명단 노출
- **주소록**: 이름 통합 검색 (검색어 입력 시 전체 성도 대상 통합 검색) + 내 라브리 / 전체 성도 필터

### 📋 3) RequestTab (`src/components/request/RequestTab.tsx`)
- **주일 식사 신청**: 향후 4주 동적 주차 선택, 성인/어린이 인원 설정, 직전 토요일 14시 자동 마감
- **교회 행사 신청**:
  - 관리자 행사 관리: `[행사 이름 | 내용(상세안내) | 구글 폼 URL]` 3개 필드 관리
  - 구글 폼 URL 등록 시 구글 폼 이동 버튼, 미등록 시 "담당자에게 직접 신청" amber 강조 안내 표시

### 📸 4) SharingTab (`src/components/sharing/SharingTab.tsx`)
- **기도제목**: 비밀글(목회자/리더 전용), 상단 고정(Pin), 아멘(좋아요), 응답 완료 처리, 댓글 작성
- **행사사진**:
  - 그리드 카드에서 즉시 ❤️ 좋아요 클릭 (`e.stopPropagation()`)
  - 사진 클릭 시 상세 모달: 장별 다운로드 및 전체 사진 묶음 다운로드 지원
  - 업로드 문구: `"사진 업로드하기"`
- **찬양/묵상나눔**:
  - 전체보기 텍스트 제거 ➔ 카드 전체 클릭 시 상세 모달 오픈 및 유튜브 영상 재생
  - 작성자/관리자 전용 **`[✏️ 수정]`** 버튼 지원

### 👤 5) MyPageTab (`src/components/mypage/MyPageTab.tsx`)
- **프로필**: 프로필 사진 업로드 변경, 연락처/주소 수정
- **관리자 전용 대시보드 진입로**: `ADMIN` 권한 성도에게 **"🛠️ 관리자 대시보드"** 진입 카드를 항상 제공
- **식사 쿠폰 현황**: 잔여 쿠폰 수 노출
- **PWA 안내**: 아이폰(Safari) / 안드로이드(Chrome) 홈화면 앱 추가 아코디언 가이드

### 🛠️ 6) AdminDashboard (`src/components/admin/AdminDashboard.tsx`)
- **식사 집계**: 향후 4주 식수예상 기본 노출, 식수 내용 복사 (1초 소멸 토스트)
- **가입 승인**: 승인 대기 신규가입 성도 라브리/권한/직분/가족연결 지정 후 승인
- **쿠폰 관리**: 가구별 식사 쿠폰 발급/차감 (`+` / `-`)
- **출석 탭 (📊 출석)**:
  - 월 선택 및 날짜 선택 드롭다운으로 과거 기록 조회 및 상세 반영
  - 라브리별 출석률 통계 + **[전체 합계]** 행 제공
  - 해당 월 전체 출석 명단 CSV 다운로드

---

## ⚡ 3. 토큰 절약을 위한 5가지 실전 가이드라인

수정 작업을 계속 진행할 때 클로드/제미나이 쿼터 소모를 90% 이상 절약하기 위한 작업 규칙입니다.

1. **지정 범위 수정 (Precise Scope)**:
   - 요청 시 수정할 파일명과 원하는 수정사항만 명확히 지정 (예: *"RequestTab.tsx에서 식사 신청 마감 시간 텍스트 색상만 변경해줘"*)
2. **부분 코드 수정 (Replace Tool) 사용**:
   - 파일 전체를 쓰지 않고 변경될 10~20줄의 영역만 수정(`replace_file_content`)하여 코드 전송 토큰을 최소화함
3. **작업 분할 요청 (Chunking)**:
   - 복잡한 여러 요청은 2~3개 기능 단위로 나눠서 단계별로 진행
4. **새 세션 활용**:
   - 대화가 너무 길어지면 새 대화창을 열고 이 문서([`PROJECT_GUIDE.md`](file:///c:/Users/Guest_VNP/Desktop/The%20Bridge/webapp/my-church-app/PROJECT_GUIDE.md))를 참고하도록 전달
5. **AI 응답 최소화**:
   - 수정 결과를 장황하게 설명하지 않고, 완료 내역 1~2줄과 빌드 검증 결과만 출력

---

## 🔍 4. 작업 검증 명령어

수정 후에는 항상 아래 명령어로 빌드 및 타입 안정성을 검증합니다:

```bash
npm run build
```
