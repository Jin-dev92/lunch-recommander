# 점심 추천 웹앱

## 프로젝트 소개

사용자의 현재 위치를 기반으로 주변 음식점 한 곳을 추천하는 웹앱입니다. 구글 Places API로 주변 음식점을 검색하고, 개인 평점, 음식 카테고리 기호, 같은 그룹 구성원들의 평균 평점을 가중치로 사용합니다. 그룹은 초대코드로 지인들과 구성할 수 있습니다.

추천에는 가중 랜덤을 적용합니다. 가중 랜덤은 점수가 높은 음식점일수록 뽑힐 확률이 높아지는 무작위 추출 방식입니다.

## 기술 스택

- 프론트엔드: Next.js의 App Router와 TypeScript를 사용합니다. App Router는 파일과 폴더 구조를 기반으로 화면과 경로를 구성하는 Next.js 라우팅 방식입니다.
- 백엔드: Supabase를 사용합니다.
  - Auth: 사용자 인증을 처리합니다.
  - Postgres와 RLS: 데이터를 저장하고 보호합니다. RLS(Row Level Security)는 로그인한 사용자가 접근할 수 있는 행을 데이터베이스에서 제한하는 행 단위 접근 제어입니다.
  - Edge Function: 외부 API 호출과 같은 서버 측 작업을 실행하는 함수입니다.
- 외부 API:
  - 구글 Places API: 주변 장소와 평점 정보를 조회합니다.
  - 구글 Maps JavaScript API: 브라우저에서 지도를 렌더링합니다.

## 주요 기능

- 초대코드를 기반으로 그룹을 만들고 지인을 연결합니다.
- 내 평점과 그룹 구성원들의 평균 평점을 함께 반영하는 하이브리드 평점을 사용합니다.
- 개인 평점을 `0`으로 설정한 음식점은 추천 대상에서 영구 제외합니다.
- 질린 음식점은 1주 동안 스누즈하여 추천에서 일시 제외하고, 기간이 지나면 자동으로 복귀시킵니다.
- 서버에서 사용자 ID와 IP를 함께 기준으로 요청 횟수를 제한합니다. 프론트엔드만으로 제한하지 않아 스팸 요청으로 인한 Supabase 및 구글 API 과금을 방어합니다.
- 구글 Places API 호출은 Edge Function 프록시를 통해 처리하여 서버용 API 키가 브라우저에 노출되지 않도록 합니다.

## 구현 상태

- 백엔드(DB 스키마, RLS, 추천 로직, Edge Function)와 GCP 요금 방어: 완료되어 `main`에 병합되었습니다(PR #1).
- 프론트엔드 UI(인증, 그룹, 지도, 추천, 평점 및 스누즈): PR #2입니다.

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

프로젝트 루트에 `.env.local`을 만들고 `.env.local.example`을 참고하여 다음 값을 채웁니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<Supabase API URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
NEXT_PUBLIC_GOOGLE_MAPS_KEY=<Google Maps JavaScript API key>
```

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 브라우저 노출이 허용되는 키이며, 데이터 접근은 RLS 정책으로 보호합니다.
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`는 지도 렌더링용 키입니다. 허용된 도메인에서만 사용할 수 있도록 HTTP referrer 제한을 설정해야 합니다.
- 서버용 Places 키는 Edge Function 시크릿으로만 설정하고 절대 커밋하지 않습니다. `VITE_`, `NEXT_PUBLIC_`처럼 클라이언트에 노출되는 접두사를 사용해서는 안 됩니다.
- AWS 또는 GCP 등 과금 가능한 클라우드 서비스를 사용할 때는 코드 외부에서 예산 알림(Budget Alert)을 설정해야 합니다.

### 5. 개발 서버 실행

```bash
npm run dev
```

### 6. 테스트

프론트엔드 테스트를 실행합니다.

```bash
npm test
```

Edge Function 테스트를 실행합니다.

```bash
deno test supabase/functions
```

로컬 데이터베이스를 초기화한 뒤 DB pgTAP 테스트를 실행합니다. pgTAP은 PostgreSQL 데이터베이스 동작을 검증하는 테스트 도구입니다.

```bash
npx supabase db reset && npx supabase test db
```

## 남은 작업

### 배포

- [ ] Supabase 클라우드 프로젝트를 준비하거나 로컬 값으로 구동할지 결정하고 `.env.local` 실제 값을 설정합니다.
- [ ] Vercel 등에 프론트엔드를 배포합니다.
- [ ] Supabase Edge Function을 배포하고 Places 서버 키를 Edge Function 시크릿으로 설정합니다.

### GCP 요금 방어 마무리(배포 후)

- [ ] Maps JS 브라우저 키에 배포 도메인 referrer를 추가합니다. 현재는 localhost만 허용되어 있습니다.
- [ ] Places 서버 키에 Edge Function 실행 IP 제한을 추가합니다. 현재는 API 제한만 설정되어 있습니다.
- [ ] 예산 알림(Budget Alert)과 할당량 상한을 재점검합니다.

### 실브라우저 수동 검증(코드와 모의 환경으로만 검증된 항목)

- [ ] 실제 지도 렌더링과 위치 권한 프롬프트의 사용자 경험을 검증합니다.
- [ ] 실제 Supabase 세션으로 로그인 → 그룹 → 추천 → 평점 전체 흐름을 검증합니다.
- [ ] `nearby` Edge Function의 실제 구글 Places 응답 형태를 확인합니다.

### 후속 개선(병합 차단 아님)

- [ ] rate limit의 분 경계 윈도우 리셋 회귀 테스트를 추가합니다.
- [ ] 서버 렌더링에서 민감 데이터를 다루게 되면 `@supabase/ssr`로 전환하여 서버에서 실제 세션과 JWT를 검증합니다. 현재 `sb-session` 마커 쿠키는 사용자 경험을 위한 가드이며 실제 데이터 보호는 RLS가 담당합니다.

## 설계 문서

- 스펙: [`docs/superpowers/specs/2026-07-21-lunch-recommender-design.md`](docs/superpowers/specs/2026-07-21-lunch-recommender-design.md)
- 구현 계획: [`docs/superpowers/plans/2026-07-21-lunch-recommender.md`](docs/superpowers/plans/2026-07-21-lunch-recommender.md)
