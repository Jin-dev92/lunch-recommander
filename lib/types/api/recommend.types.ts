// @see Edge Function 스펙: POST /functions/v1/nearby (supabase/functions/nearby/index.ts)
import type { CategoryPrefRow } from './categoryPrefs.types';
import type { RatingRow } from './ratings.types';

/** 지도에서 고른 검색 위치. 반경은 Edge Function이 허용하는 두 값만 받는다. */
export type SearchLocation = { lat: number; lng: number; radius: 500 | 1000 };

export type NearbyRestaurant = {
  placeId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  googleRating: number | null;
  googleRatingsTotal: number;
  distanceMeters: number;
};

export type NearbyResponse = {
  restaurants: NearbyRestaurant[];
  source: 'cache' | 'google';
};

/** 추천 한 번에 필요한 원본 데이터 묶음. 점수 계산·추첨은 lib/recommend.ts가 담당한다. */
export type RecommendationData = {
  userId: string;
  restaurants: NearbyRestaurant[];
  ratings: RatingRow[];
  prefs: CategoryPrefRow[];
};
