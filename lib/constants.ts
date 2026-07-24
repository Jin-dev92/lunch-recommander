// 여러 파일이 공유하는 식별자 단일 출처. 사용자 노출 문구는 lib/messages.ts에 둔다.

// 로그인 시 클라이언트가 심고 미들웨어가 존재 여부만 확인하는 세션 마커 쿠키
export const SESSION_COOKIE = 'sb-session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  GROUPS: '/groups',
} as const;

// axiosInstance의 baseURL(Supabase Functions) 기준 상대 경로
export const API_ROUTES = {
  NEARBY: '/nearby',
  PLACE_PHOTO: '/place-photo',
  SIGNUP_REQUEST: '/signup-request',
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
