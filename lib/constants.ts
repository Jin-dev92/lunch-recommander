// 여러 파일이 공유하는 식별자 단일 출처. 사용자 노출 문구는 lib/messages.ts에 둔다.

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
} as const;

// axiosInstance의 baseURL(Supabase Functions) 기준 상대 경로
export const API_ROUTES = {
  NEARBY: '/nearby',
  PLACE_PHOTO: '/place-photo',
} as const;

// Google priceLevel 열거형을 ₩ 기호로 환산한다. Google은 실제 메뉴 가격이 아니라
// 이 4단계 등급만 제공한다. 등급이 없거나 무료면 표시하지 않는다.
const PRICE_LEVEL_SYMBOLS: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '₩',
  PRICE_LEVEL_MODERATE: '₩₩',
  PRICE_LEVEL_EXPENSIVE: '₩₩₩',
  PRICE_LEVEL_VERY_EXPENSIVE: '₩₩₩₩',
};

export function priceLevelSymbol(priceLevel: string | null): string {
  return priceLevel ? (PRICE_LEVEL_SYMBOLS[priceLevel] ?? '') : '';
}

/**
 * 화면 표시용 주소. Google formattedAddress는 국가를 넣는데, 한국·일본 등 CJK 로케일은 국가를
 * 맨 앞 한 어절로("대한민국 서울…"), 서구권은 맨 뒤에 쉼표로("…, USA") 붙인다.
 * 앞에 오는 국가명만 떼어 장황함을 줄인다. 저장값(DB)은 전체 주소를 그대로 두고 표시할 때만 다듬는다.
 *   - 쉼표가 있으면 서구식으로 보고 그대로 둔다(국가가 맨 뒤라 앞을 떼면 안 된다).
 *   - 쉼표가 없으면 CJK식이라 국가가 맨 앞이다. 짧은 첫 어절(≤4자)만 국가명으로 보고 뗀다.
 *     "대한민국"(4자)은 떼고 "서울특별시"(5자) 같은 지명은 보존하기 위한 경계다.
 */
export function displayAddress(address: string | null): string {
  const value = (address ?? '').trim();
  if (value.includes(',')) return value;
  const parts = value.split(/\s+/);
  return parts.length > 1 && parts[0].length <= 4 ? parts.slice(1).join(' ') : value;
}

/**
 * Google 지도의 해당 가게 상세 페이지 URL. 메뉴·사진·리뷰·영업시간을 여기서 볼 수 있다.
 * placeId만 쓰므로 추가 API 호출·비용이 없다. query는 필수라 이름을 함께 넣는다.
 * @see https://developers.google.com/maps/documentation/urls/get-started#search-action
 */
export function googleMapsPlaceUrl(name: string, placeId: string): string {
  const params = new URLSearchParams({ api: '1', query: name, query_place_id: placeId });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export const TABLE = {
  RATINGS: 'ratings',
  CATEGORY_PREFS: 'category_prefs',
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
} as const;

export const RPC = {
  CREATE_GROUP: 'create_group',
  JOIN_GROUP_BY_CODE: 'join_group_by_code',
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
