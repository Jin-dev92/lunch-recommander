# 지도·장소 검색 카카오맵 전면 전환 설계

작성일: 2026-11-02

## 1. 배경

이 앱의 지도 렌더링과 주변 음식점 검색은 Google Maps JavaScript API와 Google Places API에 의존해 왔습니다. 2026년 11월 현재 이 의존이 동작하지 않습니다.

원인은 코드가 아니라 결제입니다. 지도 렌더링에 쓰이는 GCP 프로젝트 `project-c99452b5-0809-49ec-b5c`의 결제 계정 `01CBA5-0D50EB-188D86`이 닫힌 상태(`open: false`, `billingEnabled: false`)이며, Google Maps JavaScript API는 결제가 활성화되지 않은 프로젝트에 대해 지도 타일 렌더를 거부합니다. 결제를 되살리는 대안 대신, 국내 서비스에 더 맞고 무료 할당량이 넉넉한 카카오맵으로 전환하는 선택을 했습니다.

전환 범위는 **전면 전환**입니다. 지도 렌더링만 바꾸고 장소 데이터는 Google에 남겨 두는 절충안은 Google 결제 의존을 그대로 남기므로 문제를 해결하지 못합니다.

## 2. 핵심 제약 — 카카오 로컬 API에는 평점·리뷰가 없습니다

전환의 난점은 지도 SDK 교체가 아니라 **데이터 모델의 비대칭**입니다.

Google Places API `places:searchNearby`는 장소별로 `rating`(평균 평점), `userRatingCount`(리뷰 수), `priceLevel`(4단계 가격 등급), `photos`(사진 리소스)를 함께 반환합니다. 현 앱은 이 네 필드 전부를 쓰고 있습니다.

카카오 로컬 API의 카테고리 검색(`GET https://dapi.kakao.com/v2/local/search/category.json`)이 반환하는 필드는 다음이 전부입니다. 모두 문자열 타입입니다.

| 필드                  | 내용                                                        |
| --------------------- | ----------------------------------------------------------- |
| `id`                  | 카카오 장소 식별자                                          |
| `place_name`          | 장소명                                                      |
| `category_name`       | 계층 카테고리. `"음식점 > 한식 > 육류,고기"` 형태           |
| `category_group_code` | 카테고리 그룹 코드. 음식점은 `FD6`                          |
| `category_group_name` | 카테고리 그룹명                                             |
| `phone`               | 전화번호                                                    |
| `address_name`        | 지번 주소                                                   |
| `road_address_name`   | 도로명 주소                                                 |
| `x` / `y`             | 경도 / 위도                                                 |
| `place_url`           | 카카오맵 장소 상세 페이지 URL                               |
| `distance`            | 중심 좌표로부터의 거리(미터). `x`, `y`를 보낸 경우에만 제공 |

**평점·리뷰 수·가격 등급·사진이 전부 없습니다.** 따라서 현 앱의 다음 기능들은 데이터 근거를 잃습니다.

1. 검색 조건 UI의 "최소 평점"(3.5 / 4.0 / 4.5 / 5.0) 셀렉트
2. 검색 조건 UI의 "최소 리뷰 수"(10 / 30 / 50 / 70 / 100개) 셀렉트
3. `scoreCandidate`의 추천 점수 공식 중 Google 평점 항
4. 추천 결과 카드의 사진 썸네일과 가격대(₩) 표기

이 설계는 각 항목을 어떻게 대체하거나 제거할지 결정합니다.

## 3. 설계 결정

### 3.1 평점·리뷰 필터 → 음식 종류(카테고리) 선택 1개

셀렉트 2개를 음식 종류 선택 셀렉트 1개로 교체합니다.

근거는 세 가지입니다.

**데이터가 이미 응답에 있습니다.** 카카오 `category_name`은 `"음식점 > 한식 > 육류,고기"` 형태로 계층 구조를 담고 있습니다. 2단계 값(`한식`, `중식`, `일식` 등)을 문자열 분해만으로 얻을 수 있으므로 새 API 호출이나 추가 데이터 수집이 필요하지 않습니다.

**기존 배선을 그대로 재사용합니다.** 현재 검색 조건은 `Map` → `onCriteriaChange` → `Recommend` → `filterCandidates`라는 경로로 흐릅니다. `RecommendationCriteria` 타입의 필드만 `{ minGoogleRating, minGoogleReviews }`에서 `{ category }`로 바뀌고, 컴포넌트 간 데이터 흐름과 `useEffect` 의존성 구조는 손대지 않습니다. 변경 범위가 가장 작은 선택지입니다.

**"내 별점 N개 이상" 필터는 기본 필터로 부적합합니다.** 별점 이력이 없는 신규 사용자와 익명 사용자에게 항상 빈 결과를 반환합니다. 또한 개인 별점은 이미 `scoreCandidate`의 `personal` 항으로 추천 점수에 반영되고 있어, 필터로 중복 적용할 이유가 없습니다.

카테고리 옵션은 닫힌 집합이므로 `lib/constants.ts`에 `as const` 객체로 정의하고 파생 유니온 타입을 추출합니다(프로젝트 규칙의 enum 금지 패턴). 기본값은 `전체`이며, 이 값이 선택된 경우 카테고리 필터를 적용하지 않습니다.

카카오 2단계 카테고리는 열린 집합에 가깝습니다. 상수 목록에 없는 값을 가진 음식점은 `전체`에서만 노출되고 특정 카테고리 선택 시에는 걸러집니다. 기본값이 `전체`이므로 기본 동작에서는 누락이 발생하지 않습니다.

한 가지 부수 효과를 기록합니다. 카카오 카테고리 그룹 코드에서 **`FD6`(음식점)과 `CE7`(카페)는 별개 코드**입니다. `FD6`만 조회하면 카페가 후보에서 빠집니다. 점심 추천이라는 앱의 목적에는 부합하므로 이번 전환에서는 `FD6`만 조회합니다.

### 3.2 사진 썸네일과 가격대 표기 → 둘 다 제거

카카오 로컬 API에는 장소 사진과 가격 등급이 없습니다. 다른 소스(네이버 지역검색 등)를 붙이는 방안은 새 API 키 발급, 과금 구조, 레이트리밋 설계를 추가로 요구하므로 전환 범위를 크게 늘립니다. 이번 전환에서는 제거합니다.

제거 대상은 다음입니다.

- `supabase/functions/place-photo/` Edge Function 전체
- `usePlacePhoto` 쿼리 훅과 `getPlacePhotoUri` API 함수
- `priceLevelSymbol` 함수와 `PRICE_LEVEL_SYMBOLS` 상수
- `restaurants` 테이블의 `photo_name`, `price_level` 컬럼
- `Recommend.tsx`의 썸네일 `<img>`와 메타 줄의 ₩ 표기

기능 공백은 **카카오맵 장소 상세 링크가 흡수합니다.** 카카오 로컬 API가 반환하는 `place_url`은 해당 장소의 카카오맵 상세 페이지이며, 사진·메뉴·리뷰·영업시간을 모두 담고 있습니다. 즉 제거된 정보는 링크 한 번 뒤로 옮겨지는 것이며 사라지지 않습니다.

### 3.3 기존 데이터 → 기존 행 전부 삭제 + 컬럼 드롭

`restaurants` 테이블의 `place_id`는 Google place id입니다. 카카오 장소 식별자는 완전히 다른 체계이므로, 전환 후 쌓이는 행과 기존 행은 같은 가게를 가리켜도 서로 다른 키를 갖습니다.

이 키는 고립되어 있지 않습니다. `ratings.place_id`와 `saved_places.place_id`가 `restaurants(place_id)`를 외래 키로 참조합니다. 따라서 선택지는 다음 세 가지였습니다.

1. 기존 행을 그대로 두고 새 키로 쌓기 — 데이터 손실은 없으나 과거 별점이 새 후보와 매칭되지 않는 고아 데이터로 남습니다
2. 기존 행 전부 삭제 — DB가 깨끗해지지만 사용자 별점과 저장 맛집이 영구 소실됩니다
3. 이름·좌표로 매핑 시도 — 별점이 살아남지만 매칭 정확도를 보장할 수 없고 일회성 마이그레이션 스크립트가 필요합니다

**선택: 2번(기존 행 전부 삭제 + 컬럼 드롭).**

`restaurants`는 `fetched_at` 기준 15분 TTL 캐시 테이블이므로 테이블 자체의 데이터 가치는 없습니다. 손실되는 것은 cascade로 함께 지워지는 `ratings`(사용자 별점·영구 제외·스누즈)와 `saved_places`(저장한 맛집·메모)입니다. **이 삭제는 되돌릴 수 없습니다.**

마이그레이션 `0012_kakao_places.sql`이 수행할 작업은 다음 순서입니다.

1. `delete from public.restaurants` — cascade로 `ratings`, `saved_places`의 참조 행이 함께 삭제됩니다
2. `google_rating`, `google_ratings_total`, `price_level`, `photo_name` 컬럼 드롭
3. `place_url` 컬럼 추가 — 카카오 응답의 `place_url`을 그대로 보관합니다
4. `category`, `category_label`, `address` 컬럼 코멘트를 카카오 필드 기준으로 갱신

`place_url`을 컬럼으로 추가하는 이유는 캐시 적중 시에도 상세 링크가 유지되어야 하기 때문입니다. 장소 식별자로 URL을 조립하는 방식은 카카오가 보장하지 않는 URL 형식을 추측하게 되므로 채택하지 않았습니다. API가 주는 값을 그대로 보관합니다.

`saved_places`에는 `place_url` 컬럼을 추가하지 않습니다. 이 테이블에는 좌표 기반 수동 추가 항목(`manual:{lat},{lng}` 형태의 place id)이 섞여 있어 카카오 장소 상세 페이지가 존재하지 않는 행이 있습니다. 대신 이름으로 카카오맵 검색 URL(`https://map.kakao.com/?q={장소명}`)을 조립합니다. 두 종류의 행을 같은 방식으로 처리할 수 있습니다.

### 3.4 주소 검색 → 주소 검색 후 키워드 검색 폴백

Google Geocoding API는 `"서울 강남구 테헤란로 1"` 같은 정식 주소와 `"판교역"` 같은 장소명을 한 엔드포인트에서 모두 처리합니다. 현재 검색창 placeholder도 `"주소·장소로 검색 (예: 판교역)"`입니다.

카카오는 두 기능이 분리되어 있습니다.

- 주소로 좌표 변환: `GET /v2/local/search/address.json` — 주소 해석은 정확하지만 장소명을 받지 못합니다
- 키워드로 장소 검색: `GET /v2/local/search/keyword.json` — 장소명에 강하지만 번지까지 적힌 정확한 도로명 주소에서 엉뚱한 결과가 나올 수 있습니다

**선택: 주소 검색을 먼저 시도하고, 결과가 없으면 키워드 검색으로 재시도합니다.** 현재 동작과 가장 가깝게 유지되며 placeholder 문구를 바꿀 필요도 없습니다.

비용은 두 가지입니다. Edge Function에 분기가 10여 줄 추가되고, 주소 검색이 실패하는 질의(장소명)에 대해 외부 호출이 2회 발생합니다. 두 번째 비용은 레이트리밋이 이미 걸려 있어 통제됩니다.

좌표 추출 경로를 명시합니다. 주소 검색 응답의 `documents[]`에는 `x`/`y`가 최상위, `address.x`/`address.y`, `road_address.x`/`road_address.y` 세 곳에 있습니다. 문서가 어느 쪽을 쓰라고 지정하지 않으므로 **최상위 `documents[0].x` / `documents[0].y`를 사용합니다.** 이 값은 카카오가 질의에 대해 선택한 대표 좌표입니다.

## 4. 변경 대상 파일

### 프론트엔드

| 파일                                       | 변경                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/googleMaps.ts`                        | 삭제. `lib/kakaoMaps.ts`로 대체                                                                                                                      |
| `lib/kakaoMaps.ts`                         | 신규. SDK 스크립트 URL, `loadKakaoMaps()` 로더, 사용하는 API의 최소 타입 선언                                                                        |
| `lib/constants.ts`                         | `priceLevelSymbol`·`googleMapsPlaceUrl` 제거, `kakaoMapSearchUrl` 추가, `FOOD_CATEGORY` 상수 추가, `API_ROUTES.PLACE_PHOTO` 제거                     |
| `lib/types/api/recommend.types.ts`         | `RecommendationCriteria`를 `{ category }`로 교체, `NearbyRestaurant`에서 평점·리뷰·가격·사진 필드 제거 및 `placeUrl` 추가, `PlacePhotoResponse` 제거 |
| `lib/recommend.ts`                         | `Candidate`에서 Google 평점 필드 제거, `filterCandidates`를 카테고리 필터로 교체, `scoreCandidate`에서 Google 평점 항 제거                           |
| `lib/mergeCandidates.ts`                   | 반환 타입의 제거된 필드 정리                                                                                                                         |
| `lib/api/recommend.ts`                     | `getPlacePhotoUri` 제거                                                                                                                              |
| `lib/hooks/queries/useRecommendQueries.ts` | `usePlacePhoto`와 `recommendQueryKeys.photo` 제거                                                                                                    |
| `components/Map.tsx`                       | 카카오 지도·마커로 교체, 평점·리뷰 셀렉트를 음식 종류 셀렉트로 교체                                                                                  |
| `components/SavedPlacesMap.tsx`            | 카카오 지도·마커로 교체, 상세 링크를 카카오맵 검색 URL로 교체                                                                                        |
| `components/Recommend.tsx`                 | 썸네일·가격대 제거, 상세 링크를 `placeUrl`로 교체                                                                                                    |
| `app/layout.tsx`                           | 주석의 Google 참조 정리                                                                                                                              |

### Edge Functions

| 파일                                  | 변경                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/nearby/index.ts`  | `createGoogleFetcher` → `createKakaoFetcher`. 카카오 카테고리 검색(`FD6`) 호출, `category_name` 분해, 캐시 컬럼 매핑 갱신 |
| `supabase/functions/geocode/index.ts` | `createGeocoder`를 카카오 주소 검색 + 키워드 검색 폴백으로 교체                                                           |
| `supabase/functions/place-photo/`     | 디렉토리 전체 삭제                                                                                                        |

### DB

| 파일                                        | 변경                |
| ------------------------------------------- | ------------------- |
| `supabase/migrations/0012_kakao_places.sql` | 신규. 3.3절의 4단계 |

### 문서·환경변수

| 파일                    | 변경                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `.env.local.example`    | `NEXT_PUBLIC_GOOGLE_MAPS_KEY` → `NEXT_PUBLIC_KAKAO_MAP_KEY` |
| `supabase/.env.example` | `GOOGLE_PLACES_API_KEY` → `KAKAO_REST_API_KEY`              |
| `README.md`             | 환경변수 안내와 외부 API 설명 갱신                          |

## 5. 카카오 지도 SDK 사용 방식

공식 문서와 샘플 페이지에서 확인한 내용입니다. 추측한 부분은 없습니다.

**스크립트 로딩.** SDK는 `https://dapi.kakao.com/v2/maps/sdk.js?appkey={JavaScript키}&autoload=false`로 불러옵니다. `autoload=false`를 지정하면 SDK가 자동 초기화를 건너뛰고, `kakao.maps.load(callback)`의 콜백에서 초기화 완료를 통보받습니다. Next.js의 `next/script`는 스크립트를 비동기로 주입하므로 전역 객체가 준비되는 시점을 알 수 없고, 이 콜백이 그 시점을 알려줍니다. 기존 Google 구현이 `waitForMapsSdk`로 전역을 폴링했던 것과 달리 카카오는 공식 콜백을 제공하므로 폴링이 필요 없습니다.

**키 종류.** 지도 SDK는 **JavaScript 키**를 쓰고, 로컬 REST API는 `Authorization: KakaoAK {REST API 키}` 헤더로 **REST API 키**를 씁니다. 두 키는 다릅니다. JavaScript 키는 등록된 도메인에서만 동작하는 공개 키이므로 `NEXT_PUBLIC_KAKAO_MAP_KEY`로 클라이언트에 노출해도 됩니다. REST API 키는 도메인 제한이 없는 서버 키이므로 **Edge Function 시크릿으로만** 두고 클라이언트에 내보내지 않습니다.

**지도 생성.** `new kakao.maps.Map(container, { center: new kakao.maps.LatLng(lat, lng), level })`입니다. `LatLng` 인자 순서는 위도, 경도입니다.

**확대 레벨.** 1부터 14까지이며 **숫자가 작을수록 확대**됩니다. Google Maps의 zoom과 방향이 반대입니다. 기존 Google 구현의 `zoom: 16`(좌표 확정 시)과 `zoom: 13`(기본 서울 지도)에 대응하는 값으로 각각 레벨 3과 레벨 6을 씁니다.

**마커.** `new kakao.maps.Marker({ map, position, draggable, title })`입니다. 드래그 종료는 `kakao.maps.event.addListener(marker, 'dragend', callback)`으로 받으며, **콜백은 인자를 받지 않습니다.** 따라서 새 위치는 `marker.getPosition()`으로 읽습니다. Google의 `dragend`가 이벤트 객체로 좌표를 넘겨주던 것과 다른 지점입니다.

**지도 클릭.** `kakao.maps.event.addListener(map, 'click', (mouseEvent) => ...)`이며 좌표는 `mouseEvent.latLng`입니다. `latLng.getLat()`, `latLng.getLng()`로 숫자를 꺼냅니다.

**마커 숨김.** 카카오 마커에는 Google의 `setVisible(boolean)`에 대응하는 메서드가 없습니다. `setMap(null)`로 지도에서 떼고 `setMap(map)`으로 다시 붙이는 방식으로 대체합니다.

**타입 선언.** 카카오 SDK는 TypeScript 타입을 제공하지 않습니다. 커뮤니티 타입 패키지를 의존성으로 추가하는 대신, 실제로 사용하는 API만 `lib/kakaoMaps.ts`에 직접 선언합니다. 사용 범위가 좁고(지도·마커·이벤트·좌표 4종), 프로젝트 규칙이 `as any`를 금지하므로 정확한 타입이 필요하며, 새 의존성 없이 해결할 수 있습니다.

## 6. 추천 점수 공식 변경

기존 공식은 네 항의 곱이었습니다.

```
score = category^1 × personal^1 × google^1 × distance^1
```

`google` 항은 Google 평점을 리뷰 수 기반 신뢰도로 보정한 값이었습니다.

```
reviewConfidence = ratingsTotal / (ratingsTotal + 20)
google = 1 + (rating / 5 - 1) × reviewConfidence
```

카카오 전환 후 이 항은 입력 데이터가 없으므로 제거합니다. 남는 공식은 세 항입니다.

```
score = category^1 × personal^1 × distance^1
```

- `category` — 사용자의 카테고리 선호 가중치(0.5 / 1 / 2). 중립이 1입니다
- `personal` — 사용자 본인 별점을 3으로 나눈 값. 별점이 없으면 1입니다
- `distance` — 검색 반경 대비 가까울수록 최대 1.2까지 올라가는 보정

결과적으로 **외부 평점이 아니라 사용자 자신의 취향 이력과 거리만으로 추천하는 구조**가 됩니다. 별점 이력이 없는 신규·익명 사용자에게는 `category`와 `personal`이 모두 1이 되어 사실상 거리 가중 랜덤 추첨으로 동작합니다. 기존에도 Google 평점이 없는 가게는 `google` 항이 1이었으므로 동작 양상 자체는 새롭지 않습니다.

## 7. 검증 기준

1. `npm run typecheck` 통과
2. `npm test` 통과 (전환 전 기준 147개)
3. `npm run lint` 통과
4. 로컬 dev 서버에서 지도가 실제로 렌더되고, 핀 드래그와 지도 클릭으로 좌표가 보정됨
5. 추천 호출이 카카오 기반 `nearby` Edge Function을 지나 후보를 반환함
6. 코드·주석·문서에 Google Maps/Places 참조가 남지 않음

### 의도적으로 남기는 Google 참조

다음 네 곳은 지우지 않습니다. 이유를 함께 기록합니다.

1. **이미 적용된 마이그레이션(`0001`, `0005`, `0006`, `0009`)의 컬럼 주석** — 적용이 끝난 마이그레이션 파일은 수정하지 않는 것이 원칙입니다. 이미 실행된 SQL의 기록을 바꾸면 파일과 실제 DB 상태가 어긋나고, 과거 이력을 추적할 수 없게 됩니다. 현재 유효한 주석은 `0012`가 `comment on column`으로 덮어씁니다
2. **`0012_kakao_places.sql`의 설명 주석** — 무엇에서 무엇으로 옮기는지를 적는 것이 마이그레이션의 목적이므로 전환 전 출처를 명시합니다
3. **`lib/kakaoMaps.ts`의 두 주석** — 카카오 마커에 `setVisible`이 없다는 점과 확대 레벨 방향이 Google zoom과 반대라는 점은, 기존 코드를 알고 읽는 사람이 가장 혼동하는 두 지점입니다. 비교 대상을 적어 두는 쪽이 안전합니다
4. **`memory/2026-07-27-map-loading-investigation.md`** — 특정 날짜의 장애 조사 기록입니다. 과거 사실이므로 현재 구현에 맞춰 고쳐 쓰지 않습니다

## 8. 사용자가 직접 해야 하는 외부 설정

코드로 처리할 수 없는 항목입니다.

1. 카카오 개발자 콘솔(`https://developers.kakao.com`)에서 애플리케이션을 생성합니다
2. **플랫폼 → Web**에 사이트 도메인으로 `http://localhost:3000`과 배포 도메인(`https://lunch-recommander.vercel.app`)을 등록합니다. 등록된 도메인에서만 지도 SDK가 동작합니다
3. **앱 키**에서 JavaScript 키와 REST API 키를 확인합니다
4. JavaScript 키를 `NEXT_PUBLIC_KAKAO_MAP_KEY`로 Vercel Production·Preview 환경과 로컬 `.env.local`에 설정합니다
5. REST API 키를 Supabase Edge Function 시크릿 `KAKAO_REST_API_KEY`로 설정합니다. 이 키는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다
6. 카카오 로컬 API는 별도 활성화 절차 없이 REST API 키로 바로 호출됩니다

## 9. 참고 자료

- 카카오 로컬 API 개발 가이드: `https://developers.kakao.com/docs/ko/local/dev-guide`
- 카카오 지도 Web API 가이드: `https://apis.map.kakao.com/web/guide/`
- 카카오 지도 Web API 문서: `https://apis.map.kakao.com/web/documentation/`
- 카카오 지도 샘플 (드래그 가능한 마커): `https://apis.map.kakao.com/web/sample/draggableMarker/`
- 카카오 지도 샘플 (draggable 마커 이벤트): `https://apis.map.kakao.com/web/sample/addDraggableMarkerDragEvent/`
- 카카오 지도 샘플 (클릭한 위치에 마커 표시): `https://apis.map.kakao.com/web/sample/addMapClickEventWithMarker/`
- 카카오 지도 샘플 (지도 레벨 바꾸기): `https://apis.map.kakao.com/web/sample/changeLevel/`
