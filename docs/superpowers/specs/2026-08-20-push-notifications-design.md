# 푸시 알림 도입 — 기술 설계

작성일 2026-08-20 · 관련 문서: [`Push plan.md`](../../../Push%20plan.md) (기능/정책 기획, 이 문서보다 상위 문서)

## 0. 범위

`Push plan.md`의 5단계 계획 중 **0~3단계(개발)** 만 다룬다. 4~5단계(시험 운영, 전체 공개)는 개발 완료 후 별도로 진행.

- **1차로 푸시를 내보내는 알림 종류: 관리자 직접알림만.**
  자동 알림 9종(식사·주보·생일·출석 등)은 이번 구현 대상이 아니다. 단, 나중에 쉽게 추가할 수 있도록 발송 트리거를 확장 가능한 형태로 만든다 (§3).
- Edge Function과 SQL은 **레포 안에 파일로 버전관리**한다 (`supabase/` 디렉토리 신설, Supabase CLI 사용).
- **조용한 시간대 (베트남 시각 밤 10시~오전 8시)에는 휴대폰이 울리지 않는다.** 이 시간에 발송할 알림이 생기면 곧바로 보내지 않고 쌓아뒀다가, 오전 8시가 지나면 그때 한꺼번에 보낸다 (§2, §9).
  단, **관리자 시험 운영(4단계) 기간에는 끔** — 켜고 끄는 스위치(시크릿 값 하나)로 만들어서, 기본값은 꺼짐(바로 발송)이고 전체 공개(5단계) 직전에 한 줄 명령으로 켠다.

## 1. 현재 상태 (조사 결과)

- 앱 안 알림함은 완성되어 있고 (`notifications` 테이블), 생성은 전부 서버 쪽(Postgres 함수/트리거)에서 일어난다 — 앱은 읽기/읽음처리/삭제만 한다 ([`src/lib/db.ts:766`](../../../src/lib/db.ts)).
- 관리자 직접알림은 `dbSendManualNotification()` → RPC `send_manual_notification` 을 호출해서 생성된다 ([`src/lib/db.ts:833`](../../../src/lib/db.ts), UI: [`NotificationJobsTab.tsx`](../../../src/components/admin/NotificationJobsTab.tsx)).
- `send_manual_notification` 등 서버 함수의 SQL 정의는 이 레포에 없다 (Supabase 대시보드에서 직접 관리 중) — 이번에 처음으로 `supabase/` 디렉토리를 만든다.
- `public/sw.js`는 의도적으로 캐시 기능을 꺼둔 상태이며, `push` / `notificationclick` 핸들러가 아직 없다.
- 푸시 관련 테이블, VAPID 키, Edge Function 모두 아직 없음 (완전히 새로 만드는 기능).
- Supabase CLI는 `npx supabase` 로 로컬에서 바로 실행 가능 (확인됨, v2.115.0).

## 2. 아키텍처

```
[관리자가 알림 작성 → 발송 버튼]
        │
        ▼
  RPC send_manual_notification()  (기존 함수 — 손대지 않음)
        │  INSERT INTO notifications (기존과 동일, type='MANUAL')
        ▼
  DB 트리거 (신규 — notifications에 type='MANUAL' 행이 생기면 자동 발동)
        │  1. INSERT INTO push_jobs (발송할 알림 id만 큐에 적재)
        │  2. 곧바로 Edge Function 호출 시도 (지연 없이 바로 발송)
        ▼
  pg_cron (10초 간격, 안전장치) — 방금 즉시호출이 실패했을 때만 여기서 다시 잡힘
        │  Edge Function 호출: send-push
        ▼
  supabase/functions/send-push/index.ts (Deno)
        1. push_jobs 에서 처리 안 된 항목 조회
        2. 조용한 시간대 스위치가 켜져 있고, 지금이 베트남 시각 22:00~08:00이면
           → 아무것도 보내지 않고 그대로 둠 (08:00 지나면 다음 실행 때 밀린 것까지 한꺼번에 발송됨)
           스위치는 기본 꺼짐(테스트 기간용) — 시크릿 값 하나로 켜고 끔 (§4)
        3. 대상자(user_id)의 push_subscriptions 조회
        4. web-push 로 각 구독에 전송
        5. 실패(410/404) 구독 삭제, 성공/실패 push_jobs 에 기록
        ▼
  각 사용자 브라우저의 public/sw.js
        - 'push' 이벤트 → 알림 표시 (교회 로고)
        - 'notificationclick' 이벤트 → 관련 화면으로 이동
```

**`send_manual_notification` 함수를 직접 고치지 않는 이유**: 이 함수의 SQL 정의가 이 레포에는 없어서(대시보드 관리 상태) 원본을 확인하지 못한 채 수정하면 기존 알림함 기능이 깨질 위험이 있다. 대신 `notifications` 테이블에 **새 행이 생기는 것을 감지하는 트리거**를 붙이는 방식으로, 어떤 함수가 알림을 만들었든 상관없이 안전하게 동작한다.

**큐 테이블(`push_jobs`)을 두는 이유**: 트리거에서 곧바로 Edge Function을 호출하는 방식도 가능하지만, 실패 시 재시도가 어렵다. 대신 "알림이 저장되면 큐에 발송 대상만 남긴다 → Edge Function이 주기적으로 큐를 비운다" 구조로 만들면:
- 자동 알림 9종을 나중에 추가할 때, 트리거의 `WHEN` 조건에 타입만 추가하면 된다 (예: `type IN ('MANUAL', 'MEAL')`).
- Edge Function 실패해도 알림함(`notifications`)은 이미 저장되어 있으므로 영향 없음 (`Push plan.md` §8 "위험과 대비책"의 원칙과 일치).
- 재시도가 단순해진다 (큐에 남아있으면 다음 주기에 다시 시도).

## 3. 데이터 모델 (신규 테이블 2개)

### `push_subscriptions`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → profiles | |
| endpoint | text unique | 브라우저가 발급한 구독 주소 |
| p256dh | text | 구독 공개키 |
| auth | text | 구독 인증 시크릿 |
| device_label | text | "iPhone", "Chrome" 등 (표시용, UI에서 직접 지정 안 함 — UA로 추정) |
| created_at | timestamptz | |

RLS: 본인 `user_id` 행만 select/insert/delete 가능. Edge Function은 service role 키로 우회.

### `push_jobs`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| notification_id | uuid fk → notifications | |
| status | text | `pending` / `sent` / `failed` |
| created_at | timestamptz | |
| processed_at | timestamptz | |

`notifications` 테이블에 `AFTER INSERT ... WHEN (NEW.type = 'MANUAL')` 트리거를 붙여 `push_jobs`에 자동으로 한 줄 쌓는다.

## 4. VAPID 키

- `npx web-push generate-vapid-keys` 로 1회 생성 (로컬 실행, 레포에 커밋하지 않음).
- 공개키 → `.env.local`의 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Vercel 환경변수에도 등록 필요 — 사장님 작업).
- 비밀키 → `npx supabase secrets set VAPID_PRIVATE_KEY=...` 로 Edge Function 시크릿에 등록.
- 조용한 시간대 스위치 → `PUSH_QUIET_HOURS_ENABLED` 시크릿. 값을 안 넣거나 `false`면 꺼짐(테스트 기간 기본값), 전체 공개 직전에 `npx supabase secrets set PUSH_QUIET_HOURS_ENABLED=true` 한 번만 실행하면 켜짐.

## 5. 레포 구조 변경

```
supabase/
  migrations/
    20260820000000_push_subscriptions.sql   -- push_subscriptions, push_jobs 테이블 + RLS
    20260820000001_push_trigger.sql         -- notifications 트리거 신설 (기존 함수는 손대지 않음)
    20260820130000_push_trigger_immediate.sql -- 트리거에서 Edge Function 즉시 호출 추가 (지연 개선)
    20260820130100_faster_cron.sql          -- 안전장치 주기 1분 → 10초로 단축
  functions/
    send-push/
      index.ts                              -- 큐 처리 + web-push 전송
  config.toml
```

`npx supabase db push` 로 마이그레이션 적용, `npx supabase functions deploy send-push` 로 배포. pg_cron으로 1분마다 Edge Function 호출하도록 `pg_cron` 확장 + `cron.schedule()` 을 마이그레이션에 포함.

## 6. 서비스워커 변경 (`public/sw.js`)

기존 `install`/`activate`/`fetch` 핸들러는 그대로 두고 아래 2개만 추가한다 (기존 "캐시 기능은 계속 꺼둔 채" 원칙 유지):

- `push` 이벤트: payload(JSON: title, body, url) 파싱 → `self.registration.showNotification()` 으로 교회 로고와 함께 표시.
- `notificationclick` 이벤트: `event.notification.data.url` 로 기존 열린 탭이 있으면 focus, 없으면 새로 열기.

## 7. 클라이언트 변경

- `src/lib/push.ts` (신규): `subscribeToPush()`, `unsubscribeFromPush()`, `getPushPermissionState()` — `Notification.permission`, iOS `navigator.standalone` 체크, `pushManager.subscribe()` 래핑.
- `src/lib/db.ts`: `dbSavePushSubscription()`, `dbDeletePushSubscription()` 추가.
- `MyPageTab.tsx`: `📱 휴대폰 알림 받기` 스위치 추가. `Push plan.md` §5 1단계의 상태별 문구(아직 안 켬/켜짐/거부됨/아이폰 홈화면 추가 필요) 그대로 구현.

## 8. 에러 처리

- Edge Function에서 구독 전송 실패 시 HTTP 상태코드로 분기: `410 Gone` / `404` → 죽은 구독으로 판단해 `push_subscriptions`에서 삭제. 그 외 오류는 `push_jobs.status = 'failed'` 로 기록하고 그대로 둔다 (알림함은 이미 정상 저장되어 있으므로 성도님께 영향 없음).
- 클라이언트: 구독 실패(권한 거부, iOS 홈화면 미추가 등)는 전부 상태 문구로만 안내, 에러를 throw하지 않음 — `Push plan.md`가 강조하는 "권한 창은 누를 때만" 원칙과 "거부해도 앱은 정상 동작" 원칙 유지.

## 9. 테스트 계획

- 로컬: `npx supabase db push`로 스테이징에 마이그레이션 적용 후 관리자 계정으로 직접알림 발송 → 본인 브라우저(Chrome, 알림 권한 허용)로 수신 확인.
- 아이폰 실기기 테스트는 홈 화면 추가 필수 — 개발 중에는 안드로이드/PC 크롬으로 우선 검증하고, 아이폰은 배포 후 확인.
- 시험 운영(4단계) 참여자는 개발 완료 후 사용자가 직접 지정하기로 함 (안드로이드·아이폰 섞어서 권장, 아이폰 최소 1명).
- 조용한 시간대 확인: 밤 10시 이후에 관리자 알림을 보내봐서 즉시 울리지 않는지, 다음날 오전 8시가 지난 뒤 자동으로 오는지 확인.

## 10. 배포 — 직접 하셔야 하는 부분

이 코딩 환경에는 Supabase 로그인 권한이 없어서, 코드/파일은 전부 만들어 두지만 실제 서버 반영은 아래 명령어를 사장님 PC(또는 신뢰된 환경)에서 직접 실행해야 한다. 순서대로 실행하면 된다:

✅ 2026-08-20 배포 완료. 순서는 아래와 같았고, 다음에 새 프로젝트에 다시 배포할 일이 있으면 그대로 따라하면 된다.

1. `npx supabase login` (최초 1회, 브라우저 인증)
2. `npx supabase link --project-ref isbwfpokewammwiicxqr`
3. VAPID 키 생성 → 공개키는 `.env.local`과 **Vercel 환경변수**(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`)에 등록
4. Edge Function 시크릿 **두 개 다** 등록 (하나만 하면 함수가 시작하자마자 죽는다 — 실제로 겪은 실수):
   - `npx supabase secrets set VAPID_PRIVATE_KEY=<비밀키>`
   - `npx supabase secrets set VAPID_PUBLIC_KEY=<공개키>`
5. Supabase 대시보드 → SQL editor에서 한 번만 실행 (cron이 함수를 호출할 때 쓸 인증 정보).
   ⚠️ `<...>` 자리에 **진짜 service_role 키 값**을 넣어야 한다 — 예시 문구를 그대로 실행하면 그 문구 자체가 저장되어 인증이 계속 401로 실패한다 (실제로 겪은 실수):
   `select vault.create_secret('<Settings → API → service_role 키>', 'service_role_key');`
6. `npx supabase db push` (테이블·트리거·cron 반영)
7. `npx supabase functions deploy send-push` (Edge Function 배포)

실제 테스트(관리자 알림 발송 → 휴대폰 수신 확인)에서 지연이 크게 느껴지면 §2의 즉시호출이 실패하고 안전장치(cron)만 도는 상황일 수 있다 — `net._http_response` 테이블의 최근 행을 보면 원인을 바로 알 수 있다.

## 11. 확장 이력

- ✅ 2026-08-20: 식사 미응답(MEAL)·새 주보(BULLETIN)·출석 리마인더(ATTENDANCE)를 트리거 WHEN 절에 추가해 푸시 대상에 포함 (`20260820150000_push_expand_auto_types.sql`). 시험 참여는 강제 배정 없이, 관리자 각자 내정보 스위치를 켜는 방식으로 자연스럽게 제한.
- 보류: 생일 축하(BIRTHDAY)·새 공지(NOTICE) — `Push plan.md` §4에서 "선택" 항목. 댓글·좋아요는 계속 제외.
- 관리 화면에서 알림 종류별 on/off 등은 `Push plan.md` §5 "나중에 여유 있을 때" 항목 참고.
