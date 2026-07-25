import { axiosInstance } from '../axiosInstance';
import { API_ROUTES } from '../constants';
import { MESSAGES } from '../messages';
import { signupSupabase, supabase } from '../supabaseClient';
import type {
  SignInRequest,
  SignupRequest,
  SignupRequestResponse,
  UpdatePasswordRequest,
} from '../types/api';
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
export async function ensureSession(captchaToken: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    assertNoError(
      await supabase.auth.signInAnonymously({
        options: { captchaToken },
      }),
    );
  }
}

export async function hasInviteSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return Boolean(data.session) && !data.session?.user.is_anonymous;
}

export async function signIn({ email, password, captchaToken }: SignInRequest): Promise<void> {
  assertNoError(
    await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    }),
  );
}

export async function signUp({
  email,
  password,
  captchaToken,
  emailRedirectTo,
}: SignupRequest): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session && !data.session.user.is_anonymous) {
    throw new Error(MESSAGES.ALREADY_LOGGED_IN);
  }

  assertNoError(
    await signupSupabase.auth.signUp({
      email,
      password,
      options: { captchaToken, emailRedirectTo },
    }),
  );
  return MESSAGES.SIGNUP_CONFIRM_EMAIL;
}

export async function updatePassword({ password }: UpdatePasswordRequest): Promise<void> {
  let result: Awaited<ReturnType<typeof supabase.auth.updateUser>>;
  try {
    result = await supabase.auth.updateUser({ password });
  } catch {
    throw new Error(MESSAGES.PASSWORD_UPDATE_FAILED);
  }
  assertNoError(result);
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
