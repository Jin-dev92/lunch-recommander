import { axiosInstance } from '../axiosInstance';
import { API_ROUTES, COLUMNS, TABLE } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type {
  CategoryPrefRow,
  GeocodeResponse,
  NearbyResponse,
  PlacePhotoResponse,
  RatingRow,
  RecommendationData,
  SearchLocation,
} from '../types/api';
import { getCurrentUser } from './auth';
import { unwrap } from './unwrap';

/**
 * 추천 한 번에 필요한 원본 데이터를 모아 온다.
 * 주변 음식점은 과금·레이트리밋이 걸린 Edge Function을 지나므로 사용자가 요청할 때만 호출된다
 * (호출 시점 제어는 useRecommendationData의 `enabled: false`가 담당).
 */
export async function getRecommendationData(location: SearchLocation): Promise<RecommendationData> {
  const user = await getCurrentUser();
  if (!user) throw new Error(MESSAGES.LOGIN_REQUIRED);

  const { data } = await axiosInstance.post<NearbyResponse>(API_ROUTES.NEARBY, location);
  const restaurants = data.restaurants ?? [];

  // 익명 사용자는 평점·기호가 없다(RLS도 익명 쓰기를 막는다). 그래서 개인화 데이터를 조회하지
  // 않고 구글 평점·거리만으로 추천한다. 불필요한 질의와 RLS 경계 처리를 아낀다.
  if (user.isAnonymous) {
    return { userId: user.id, restaurants, ratings: [], prefs: [] };
  }

  // 평점과 카테고리 기호는 서로 의존하지 않으므로 병렬로 가져온다.
  // unwrap은 Promise.all 밖에서 호출해야 나머지 한쪽이 미처리 rejection이 되지 않는다.
  const [ratings, prefs] = await Promise.all([
    supabase.from(TABLE.RATINGS).select(COLUMNS.RATINGS),
    supabase.from(TABLE.CATEGORY_PREFS).select(COLUMNS.CATEGORY_PREFS),
  ]);

  return {
    userId: user.id,
    restaurants,
    ratings: unwrap<RatingRow[]>(ratings) ?? [],
    prefs: unwrap<CategoryPrefRow[]>(prefs) ?? [],
  };
}

/**
 * 추천된 한 곳의 사진 URL을 가져온다. 사진 조회는 별도 과금(GetPhotoMedia)이라 20곳 전부가
 * 아니라 추천 결과에 대해서만, 그것도 photoName이 있을 때만 호출한다.
 */
export async function getPlacePhotoUri(photoName: string): Promise<string> {
  const { data } = await axiosInstance.post<PlacePhotoResponse>(API_ROUTES.PLACE_PHOTO, {
    photoName,
  });
  return data.photoUri;
}

/** 주소 문자열을 좌표로 변환한다. 지오코딩은 과금 대상이라 사용자가 검색할 때만 호출된다. */
export async function geocodeAddress(address: string): Promise<GeocodeResponse> {
  const { data } = await axiosInstance.post<GeocodeResponse>(API_ROUTES.GEOCODE, { address });
  return data;
}
