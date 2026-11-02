// @see Edge Function 스펙: POST /functions/v1/nearby (supabase/functions/nearby/index.ts)
import { FOOD_CATEGORY, type FoodCategory } from '../../constants';
import type { MapProvider } from '../../region';
import type { CategoryPrefRow } from './categoryPrefs.types';
import type { RatingRow } from './ratings.types';

/** 지도에서 고른 검색 위치. 반경은 Edge Function이 허용하는 네 값만 받는다. */
export type SearchLocation = { lat: number; lng: number; radius: 100 | 300 | 500 | 1000 };

/**
 * 추천 후보를 좁히는 조건. 카카오 로컬 API에는 평점·리뷰 수가 없어 음식 종류로만 좁힌다.
 * 개인 별점은 필터가 아니라 scoreCandidate의 점수 항으로 반영된다.
 */
export type RecommendationCriteria = { category: FoodCategory };
export const DEFAULT_RECOMMENDATION_CRITERIA: RecommendationCriteria = {
  category: FOOD_CATEGORY.ALL,
};

export type NearbyRestaurant = {
  /** 제공자가 준 장소 식별자. 카카오는 숫자 문자열, Google은 ChIJ로 시작해 형식이 겹치지 않는다. */
  placeId: string;
  /** 이 장소를 어느 제공자에서 받았는지. 좌표가 국내면 kakao, 해외면 google이다. */
  provider: MapProvider;
  name: string;
  /**
   * 한국어 음식 종류("한식"). 선호 가중치의 저장 키이자 음식 종류 필터의 기준이다.
   * 카카오는 category_name("음식점 > 한식 > 육류,고기")의 2단계 값을 쓰고,
   * Google은 primaryType("korean_restaurant")을 같은 한국어 값으로 매핑해 저장한다.
   * 덕분에 국내에서 쌓은 카테고리 선호가 해외에서도 그대로 적용된다.
   */
  category: string;
  /** 더 구체적인 표시용 라벨("육류,고기"). 화면 표시 전용이며 저장 키로 쓰지 않는다. */
  categoryLabel: string;
  /** 사람이 읽는 주소. 좌표만으로 위치를 알기 어려워 함께 보관한다. */
  address: string | null;
  lat: number;
  lng: number;
  /** 장소 상세 페이지. 사진·메뉴·리뷰·영업시간을 여기서 볼 수 있다. */
  placeUrl: string;
  /** Google 평균 평점. 카카오 로컬 API에는 평점이 없어 국내 결과는 항상 null이다. */
  googleRating: number | null;
  /** Google 리뷰 수. 국내 결과는 항상 0이다. */
  googleRatingsTotal: number;
  /** Google priceLevel 열거형. 실제 가격이 아니라 4단계 등급이며 국내 결과는 항상 null이다. */
  priceLevel: string | null;
  distanceMeters: number;
};

export type NearbyResponse = {
  restaurants: NearbyRestaurant[];
  source: 'cache' | MapProvider;
};

/**
 * @see POST /functions/v1/geocode
 * 지오코딩은 검색어만 있고 좌표가 없는 시점에 호출되므로 지역 판정을 쓸 수 없다.
 * near(현재 지도 중심)를 함께 보내 서버가 국내/해외 provider를 고른다.
 */
export type GeocodeRequest = { address: string; near: { lat: number; lng: number } };
export type GeocodeResponse = { lat: number; lng: number };

/** 추천 한 번에 필요한 원본 데이터 묶음. 점수 계산·추첨은 lib/recommend.ts가 담당한다. */
export type RecommendationData = {
  userId: string;
  restaurants: NearbyRestaurant[];
  ratings: RatingRow[];
  prefs: CategoryPrefRow[];
};
