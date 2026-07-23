'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { createGroup, joinGroupByCode } from '../../api';
import { recommendQueryKeys } from '../queries';
import type { CreateGroupRequest, JoinGroupRequest } from '../../types/api';

/** 성공 시 초대코드를 돌려준다. 화면 표시는 소비 컴포넌트가 mutate의 onSuccess에서 처리한다. */
export const useCreateGroup = (options?: UseMutationOptions<string, Error, CreateGroupRequest>) =>
  useMutation({
    mutationFn: (req: CreateGroupRequest) => createGroup(req),
    ...options,
  });

// 그룹이 바뀌면 그룹 평균 점수가 달라지므로 추천 데이터를 다시 받아야 한다.
export const useJoinGroup = (options?: UseMutationOptions<void, Error, JoinGroupRequest>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: JoinGroupRequest) => joinGroupByCode(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recommendQueryKeys.all });
    },
    ...options,
  });
};
