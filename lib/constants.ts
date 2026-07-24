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
  SIGNUP_REQUEST: '/signup-request',
} as const;

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
