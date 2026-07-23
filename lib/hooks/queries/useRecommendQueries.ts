'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getRecommendationData } from '../../api';
import { API_ROUTES } from '../../constants';
import type { RecommendationData, SearchLocation } from '../../types/api';

export const recommendQueryKeys = {
  all: ['recommend'] as const,
  byLocation: (location: SearchLocation | null) =>
    [
      'recommend',
      API_ROUTES.NEARBY,
      location?.lat ?? null,
      location?.lng ?? null,
      location?.radius ?? null,
    ] as const,
};

/**
 * 주변 음식점 조회는 Google Places 과금과 서버 레이트리밋이 걸려 있어 자동으로 돌면 안 된다.
 * 그래서 `enabled: false`로 두고, 사용자가 추천 버튼을 누를 때 refetch()로만 호출한다.
 */
export const useRecommendationData = (
  location: SearchLocation | null,
  options?: Partial<UseQueryOptions<RecommendationData>>,
) =>
  useQuery<RecommendationData>({
    queryKey: recommendQueryKeys.byLocation(location),
    queryFn: () => getRecommendationData(location!),
    enabled: false,
    retry: false,
    ...options,
  });
