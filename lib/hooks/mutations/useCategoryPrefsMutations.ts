'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { saveCategoryPref } from '../../api';
import { recommendQueryKeys } from '../queries';
import type { SaveCategoryPrefRequest } from '../../types/api';

// 카테고리 기호도 추천 점수의 입력이므로 recommend 도메인을 무효화한다.
export const useSaveCategoryPref = (
  options?: UseMutationOptions<void, Error, SaveCategoryPrefRequest>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: SaveCategoryPrefRequest) => saveCategoryPref(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recommendQueryKeys.all });
    },
    ...options,
  });
};
