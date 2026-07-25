import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInAnonymously: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
    },
  },
  signupSupabase: {
    auth: {
      signUp: vi.fn(),
    },
  },
}));

import { signupSupabase, supabase } from '../supabaseClient';
import { ensureSession, hasInviteSession, signIn, signUp, updatePassword } from './auth';

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const signInAnonymously = supabase.auth.signInAnonymously as ReturnType<typeof vi.fn>;
const signInWithPassword = supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>;
const signOut = supabase.auth.signOut as ReturnType<typeof vi.fn>;
const signupClientSignUp = signupSupabase.auth.signUp as ReturnType<typeof vi.fn>;
const updateUser = supabase.auth.updateUser as ReturnType<typeof vi.fn>;

describe('인증 API', () => {
  beforeEach(() => {
    getSession.mockReset();
    signInAnonymously.mockReset();
    signInWithPassword.mockReset();
    signOut.mockReset();
    signupClientSignUp.mockReset();
    updateUser.mockReset();
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

  it('비익명 세션만 초대 세션으로 인정합니다', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: false } } },
      error: null,
    });

    await expect(hasInviteSession()).resolves.toBe(true);
  });

  it('세션이 없으면 초대 세션으로 인정하지 않습니다', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(hasInviteSession()).resolves.toBe(false);
  });

  it('익명 세션은 초대 세션으로 인정하지 않습니다', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
      error: null,
    });

    await expect(hasInviteSession()).resolves.toBe(false);
  });

  it('비밀번호 변경 오류를 예외로 승격합니다', async () => {
    updateUser.mockResolvedValue({ error: { message: '변경 실패' } });

    await expect(updatePassword({ password: 'strong-password-1' })).rejects.toThrow('변경 실패');
  });

  it('새 비밀번호를 Supabase Auth에 전달합니다', async () => {
    updateUser.mockResolvedValue({ error: null });

    await updatePassword({ password: 'strong-password-1' });

    expect(updateUser).toHaveBeenCalledWith({ password: 'strong-password-1' });
  });

  it('비밀번호 변경 요청 자체가 실패하면 기존 대체 문구를 사용합니다', async () => {
    updateUser.mockRejectedValue(new Error('network down'));

    await expect(updatePassword({ password: 'strong-password-1' })).rejects.toThrow(
      '비밀번호 설정 중 오류가 발생했습니다. 다시 시도해 주세요.',
    );
  });
});
