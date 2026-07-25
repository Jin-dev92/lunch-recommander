import { createElement, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api', () => ({
  resendSignupEmail: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

import { resendSignupEmail, signUp } from '../../api';
import { useResendSignupEmail, useSignUp } from './useAuthMutations';

const resendSignupEmailMock = resendSignupEmail as ReturnType<typeof vi.fn>;
const signUpMock = signUp as ReturnType<typeof vi.fn>;

describe('인증 뮤테이션', () => {
  beforeEach(() => {
    resendSignupEmailMock.mockReset();
    signUpMock.mockReset();
  });

  it('이메일 가입 결과를 반환하고 캐시를 비웁니다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData(['current-user'], { id: 'anonymous-user' });
    signUpMock.mockResolvedValue('인증 메일을 확인해 주세요.');
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useSignUp(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          email: 'user@example.com',
          password: 'password1',
          captchaToken: 'captcha-token',
          emailRedirectTo: 'https://example.com/',
        }),
      ).resolves.toBe('인증 메일을 확인해 주세요.');
    });

    expect(queryClient.getQueryData(['current-user'])).toBeUndefined();
  });

  it('인증 메일을 재전송하고 기존 캐시는 유지합니다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData(['current-user'], { id: 'anonymous-user' });
    resendSignupEmailMock.mockResolvedValue('인증 메일을 다시 보냈습니다.');
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useResendSignupEmail(), { wrapper });
    const request = {
      email: 'user@example.com',
      captchaToken: 'captcha-token',
      emailRedirectTo: 'https://example.com/',
    };

    await act(async () => {
      await expect(result.current.mutateAsync(request)).resolves.toBe(
        '인증 메일을 다시 보냈습니다.',
      );
    });

    expect(resendSignupEmailMock).toHaveBeenCalledWith(request);
    expect(queryClient.getQueryData(['current-user'])).toEqual({ id: 'anonymous-user' });
  });
});
