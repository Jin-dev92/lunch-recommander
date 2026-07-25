import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  getCurrentUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  pathname: '/',
  reset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('../lib/api', () => ({
  ensureSession: mocks.ensureSession,
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

vi.mock('./AuthTurnstile', () => ({
  default: forwardRef<{ reset(): void }, { onTokenChange(token: string): void }>(
    function AuthTurnstileDouble({ onTokenChange }, ref) {
      useImperativeHandle(ref, () => ({ reset: mocks.reset }));
      return <button onClick={() => onTokenChange('captcha-token')}>CAPTCHA 확인</button>;
    },
  ),
}));

import AnonymousSessionGate from './AnonymousSessionGate';

describe('AnonymousSessionGate', () => {
  beforeEach(() => {
    mocks.pathname = '/';
    mocks.ensureSession.mockReset();
    mocks.getCurrentUser.mockReset();
    mocks.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.reset.mockReset();
  });

  it('기존 세션이 있으면 CAPTCHA 없이 화면을 표시합니다', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-id', isAnonymous: true });

    render(
      <AnonymousSessionGate>
        <p>추천 화면</p>
      </AnonymousSessionGate>,
    );

    expect(await screen.findByText('추천 화면')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CAPTCHA 확인' })).not.toBeInTheDocument();
  });

  it('로그인 경로에서는 익명 세션을 만들지 않습니다', async () => {
    mocks.pathname = '/login';

    render(
      <AnonymousSessionGate>
        <p>로그인 화면</p>
      </AnonymousSessionGate>,
    );

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.ensureSession).not.toHaveBeenCalled();
  });

  it('로그인 경로에서 홈으로 이동하면 CAPTCHA 확인 전 화면을 차단합니다', async () => {
    mocks.pathname = '/login';
    mocks.getCurrentUser.mockResolvedValue(null);
    const { rerender } = render(
      <AnonymousSessionGate>
        <p>현재 화면</p>
      </AnonymousSessionGate>,
    );
    expect(await screen.findByText('현재 화면')).toBeInTheDocument();

    mocks.pathname = '/';
    rerender(
      <AnonymousSessionGate>
        <p>현재 화면</p>
      </AnonymousSessionGate>,
    );

    expect(screen.queryByText('현재 화면')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'CAPTCHA 확인' })).toBeInTheDocument();
  });

  it('신규 방문자는 CAPTCHA 검증 후 익명 세션으로 진입합니다', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.ensureSession.mockResolvedValue(undefined);

    render(
      <AnonymousSessionGate>
        <p>추천 화면</p>
      </AnonymousSessionGate>,
    );

    expect(await screen.findByText('보안 확인 중…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CAPTCHA 확인' }));

    await waitFor(() => expect(mocks.ensureSession).toHaveBeenCalledWith('captcha-token'));
    expect(await screen.findByText('추천 화면')).toBeInTheDocument();
  });

  it('익명 세션 생성 실패 시 오류와 재시도를 표시합니다', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.ensureSession.mockRejectedValue(new Error('세션 생성 실패'));

    render(
      <AnonymousSessionGate>
        <p>추천 화면</p>
      </AnonymousSessionGate>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'CAPTCHA 확인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('세션 생성 실패');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(mocks.reset).toHaveBeenCalledOnce();
  });

  it('로그아웃으로 세션이 사라지면 CAPTCHA 검증을 다시 요구합니다', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-id', isAnonymous: false });
    let authListener: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => {
      authListener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(
      <AnonymousSessionGate>
        <p>추천 화면</p>
      </AnonymousSessionGate>,
    );
    expect(await screen.findByText('추천 화면')).toBeInTheDocument();

    authListener?.('SIGNED_OUT', null);

    expect(await screen.findByRole('button', { name: 'CAPTCHA 확인' })).toBeInTheDocument();
  });
});
