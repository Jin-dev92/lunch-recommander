import { axiosInstance } from '../axiosInstance';
import { API_ROUTES } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type { SignInRequest, SignupRequest, SignupRequestResponse } from '../types/api';
import { assertNoError } from './unwrap';

export type CurrentUser = { id: string; isAnonymous: boolean };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, isAnonymous: Boolean(data.user.is_anonymous) };
}

/**
 * 세션이 없으면 익명 세션을 만든다. 로그인은 optional이지만 유료인 nearby 호출은 JWT 뒤에
 * 두어야 하므로, 방문자마다 익명 JWT를 발급해 인증·레이트리밋을 그대로 유지한다.
 */
export async function ensureSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) await supabase.auth.signInAnonymously();
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
