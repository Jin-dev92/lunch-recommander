import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInAnonymously: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
  signupSupabase: {
    auth: {
      signUp: vi.fn(),
    },
  },
}));

import { signupSupabase, supabase } from '../supabaseClient';
import { ensureSession, signIn, signUp } from './auth';

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const signInAnonymously = supabase.auth.signInAnonymously as ReturnType<typeof vi.fn>;
const signInWithPassword = supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>;
const signOut = supabase.auth.signOut as ReturnType<typeof vi.fn>;
const signupClientSignUp = signupSupabase.auth.signUp as ReturnType<typeof vi.fn>;

describe('인증 API', () => {
  beforeEach(() => {
    getSession.mockReset();
    signInAnonymously.mockReset();
    signInWithPassword.mockReset();
    signOut.mockReset();
    signupClientSignUp.mockReset();
  });

  it('로그인 요청에 CAPTCHA 토큰을 전달합니다', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: null });

    await signIn({
      email: 'user@example.com',
      password: 'password1',
      captchaToken: 'captcha-token',
    });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password1',
      options: { captchaToken: 'captcha-token' },
    });
  });

  it('세션이 없으면 CAPTCHA 토큰으로 익명 세션을 생성합니다', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    signInAnonymously.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    await ensureSession('captcha-token');

    expect(signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: 'captcha-token' },
    });
  });

  it('세션 확인 오류를 익명 세션 생성 오류로 가리지 않습니다', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: { message: '세션 확인 실패' },
    });

    await expect(ensureSession('captcha-token')).rejects.toMatchObject({
      message: '세션 확인 실패',
    });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('기존 익명 세션을 유지한 채 비영속 클라이언트로 가입합니다', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
      error: null,
    });
    signupClientSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    await signUp({
      email: 'user@example.com',
      password: 'password1',
      captchaToken: 'captcha-token',
      emailRedirectTo: 'https://example.com/',
    });

    expect(signupClientSignUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password1',
      options: {
        captchaToken: 'captcha-token',
        emailRedirectTo: 'https://example.com/',
      },
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('실사용자 세션에서는 회원가입하지 않습니다', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: false } } },
      error: null,
    });

    await expect(
      signUp({
        email: 'user@example.com',
        password: 'password1',
        captchaToken: 'captcha-token',
        emailRedirectTo: 'https://example.com/',
      }),
    ).rejects.toThrow('이미 로그인되어 있습니다.');
    expect(signupClientSignUp).not.toHaveBeenCalled();
  });
});
