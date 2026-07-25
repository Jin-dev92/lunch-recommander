'use client';

import { useQuery } from '@tanstack/react-query';
import { getSignupApproval } from '../../api';

export const signupApprovalQueryKeys = {
  all: ['signup-approval'] as const,
  detail: (token: string) => [...signupApprovalQueryKeys.all, token] as const,
};

export const useSignupApproval = (token: string) =>
  useQuery({
    queryKey: signupApprovalQueryKeys.detail(token),
    queryFn: () => getSignupApproval(token),
    retry: false,
  });
