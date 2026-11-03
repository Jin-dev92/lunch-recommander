// @see Edge Function 스펙: POST /functions/v1/nearby (supabase/functions/nearby/index.ts)
import type { CategoryPrefRow } from './categoryPrefs.types';
import type { RatingRow } from './ratings.types';

/** 지도에서 고른 검색 위치. 반경은 Edge Function이 허용하는 네 값만 받는다. */
export type SearchLocation = { lat: number; lng: number; radius: 100 | 300 | 500 | 1000 };

export type NearbyRestaurant = {
  /** 카카오 장소 식별자(로컬 API의 documents[].id). */
  placeId: string;
  name: string;
  /**
   * 카카오 category_name("음식점 > 한식 > 육류,고기")의 2단계 값("한식").
   * 선호 가중치의 저장 키이자 음식 종류 필터의 기준이라 표기가 바뀌지 않는 값을 쓴다.
   */
  category: string;
  /** category_name의 마지막 단계("육류,고기"). 화면 표시 전용이며 저장 키로 쓰지 않는다. */
  categoryLabel: string;
  /** 카카오 road_address_name(없으면 address_name). 좌표만으로 위치를 알기 어려워 함께 보관한다. */
  address: string | null;
  lat: number;
  lng: number;
  /** 카카오맵 장소 상세 페이지(place_url). 사진·메뉴·리뷰·영업시간을 여기서 볼 수 있다. */
  placeUrl: string;
  distanceMeters: number;
};

export type NearbyResponse = {
  restaurants: NearbyRestaurant[];
  source: 'cache' | 'kakao';
};

/** @see POST /functions/v1/geocode */
export type GeocodeRequest = { address: string };
export type GeocodeResponse = { lat: number; lng: number };

/** 추천 한 번에 필요한 원본 데이터 묶음. 점수 계산·추첨은 lib/recommend.ts가 담당한다. */
export type RecommendationData = {
  userId: string;
  restaurants: NearbyRestaurant[];
  ratings: RatingRow[];
  prefs: CategoryPrefRow[];
};
