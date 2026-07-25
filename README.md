# 점심 추천 웹앱

## 프로젝트 소개

사용자의 현재 위치를 기반으로 주변 음식점 한 곳을 추천하는 웹앱입니다. 구글 Places API로 주변 음식점을 검색하고, 개인 평점, 음식 카테고리 기호, 같은 그룹 구성원들의 평균 평점을 가중치로 사용합니다. 그룹은 초대코드로 지인들과 구성할 수 있습니다.

추천에는 가중 랜덤을 적용합니다. 가중 랜덤은 점수가 높은 음식점일수록 뽑힐 확률이 높아지는 무작위 추출 방식입니다.

배포 주소: <https://lunch-recommander.vercel.app>

## 기술 스택

- 프론트엔드: Next.js의 App Router와 TypeScript를 사용합니다. App Router는 파일과 폴더 구조를 기반으로 화면과 경로를 구성하는 Next.js 라우팅 방식입니다.
  - 서버 상태(API 응답)는 React Query가, 폼 상태는 React Hook Form이 관리합니다.
  - 자체 HTTP 엔드포인트인 Edge Function 호출에는 axios를, 데이터베이스 질의와 인증에는 supabase-js SDK를 사용합니다.
- 백엔드: Supabase를 사용합니다.
  - Auth: 사용자 인증을 처리합니다.
  - Postgres와 RLS: 데이터를 저장하고 보호합니다. RLS(Row Level Security)는 로그인한 사용자가 접근할 수 있는 행을 데이터베이스에서 제한하는 행 단위 접근 제어입니다.
  - Edge Function: 외부 API 호출과 같은 서버 측 작업을 실행하는 함수입니다. Deno로 작성합니다.
- 외부 서비스:
  - 구글 Places API: 주변 음식점과 평점·가격대·사진 정보를 조회합니다.
  - 구글 Maps JavaScript API: 브라우저에서 지도를 렌더링합니다.
  - Discord 웹훅: 관리자에게 회원가입 승인 알림을 보냅니다.

## 주요 기능

### 추천

- 현재 위치와 검색 반경(100m, 300m, 500m 또는 1km)을 기준으로 주변 음식점 한 곳을 추천합니다.
- 최소 구글 평점(3.5~~5.0)과 리뷰 수(10~~100개)를 선택할 수 있으며, 두 기준을 모두 만족하는 음식점만 추천 후보에 포함합니다. 기본값은 평점 3.5 이상, 리뷰 30개 이상입니다.
- 내 평점과 그룹 구성원들의 평균 평점을 함께 반영하는 하이브리드 평점을 사용합니다.
- 추천 카드에 음식점 이름, 카테고리, 가격대, 거리, 대표 사진을 한국어로 보여줍니다. 카테고리는 저장 키로 쓰는 기계값과 화면 표시용 한글 라벨을 분리해 다룹니다.
- 가격대는 구글 priceLevel 등급을 ₩~₩₩₩₩ 기호로 환산해 보여줍니다. 구글은 실제 메뉴 가격이 아니라 4단계 등급만 제공합니다.
- 대표 사진은 추천된 한 곳에 대해서만 조회합니다. 사진 조회는 별도 과금(GetPhotoMedia)이라 검색 결과 20곳 전부가 아니라 뽑힌 곳만 `place-photo` Edge Function이 해석합니다.
- 메뉴·리뷰·영업시간은 카드의 "메뉴·리뷰 자세히 보기"로 구글 지도 상세 페이지에 연결합니다. `placeId`만 쓰므로 추가 API 비용이 없습니다.
- 별점(1~5)으로 개인 평점을 남기고, "다시 추천 안 함"으로 특정 음식점을 영구 제외합니다. 별점 0점이 곧 영구 제외이므로 별과 분리해 오작동을 막습니다.
- 카테고리 선호도를 별로예요·보통·좋아요 3단계로 받아 추천 가중치에 반영합니다.
- 질린 음식점은 1주 동안 스누즈하여 추천에서 일시 제외하고, 기간이 지나면 자동으로 복귀시킵니다.

### 위치

- 고정밀 측위(`enableHighAccuracy`)로 현재 위치를 잡고, 빗나갈 때는 지도의 핀을 끌거나 지도를 눌러 직접 보정할 수 있습니다.
- 첫 위치 응답을 기다리는 동안에는 서울 기본 지도를 먼저 표시하고, 위치가 확인되면 지도 중심과 핀을 현재 위치로 옮깁니다.
- 위치 요청이 실패하면 경고를 눌러 권한을 다시 요청할 수 있습니다. 브라우저에서 권한을 영구 차단한 경우에는 설정에서 위치 권한을 허용하도록 안내합니다.
- 추천·로그인·저장 등 비동기 작업 중에는 공통 스피너로 진행 상태를 표시합니다.

### 그룹

- 초대코드를 기반으로 그룹을 만들고 지인을 연결합니다.

### 회원가입(관리자 승인제)

- 아무나 가입하지 못하도록 관리자 승인 기반 회원가입을 사용합니다. 방문자가 이메일로 가입을 요청하면 관리자에게 Discord 알림이 가고, 관리자가 승인하면 방문자에게 비밀번호 설정 링크가 전달됩니다.
- 관리자 알림은 이메일이 아니라 Discord 웹훅을 씁니다. Resend 같은 이메일 발송 서비스는 발신 도메인 인증을 요구하는데, 커스텀 도메인 없이 배포하는 환경에서는 인증을 완료할 수 없기 때문입니다.

### 보안·요금 방어

- 서버에서 사용자 ID와 IP를 함께 기준으로 요청 횟수를 제한합니다. 프론트엔드만으로 제한하지 않아 스팸 요청으로 인한 Supabase 및 구글 API 과금을 방어합니다.
- 구글 Places API 호출은 Edge Function을 통해 처리하여 서버용 API 키가 브라우저에 노출되지 않도록 합니다.
- 구글 Places 호출 결과는 15분 동안 캐시하여 동일 위치의 반복 호출을 줄입니다.

## 아키텍처 메모

### 프론트엔드 데이터 레이어

화면 컴포넌트는 데이터 접근 코드를 직접 갖지 않고 레이어를 거칩니다. 의존 방향은 아래 한 방향뿐입니다.

```mermaid
flowchart TD
    components["컴포넌트<br/>(app/, components/)"]
    hooks["훅<br/>(lib/hooks/queries, lib/hooks/mutations)"]
    api["API 함수<br/>(lib/api/)"]
    supabase["supabaseClient<br/>데이터베이스 질의와 인증"]
    axios["axiosInstance<br/>자체 HTTP 엔드포인트(Edge Function)"]

    components -->|"훅만 호출한다"| hooks
    hooks -->|"API 함수만 호출한다"| api
    api --> supabase
    api --> axios
```

식별자(쿠키명·테이블·경로 등)는 `lib/constants.ts`, 사용자 노출 문구는 `lib/messages.ts`로 각각 단일화합니다.

### Edge Function

- `nearby`: 주변 음식점을 조회합니다. 캐시가 없으면 구글 Places를 호출하고 결과를 캐시합니다.
- `place-photo`: 추천된 음식점의 대표 사진 URL을 조회합니다. 서버용 키를 노출하지 않기 위해 이미지 URL 해석을 서버에서 처리합니다.
- `signup-request`: 가입 요청을 접수하고 관리자에게 Discord 알림을 보냅니다.
- `approve-signup`: 관리자가 가입 요청을 승인하거나 거절하고, 승인 시 사용자를 초대합니다.

`signup-request`와 `approve-signup`은 로그인하지 않은 사용자가 호출하므로 게이트웨이의 JWT 검증(`verify_jwt`)을 끕니다. 대신 각자 사용량 제한과 승인 토큰 검사로 요청을 검증합니다. 이 설정은 `supabase/config.toml`에 선언되어 있습니다.

## 배포 상태

- 프론트엔드: Vercel에 배포되어 있으며, `main` 병합 시 자동 배포됩니다. Pull Request에는 프리뷰 배포가 생성됩니다.
- 백엔드: Supabase 클라우드 프로젝트를 사용합니다. 마이그레이션과 Edge Function은 CLI로 수동 배포합니다.
- CI: `main` push와 Pull Request에서 프론트엔드 테스트·타입체크·린트·빌드와 Edge Function 테스트를 실행합니다(`.github/workflows/ci.yml`). `main`은 직접 push를 막고 상태 검사 통과를 필수로 합니다.

## 로컬 실행

### 1. 사전 요구 사항

다음 도구가 설치되어 있어야 합니다.

- Node.js
- Deno
- Supabase CLI
- Docker: 로컬 Supabase를 기동할 때 사용합니다.

### 2. 의존성 설치

```bash
npm install
```

### 3. 로컬 Supabase 기동

```bash
npx supabase start
```

명령 출력에 표시된 API URL과 anon 키를 다음 단계의 환경변수에 사용합니다.

### 4. 환경변수 설정

프로젝트 루트에 `.env.local`을 만들고 `.env.local.example`을 참고하여 다음 값을 채웁니다. 세 값 모두 브라우저에 노출되는 `NEXT_PUBLIC_` 접두사를 사용합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<Supabase API URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
NEXT_PUBLIC_GOOGLE_MAPS_KEY=<Google Maps JavaScript API key>
```

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 브라우저 노출이 허용되는 키이며, 데이터 접근은 RLS 정책으로 보호합니다.
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`는 지도 렌더링용 키입니다. 허용된 도메인에서만 사용할 수 있도록 HTTP referrer 제한을 설정해야 합니다.

민감한 키는 브라우저에 노출하지 않고 Edge Function 시크릿으로만 설정합니다.

- `GOOGLE_PLACES_API_KEY`: 서버용 Places 키. `VITE_`, `NEXT_PUBLIC_`처럼 클라이언트에 노출되는 접두사를 사용해서는 안 됩니다.
- `SITE_URL`: 승인 링크와 초대 redirect 주소를 만드는 데 사용하는 배포 도메인입니다.
- `DISCORD_WEBHOOK_URL`: 관리자 알림을 보낼 Discord 채널의 웹훅 주소입니다. 웹훅 URL 자체가 게시 권한이므로 비밀 값으로 취급합니다.

로컬에서 Edge Function 시크릿을 설정하려면 다음처럼 실행합니다.

```bash
npx supabase secrets set GOOGLE_PLACES_API_KEY=<...> SITE_URL=<...> DISCORD_WEBHOOK_URL=<...>
```

AWS 또는 GCP 등 과금 가능한 클라우드 서비스를 사용할 때는 코드 외부에서 예산 알림(Budget Alert)과 할당량 상한을 설정해야 합니다.

### 5. 개발 서버 실행

```bash
npm run dev
```

### 6. 테스트

프론트엔드 테스트를 실행합니다.

```bash
npm test
```

Edge Function 테스트를 실행합니다. Deno 테스트는 `supabase/functions` 디렉터리 안에서 실행해야 리포지토리 루트의 `node_modules`가 오염되지 않습니다.

```bash
cd supabase/functions && deno test --no-check --allow-env --node-modules-dir=auto
```

로컬 데이터베이스를 초기화한 뒤 DB pgTAP 테스트를 실행합니다. pgTAP은 PostgreSQL 데이터베이스 동작을 검증하는 테스트 도구입니다.

```bash
npx supabase db reset && npx supabase test db
```

## 배포

프론트엔드는 `main` 병합 시 Vercel이 자동 배포합니다. 백엔드는 다음처럼 수동 배포합니다.

```bash
npx supabase db push
npx supabase functions deploy nearby place-photo signup-request approve-signup
```

## 남은 작업

### GCP 요금 방어 마무리

- [ ] Vercel 프리뷰 배포 도메인이 필요하면 Maps JS 브라우저 키 referrer에 추가합니다. 현재는 배포 도메인과 localhost만 허용되어 있습니다.
- [ ] Places 서버 키의 IP 제한은 두지 않았습니다. Supabase Edge Function은 고정 outbound IP가 없어 IP 제한이 비현실적이며, API 제한(Places만) · 시크릿 비노출 · 사용량 제한 3중 방어로 갈음합니다.

### 후속 개선(병합 차단 아님)

- [ ] 사용자 초대 메일은 Supabase 내장 발송을 사용합니다. 발송량이 내장 한도를 넘으면 Supabase Auth에 별도 SMTP를 설정해야 하며, 이때는 도메인이 필요합니다.
- [ ] `app/set-password`와 `app/admin/approve`는 아직 데이터 레이어를 거치지 않고 Supabase를 직접 호출합니다. 나머지 화면과 같은 패턴으로 옮길 수 있습니다.
- [ ] 지도 마커는 `google.maps.Marker`를 사용합니다. 후속 대체재인 `AdvancedMarkerElement`는 GCP 콘솔에서 발급하는 Map ID가 필요해 별도로 다룹니다.
- [ ] 서버 렌더링에서 민감 데이터를 다루게 되면 `@supabase/ssr`로 전환하여 서버에서 실제 세션과 JWT를 검증합니다. 현재 `sb-session` 마커 쿠키는 사용자 경험을 위한 가드이며 실제 데이터 보호는 RLS가 담당합니다.

## 설계 문서

- 스펙: [`docs/superpowers/specs/2026-07-21-lunch-recommender-design.md`](docs/superpowers/specs/2026-07-21-lunch-recommender-design.md)
- 구현 계획: [`docs/superpowers/plans/2026-07-21-lunch-recommender.md`](docs/superpowers/plans/2026-07-21-lunch-recommender.md)
- 관리자 승인 회원가입: [`docs/superpowers/specs/2026-07-23-signup-approval-design.md`](docs/superpowers/specs/2026-07-23-signup-approval-design.md)
- 프론트엔드 데이터 레이어: [`docs/superpowers/specs/2026-07-23-fe-data-layer-refactor-design.md`](docs/superpowers/specs/2026-07-23-fe-data-layer-refactor-design.md)
- 관리자 알림 채널(Discord): [`docs/superpowers/specs/2026-07-24-admin-notify-discord-design.md`](docs/superpowers/specs/2026-07-24-admin-notify-discord-design.md)
