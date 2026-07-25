import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type {
  SignupApprovalDecisionRequest,
  SignupApprovalDecisionResponse,
  SignupApprovalRequest,
} from '../types/api';
import { unwrap } from './unwrap';

const SIGNUP_APPROVAL_FUNCTION = 'approve-signup';

export async function getSignupApproval(token: string): Promise<SignupApprovalRequest> {
  const request = unwrap(
    await supabase.functions.invoke<SignupApprovalRequest>(SIGNUP_APPROVAL_FUNCTION, {
      body: { token, action: 'info' },
    }),
  );
  if (!request) throw new Error(MESSAGES.UNKNOWN_ERROR);
  return request;
}

export async function decideSignupApproval({
  token,
  action,
}: SignupApprovalDecisionRequest): Promise<SignupApprovalDecisionResponse> {
  const response = unwrap(
    await supabase.functions.invoke<SignupApprovalDecisionResponse>(SIGNUP_APPROVAL_FUNCTION, {
      body: { token, action },
    }),
  );
  return response ?? {};
}
