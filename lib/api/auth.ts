import { axiosInstance } from '../axiosInstance';
import { API_ROUTES } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type { SignInRequest, SignupRequest, SignupRequestResponse } from '../types/api';
import { assertNoError } from './unwrap';

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function signIn({ email, password }: SignInRequest): Promise<void> {
  assertNoError(await supabase.auth.signInWithPassword({ email, password }));
}

export async function signOut(): Promise<void> {
  assertNoError(await supabase.auth.signOut());
}

/** 관리자 승인 대기열에 가입 요청을 넣는다. 성공 시 사용자에게 보여줄 안내 문구를 돌려준다. */
export async function requestSignup({ email }: SignupRequest): Promise<string> {
  const { data } = await axiosInstance.post<SignupRequestResponse>(API_ROUTES.SIGNUP_REQUEST, {
    email,
  });
  return data.message ?? MESSAGES.SIGNUP_REQUEST_ACCEPTED;
}
