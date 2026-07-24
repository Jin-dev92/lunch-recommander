// @see Edge Function 스펙: POST /functions/v1/nearby (supabase/functions/nearby/index.ts)
import type { CategoryPrefRow } from './categoryPrefs.types';
import type { RatingRow } from './ratings.types';

/** 지도에서 고른 검색 위치. 반경은 Edge Function이 허용하는 네 값만 받는다. */
export type SearchLocation = { lat: number; lng: number; radius: 100 | 300 | 500 | 1000 };

export type MinimumGoogleRating = 3.5 | 4 | 4.5 | 5;
export type MinimumGoogleReviews = 10 | 30 | 50 | 70 | 100;
export type RecommendationCriteria = {
  minGoogleRating: MinimumGoogleRating;
  minGoogleReviews: MinimumGoogleReviews;
};
export const DEFAULT_RECOMMENDATION_CRITERIA: RecommendationCriteria = {
  minGoogleRating: 3.5,
  minGoogleReviews: 30,
};

export type NearbyRestaurant = {
  placeId: string;
  name: string;
  /** Google primaryType(korean_restaurant 등). 선호 가중치의 저장 키이자 점수 계산 기준인 기계값. */
  category: string;
  /** Google primaryTypeDisplayName(한식당 등). 화면 표시 전용이며 저장 키로 쓰지 않는다. */
  categoryLabel: string;
  lat: number;
  lng: number;
  googleRating: number | null;
  googleRatingsTotal: number;
  /** Google priceLevel 열거형(PRICE_LEVEL_MODERATE 등). 실제 가격이 아니라 4단계 등급. */
  priceLevel: string | null;
  /** Google 사진 리소스 이름. 실제 이미지는 place-photo가 해석한다. 추천된 1곳만 조회한다. */
  photoName: string | null;
  distanceMeters: number;
};

export type NearbyResponse = {
  restaurants: NearbyRestaurant[];
  source: 'cache' | 'google';
};

/** @see POST /functions/v1/place-photo */
export type PlacePhotoResponse = {
  photoUri: string;
};

/** 추천 한 번에 필요한 원본 데이터 묶음. 점수 계산·추첨은 lib/recommend.ts가 담당한다. */
export type RecommendationData = {
  userId: string;
  restaurants: NearbyRestaurant[];
  ratings: RatingRow[];
  prefs: CategoryPrefRow[];
};
