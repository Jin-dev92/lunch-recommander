import { MESSAGES } from '../messages';
import { signupSupabase, supabase } from '../supabaseClient';
import type { ResendSignupEmailRequest, SignInRequest, SignupRequest } from '../types/api';
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
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    assertNoError(
      await supabase.auth.signInAnonymously({
        options: { captchaToken },
      }),
    );
  }
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

export async function resendSignupEmail({
  email,
  captchaToken,
  emailRedirectTo,
}: ResendSignupEmailRequest): Promise<string> {
  assertNoError(
    await signupSupabase.auth.resend({
      type: 'signup',
      email,
      options: { captchaToken, emailRedirectTo },
    }),
  );
  return MESSAGES.SIGNUP_CONFIRM_EMAIL_RESENT;
}

export async function signOut(): Promise<void> {
  assertNoError(await supabase.auth.signOut());
}
