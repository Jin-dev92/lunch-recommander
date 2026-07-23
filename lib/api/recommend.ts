import { axiosInstance } from '../axiosInstance';
import { API_ROUTES, COLUMNS, TABLE } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type {
  CategoryPrefRow,
  NearbyResponse,
  RatingRow,
  RecommendationData,
  SearchLocation,
} from '../types/api';
import { getCurrentUserId } from './auth';
import { unwrap } from './unwrap';

/**
 * 추천 한 번에 필요한 원본 데이터를 모아 온다.
 * 주변 음식점은 과금·레이트리밋이 걸린 Edge Function을 지나므로 사용자가 요청할 때만 호출된다
 * (호출 시점 제어는 useRecommendationData의 `enabled: false`가 담당).
 */
export async function getRecommendationData(location: SearchLocation): Promise<RecommendationData> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error(MESSAGES.LOGIN_REQUIRED);

  const { data } = await axiosInstance.post<NearbyResponse>(API_ROUTES.NEARBY, location);

  // 평점과 카테고리 기호는 서로 의존하지 않으므로 병렬로 가져온다.
  // unwrap은 Promise.all 밖에서 호출해야 나머지 한쪽이 미처리 rejection이 되지 않는다.
  const [ratings, prefs] = await Promise.all([
    supabase.from(TABLE.RATINGS).select(COLUMNS.RATINGS),
    supabase.from(TABLE.CATEGORY_PREFS).select(COLUMNS.CATEGORY_PREFS),
  ]);

  return {
    userId,
    restaurants: data.restaurants ?? [],
    ratings: unwrap<RatingRow[]>(ratings) ?? [],
    prefs: unwrap<CategoryPrefRow[]>(prefs) ?? [],
  };
}
