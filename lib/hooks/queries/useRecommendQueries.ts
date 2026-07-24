'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { getPlacePhotoUri, getRecommendationData } from '../../api';
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
  photo: (photoName: string | null) => ['recommend', API_ROUTES.PLACE_PHOTO, photoName] as const,
};

/**
 * 추천된 한 곳의 썸네일. photoName이 있을 때만 자동으로 한 번 호출한다(과금 대상이라 재시도는 끈다).
 * photoUri는 일정 시간 뒤 만료되므로 캐시를 짧게 유지한다.
 */
export const usePlacePhoto = (
  photoName: string | null,
  options?: Partial<UseQueryOptions<string>>,
) =>
  useQuery<string>({
    queryKey: recommendQueryKeys.photo(photoName),
    queryFn: () => getPlacePhotoUri(photoName!),
    enabled: Boolean(photoName),
    retry: false,
    staleTime: 1000 * 60 * 30,
    ...options,
  });

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
