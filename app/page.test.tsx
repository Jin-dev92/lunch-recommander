import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      signInAnonymously: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    rpc: vi.fn(),
  },
}));
// ponytail: 이 테스트는 헤더/로그아웃 흐름만 검증하므로 실제 위치 권한/지도 SDK를 타는 Map은 모킹
vi.mock('../components/Map', () => ({ default: () => null }));
import { supabase } from '../lib/supabaseClient';
import { renderWithQuery } from '../tests/renderWithQuery';
import HomePage from './page';

const signOut = supabase.auth.signOut as ReturnType<typeof vi.fn>;
const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const getUser = supabase.auth.getUser as ReturnType<typeof vi.fn>;
const signInAnonymously = supabase.auth.signInAnonymously as ReturnType<typeof vi.fn>;

function mockUser(isAnonymous: boolean) {
  getSession.mockResolvedValue({
    data: { session: { access_token: 't', user: { id: 'me', is_anonymous: isAnonymous } } },
  });
  getUser.mockResolvedValue({ data: { user: { id: 'me', is_anonymous: isAnonymous } } });
}

describe('홈 헤더', () => {
  beforeEach(() => {
    signOut.mockReset();
    getSession.mockReset();
    getUser.mockReset();
    signInAnonymously.mockReset().mockResolvedValue({ data: {}, error: null });
  });

  it('로그인한 사용자에게는 로그아웃 버튼을 보여줍니다', async () => {
    mockUser(false);
    renderWithQuery(<HomePage />);
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
  });

  it('로그인하지 않은 사용자에게는 로그인 링크를 보여줍니다', async () => {
    mockUser(true);
    renderWithQuery(<HomePage />);
    expect(await screen.findByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('세션이 없으면 익명 세션을 발급합니다', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    getUser.mockResolvedValue({ data: { user: { id: 'anon', is_anonymous: true } } });
    renderWithQuery(<HomePage />);
    await waitFor(() => expect(signInAnonymously).toHaveBeenCalled());
  });

  it('로그아웃하면 세션을 정리하고 오류 없이 진행합니다', async () => {
    mockUser(false);
    signOut.mockResolvedValue({ error: null });
    renderWithQuery(<HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('로그아웃 요청 중 공통 스피너를 보여줍니다', async () => {
    mockUser(false);
    signOut.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));

    const button = await screen.findByRole('button', { name: '로그아웃 중…' });
    expect(button).toBeDisabled();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('로그아웃 실패 시 에러 메시지를 보여줍니다', async () => {
    mockUser(false);
    signOut.mockResolvedValue({ error: { message: '로그아웃 실패' } });
    renderWithQuery(<HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('로그아웃 실패'));
  });
});
