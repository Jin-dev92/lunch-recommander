'use client';

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { decideSignupApproval } from '../../api';
import type {
  SignupApprovalDecisionRequest,
  SignupApprovalDecisionResponse,
} from '../../types/api';

export const useDecideSignupApproval = (
  options?: UseMutationOptions<
    SignupApprovalDecisionResponse,
    Error,
    SignupApprovalDecisionRequest
  >,
) =>
  useMutation({
    mutationFn: (request: SignupApprovalDecisionRequest) => decideSignupApproval(request),
    ...options,
  });
