'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { saveRating, snoozeRating } from '../../api';
import { recommendQueryKeys } from '../queries';
import type { SaveRatingRequest, SnoozeRatingRequest } from '../../types/api';

// 평점·스누즈는 자체 조회 화면이 없고, 추천 후보 계산의 입력으로만 쓰인다.
// 그래서 무효화 대상은 ratings가 아니라 recommend 도메인이다.

export const useSaveRating = (options?: UseMutationOptions<void, Error, SaveRatingRequest>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: SaveRatingRequest) => saveRating(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recommendQueryKeys.all });
    },
    ...options,
  });
};

export const useSnoozeRating = (options?: UseMutationOptions<void, Error, SnoozeRatingRequest>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: SnoozeRatingRequest) => snoozeRating(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recommendQueryKeys.all });
    },
    ...options,
  });
};
