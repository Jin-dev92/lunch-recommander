// 여러 파일이 공유하는 식별자 단일 출처. 사용자 노출 문구는 lib/messages.ts에 둔다.

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  PLACES: '/places',
} as const;

// axiosInstance의 baseURL(Supabase Functions) 기준 상대 경로
export const API_ROUTES = {
  NEARBY: '/nearby',
  GEOCODE: '/geocode',
} as const;

/**
 * 음식 종류 필터에서 "좁히지 않음"을 뜻하는 센티넬. 나머지 선택지는 고정 목록이 아니라
 * 실제 검색 결과의 카테고리에서 뽑는다 — 카카오 2단계 카테고리는 열린 집합이라
 * (한식·중식 외에 제과,베이커리·구내식당 등이 수시로 나온다) 목록을 박아두면
 * 어떻게 채워도 새 값이 새고, 그 값을 가진 가게는 영영 고를 수 없게 된다.
 */
export const ALL_CATEGORIES = '전체';

/**
 * 카카오맵 웹 검색 URL. 저장한 맛집에는 카카오 place_url이 없고(좌표로 직접 추가한
 * "manual:" 항목이 섞여 있어 장소 상세 페이지가 없는 행도 있다), 장소명 검색은 두 종류를
 * 같은 방식으로 처리할 수 있다. 추가 API 호출·비용이 없다.
 */
export function kakaoMapSearchUrl(name: string): string {
  return `https://map.kakao.com/?q=${encodeURIComponent(name)}`;
}

export const TABLE = {
  RATINGS: 'ratings',
  CATEGORY_PREFS: 'category_prefs',
  FOLDERS: 'folders',
  SAVED_PLACES: 'saved_places',
} as const;

export const COLUMNS = {
  RATINGS: 'user_id,place_id,score,snoozed_until',
  RATING_SCORE: 'score',
  CATEGORY_PREFS: 'category,weight',
} as const;

// upsert 충돌 기준 컬럼 — DB의 unique 제약과 1:1로 맞춘다.
export const ON_CONFLICT = {
  RATINGS: 'user_id,place_id',
  CATEGORY_PREFS: 'user_id,category',
  SAVED_PLACES: 'folder_id,place_id',
} as const;

// 평점 행이 없는 음식점을 스누즈할 때 기록할 중립 점수(0=영구 제외, 5=최고)
export const NEUTRAL_RATING_SCORE = 3;

// 별점으로 매길 수 있는 범위. 0은 별점이 아니라 "영구 제외"라 별과 분리해 다룬다.
export const MIN_STAR_SCORE = 1;
export const MAX_STAR_SCORE = 5;
export const EXCLUDE_RATING_SCORE = 0;

// 카테고리 선호 가중치. 추천 점수에 곱해지는 배수라 1이 중립이다.
// 숫자를 그대로 입력받는 대신 의미가 드러나는 3단계로 고정한다.
export const CATEGORY_PREFERENCE_OPTIONS = [
  { label: '별로예요', weight: 0.5 },
  { label: '보통', weight: 1 },
  { label: '좋아요', weight: 2 },
] as const;

export const DEFAULT_CATEGORY_WEIGHT = 1;
