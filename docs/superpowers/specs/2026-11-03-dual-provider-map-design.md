# 국내 카카오 / 해외 Google 듀얼 지도 설계

작성일: 2026-11-03

선행 문서: [`2026-11-02-kakao-map-migration-design.md`](2026-11-02-kakao-map-migration-design.md)

## 1. 배경

직전 작업([#43](https://github.com/Jin-dev92/lunch-recommander/pull/43))에서 지도·장소 검색을 카카오맵으로 전면 전환했습니다. GCP 결제 계정이 닫혀 Google Maps JavaScript API가 지도 렌더를 거부했기 때문입니다.

그런데 카카오 로컬 API는 국내 전용이고 카카오맵의 해외 지도 데이터도 사실상 없습니다. 즉 카카오 단독 구성에서는 **해외에서 앱이 동작하지 않습니다.** 사용자가 해외에서도 이 앱을 쓰고자 하므로, 국내는 카카오를 유지하고 해외는 Google을 쓰는 이중 구성으로 확장합니다.

## 2. 전제 조건 — GCP 결제 복구

이 설계는 **Google 결제 계정이 다시 열려 있어야 성립합니다.** Google Maps JavaScript API는 결제가 활성화되지 않은 프로젝트에 대해 지도 타일 렌더를 거부하므로, 결제가 닫혀 있으면 해외 경로 전체가 동작하지 않습니다.

이번 장애의 발단이 "3개월 방치 중 결제가 닫힘"이었던 점을 기록해 둡니다. 같은 일이 반복되지 않도록 **GCP 예산 알림(Budget Alert)과 API 할당량 상한을 코드 외부에서 반드시 설정해야 합니다.** 이것은 코드로 보장할 수 없는 운영 조치입니다.

### 대안을 채택하지 않은 이유

평점·리뷰·사진 의존을 직전 작업에서 걷어냈기 때문에, 현재 앱이 장소 데이터에 요구하는 것은 이름·카테고리·좌표·거리 넷뿐입니다. 이는 OpenStreetMap 계열(Leaflet 타일 + Overpass 검색 + Nominatim 지오코딩)이 키와 결제 없이 제공하는 범위와 일치하므로, 결제 의존 없이 해외를 덮는 구성도 가능했습니다.

사용자가 해외 지도·장소 데이터 품질과 평점 확보를 우선해 Google을 선택했습니다. 그 대가로 결제 의존이 돌아오며, 이는 의도된 선택입니다.

## 3. 지역 판정

검색 좌표가 한국 범위 안인지 좌표 사각형으로 판정합니다.

```
위도 33.0 ~ 38.7, 경도 124.5 ~ 129.6
```

경도 상한을 129.6으로 잡은 이유는 **후쿠오카(130.4°E)를 제외하기 위해서입니다.** 흔히 쓰는 느슨한 사각형(경도 124~132)은 후쿠오카·기타큐슈를 한국으로 오판해, 일본 여행 중에 카카오로 라우팅되어 빈 결과를 받게 됩니다. 일본은 가장 가능성 높은 해외 목적지이므로 이 경계가 중요합니다.

알려진 오판 두 가지를 기록합니다.

- **쓰시마(34.4°N, 129.3°E)는 한국으로 판정됩니다.** 후쿠오카를 제외하면서 쓰시마까지 제외하려면 사각형 하나로는 부족합니다. 쓰시마는 점심 추천 목적지로서 빈도가 낮다고 보고 감수합니다
- **울릉도(130.9°E)와 독도(131.9°E)는 해외로 판정됩니다.** Google이 해당 지역을 정상 렌더하므로 기능상 문제는 없습니다

판정 함수는 프론트엔드(지도 SDK 선택)와 Edge Function(검색 provider 선택) 양쪽에서 필요합니다. Edge Function은 Deno 런타임이라 `lib/`를 import할 수 없으므로 `supabase/functions/_shared/region.ts`에 같은 로직을 둡니다. 이 레포는 이미 `NearbyRestaurant` 타입을 런타임 경계 양쪽에 중복 정의하고 있어 기존 관행과 일치합니다. 중복 대상은 경계값 네 개와 비교식 한 줄입니다.

## 4. 설계 결정

### 4.1 provider 식별 — 컬럼으로 두고 place_id는 그대로

같은 `restaurants` 테이블에 카카오 장소와 Google 장소가 섞입니다. 두 체계를 구분할 방법이 필요합니다.

place_id에 접두사를 붙이는 방식(`kakao:26338954`, `google:ChIJ...`)도 가능하지만 채택하지 않았습니다. `ratings.place_id`와 `saved_places.place_id`가 이 값을 외래 키로 참조하므로, 접두사를 도입하려면 기존 행의 키를 일괄 변경해야 하고 그러려면 외래 키에 `on update cascade`를 먼저 붙여야 합니다.

**`provider` 컬럼을 추가하고 place_id는 각 제공자가 준 값을 그대로 씁니다.** 카카오 id는 숫자 문자열(`26338954`), Google place id는 `ChIJ`로 시작하는 문자열이라 형식이 겹치지 않아 충돌 위험이 없습니다. 기존 행은 기본값 `'kakao'`를 받으므로 데이터 변경이 필요 없습니다.

### 4.2 카테고리 통일 — Google primaryType을 한국어 카테고리로 매핑

음식 종류 필터는 카카오 `category_name`의 2단계 한국어 값(`한식`, `중식` 등)을 씁니다. Google `primaryType`은 영문 기계값(`korean_restaurant`)이라 그대로는 필터에 걸리지 않습니다.

**Edge Function에서 Google primaryType을 같은 한국어 카테고리로 변환해 저장합니다.** 매핑 표는 `supabase/functions/_shared/category.ts`에 두고, 목록에 없는 값은 `기타`로 떨어뜨립니다. 카카오의 미등록 2단계 카테고리와 같은 취급이라 동작이 일관됩니다.

이 선택에는 부수 효과가 하나 있습니다. `category_prefs.category`가 provider와 무관하게 같은 키를 쓰게 되므로, **국내에서 "한식 좋아요"로 쌓은 선호 가중치가 해외에서도 그대로 적용됩니다.** 취향 이력이 지역을 넘어 이어집니다.

Google의 `primaryTypeDisplayName`은 `languageCode: 'ko'`를 주면 한국어(`한식당`)로 오지만, 표시용 문자열이라 값이 바뀔 수 있고 카카오의 `한식`과 표기도 다릅니다. 저장 키로는 쓰지 않고 화면 표시(`category_label`)에만 씁니다.

### 4.3 평점·가격대는 복원, 사진은 복원하지 않음

Google Places는 `rating`, `userRatingCount`, `priceLevel`, `photos`를 돌려줍니다. 어디까지 되살릴지 나눕니다.

**평점·리뷰 수·가격대를 복원합니다.** `rating`을 요청하는 시점에 이미 Enterprise 등급 SKU가 적용되므로 `priceLevel`을 함께 받아도 등급이 더 오르지 않습니다. 세 값 모두 단순 필드라 기존 카드 레이아웃의 메타 줄과 추천 점수 공식에 그대로 들어갑니다.

**사진은 복원하지 않습니다.** 사진은 `nearby` 응답에서 리소스 이름만 오고, 실제 이미지를 얻으려면 별도 과금 대상인 GetPhotoMedia 호출이 필요합니다. 되살리려면 `place-photo` Edge Function, `usePlacePhoto` 훅, `photo_name` 컬럼, 레이트리밋 처리를 전부 복구해야 합니다. 호출당 과금이 붙는 경로를 다시 여는 비용 대비 효용이 낮다고 판단했습니다. 사진은 Google 장소 상세 링크가 담당합니다.

### 4.4 필터 UI는 음식 종류 하나로 유지

평점·리뷰가 해외에서만 존재하므로 "최소 평점" 필터를 되살리면 **지역에 따라 필터 UI가 갈립니다.** 국내에서는 쓸 수 없는 필터가 되어 유지보수 대상이 둘로 늘어납니다.

**필터는 음식 종류 하나로 유지합니다.** 평점·리뷰·가격대는 *필터*가 아니라 *표시 정보*와 *점수 항*으로만 쓰며, 값이 있을 때만 화면에 나타납니다. 즉 해외 결과 카드에 평점과 ₩ 표기가 한 줄 더 붙을 뿐 레이아웃은 동일합니다.

### 4.5 추천 점수 — Google 평점 항을 null 안전하게 되살림

직전 작업에서 세 항으로 줄였던 공식에 Google 평점 항을 되돌립니다.

```
score = category^1 × personal^1 × google^1 × distance^1

reviewConfidence = ratingsTotal / (ratingsTotal + 20)
google           = rating == null ? 1 : 1 + (rating / 5 - 1) × reviewConfidence
```

평점이 없으면(카카오 결과 전부) `google` 항이 1이 되어 중립이므로, 국내 동작은 직전 작업의 세 항 공식과 **수학적으로 동일합니다.** 후보 풀은 한 좌표 기준으로 만들어지므로 평점 있는 후보와 없는 후보가 한 추첨에 섞이지 않습니다.

## 5. 프론트엔드 구조

두 지도 SDK는 API가 전혀 다릅니다.

|                 | 카카오                                      | Google                         |
| --------------- | ------------------------------------------- | ------------------------------ |
| 좌표 생성       | `new kakao.maps.LatLng(lat, lng)`           | `{ lat, lng }` 리터럴          |
| 확대            | `level` (작을수록 확대, 1~14)               | `zoom` (클수록 확대)           |
| 마커 숨김       | 없음 (`setMap(null)`로 대체)                | `setVisible(boolean)`          |
| 드래그 종료     | 콜백 인자 없음                              | 콜백이 이벤트 객체로 좌표 전달 |
| 이벤트 등록     | `kakao.maps.event.addListener(target, ...)` | `target.addListener(...)`      |
| 라이브러리 로딩 | `kakao.maps.load(cb)`                       | `maps.importLibrary(name)`     |

이 차이를 컴포넌트마다 분기문으로 흩뿌리면 `Map.tsx`와 `SavedPlacesMap.tsx` 양쪽이 복잡해집니다. **지도 캔버스만 provider별 컴포넌트로 떼어내고, 나머지 UI와 상태는 기존 컴포넌트가 그대로 소유합니다.**

```
components/map/KakaoCanvas.tsx    ← 카카오 SDK 로딩·지도·마커
components/map/GoogleCanvas.tsx   ← Google SDK 로딩·지도·마커
components/map/MapCanvas.tsx      ← 좌표로 provider를 골라 둘 중 하나를 렌더
```

세 파일이 공유하는 props를 하나로 둡니다. 확대 수준은 `'pinpoint' | 'city'`라는 의미값으로 받아, 레벨과 zoom의 방향이 반대인 문제를 각 캔버스 안에 가둡니다.

```ts
export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  draggable?: boolean;
};

export type MapCanvasProps = {
  center: { lat: number; lng: number };
  zoomLevel: 'pinpoint' | 'city';
  markers: MapMarker[];
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void;
  onMarkerClick?: (id: string) => void;
  onError?: () => void;
  ariaLabel?: string;
};
```

이 props 하나가 두 용도를 모두 덮습니다.

- `Map.tsx`(위치 지정) — 드래그 가능한 마커 1개 + `onMapClick` + `onMarkerDragEnd`
- `SavedPlacesMap.tsx`(저장 맛집) — 마커 N개 + `onMarkerClick`

주소 검색 폼, 반경·음식 종류 셀렉트, 위치 권한 처리, 에러 표시는 전부 기존 컴포넌트에 남습니다. provider별로 중복되는 코드는 각 캔버스의 SDK 연결부 약 40줄뿐이며, 이는 두 SDK의 API가 다른 데서 오는 불가피한 분량입니다.

### 스크립트 로딩

각 캔버스가 자기 `next/script` 태그를 소유합니다. 해외에서는 카카오 스크립트를, 국내에서는 Google 스크립트를 아예 받지 않으므로 불필요한 네트워크 비용과 과금이 발생하지 않습니다.

직전 작업에서 유지한 "전역이 늦게 노출되는 경우" 폴링 가드는 양쪽 캔버스 모두에 둡니다. `next/script`의 준비 이벤트가 스크립트 본문 실행보다 먼저 뜨는 문제는 SDK와 무관하게 발생하며, 이 레포에는 해당 장애 이력([`2026-07-25-map-initial-render-fix.md`](2026-07-25-map-initial-render-fix.md), `memory/2026-07-27-map-loading-investigation.md`)이 있습니다.

## 6. Edge Function 구조

`nearby`와 `geocode` 모두 이미 의존성 주입 구조(`NearbyDeps`, `GeocodeDeps`)라 provider 교체 지점이 열려 있습니다. 핸들러는 손대지 않고 어댑터만 바꿉니다.

**`nearby`** — `fetchKakao` 하나를 받던 자리를 `fetchPlaces: (lat, lng, radius, provider)` 하나로 바꾸고, 운영 어댑터에서 provider에 따라 카카오 카테고리 검색과 Google `places:searchNearby`를 호출합니다. 캐시 조회(`findCached`)는 `provider` 컬럼으로 필터해, 해외에서 국내 캐시 행이 섞여 나오지 않게 합니다.

**`geocode`** — 국내는 카카오 주소 검색 후 키워드 검색 폴백(직전 작업에서 구현), 해외는 Google Geocoding을 씁니다. 다만 지오코딩은 **검색어만 있고 좌표가 없는 시점**에 호출되므로 지역 판정을 쓸 수 없습니다. 현재 지도 중심 좌표를 요청 본문에 함께 받아 그것으로 provider를 고릅니다. 좌표가 오지 않으면 국내로 간주합니다(주 사용 환경이 국내이므로).

## 7. DB 마이그레이션 (`0013_dual_provider_places.sql`)

`0012`가 드롭한 컬럼 일부를 되살리고 provider 구분을 추가합니다. **삭제는 없습니다.**

1. `provider text not null default 'kakao'` 추가 + `check (provider in ('kakao', 'google'))`
2. `google_rating numeric(2,1) null check (google_rating between 0 and 5)` 추가
3. `google_ratings_total integer null check (google_ratings_total >= 0)` 추가
4. `price_level text null` 추가
5. 컬럼 코멘트 갱신

`photo_name`은 되살리지 않습니다(4.3절).

`0012`가 드롭한 컬럼을 `0013`이 다시 추가하는 모양이 되는데, 이는 두 변경을 각각 독립적으로 리뷰 가능한 PR로 유지하기 위한 선택입니다. 적용된 마이그레이션을 수정하지 않는다는 원칙과도 맞습니다.

## 8. 환경변수

| 변수                          | 위치                 | 용도                      |
| ----------------------------- | -------------------- | ------------------------- |
| `NEXT_PUBLIC_KAKAO_MAP_KEY`   | 클라이언트           | 카카오 지도 SDK (국내)    |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | 클라이언트           | Google Maps JS SDK (해외) |
| `KAKAO_REST_API_KEY`          | Edge Function 시크릿 | 카카오 로컬 API           |
| `GOOGLE_PLACES_API_KEY`       | Edge Function 시크릿 | Google Places·Geocoding   |

클라이언트 키 두 개는 모두 도메인/referrer 제한이 걸린 공개 키입니다. 서버 키 두 개는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

## 9. 검증 기준

1. `npm run typecheck` · `npm run lint` · `npm test` · `deno test` 통과
2. 국내 좌표에서 카카오 지도가 렌더되고 카카오 검색 결과가 반환됨
3. 해외 좌표에서 Google 지도가 렌더되고 Google 검색 결과가 반환됨
4. 지역 전환 시 지도 SDK가 바뀌어도 핀 드래그·지도 클릭 보정이 양쪽에서 동작
5. 국내 결과에는 평점·가격대가 표시되지 않고, 해외 결과에는 표시됨
6. 국내 추천 점수가 직전 작업의 세 항 공식과 동일한 값을 냄(Google 항이 1로 중립)

## 10. 사용자가 직접 해야 하는 외부 설정

1. **GCP 결제 계정 재활성화** 및 Maps JavaScript API · Places API · Geocoding API 활성화
2. **GCP 예산 알림과 할당량 상한 설정** — 2절에 적은 이유로 필수입니다
3. Google Maps 브라우저 키의 HTTP referrer 제한에 배포 도메인과 `localhost` 등록
4. 카카오 개발자 콘솔 앱 생성, Web 플랫폼에 도메인 등록, JavaScript 키·REST API 키 발급
5. 환경변수 네 개를 8절 표대로 설정
6. 마이그레이션 `0012`, `0013` 순서대로 적용
