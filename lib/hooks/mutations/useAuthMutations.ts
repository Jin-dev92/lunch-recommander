'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { requestSignup, signIn, signOut, updatePassword } from '../../api';
import type { SignInRequest, SignupRequest, UpdatePasswordRequest } from '../../types/api';

// 로그인/로그아웃은 "누가 보고 있는가"를 바꾸므로 캐시된 서버 상태를 전부 버린다.
// 쿠키 설정·화면 이동 같은 UI 후처리는 소비 컴포넌트의 onSuccess가 담당한다.

export const useSignIn = (options?: UseMutationOptions<void, Error, SignInRequest>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: SignInRequest) => signIn(req),
    onSuccess: () => {
      queryClient.clear();
    },
    ...options,
  });
};

/** 성공 시 서버가 준 안내 문구를 data로 돌려준다. 로그인 상태를 바꾸지 않으므로 캐시는 그대로 둔다. */
export const useRequestSignup = (options?: UseMutationOptions<string, Error, SignupRequest>) =>
  useMutation({
    mutationFn: (req: SignupRequest) => requestSignup(req),
    ...options,
  });

export const useUpdatePassword = (
  options?: UseMutationOptions<void, Error, UpdatePasswordRequest>,
) =>
  useMutation({
    mutationFn: (request: UpdatePasswordRequest) => updatePassword(request),
    ...options,
  });

export const useSignOut = (options?: UseMutationOptions<void, Error, void>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      queryClient.clear();
    },
    ...options,
  });
};
