import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));
// ponytail: 이 테스트는 로그아웃 흐름만 검증하므로 실제 위치 권한/지도 SDK를 타는 Map은 모킹
vi.mock('../components/Map', () => ({ default: () => null }));
import { supabase } from '../lib/supabaseClient';
import HomePage from './page';

const signOut = supabase.auth.signOut as ReturnType<typeof vi.fn>;

describe('로그아웃', () => {
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    signOut.mockReset();
    document.cookie = 'sb-session=1; path=/';
    assign = vi.fn();
    // ponytail: jsdom의 window.location.assign은 non-configurable이라 vi.spyOn으로 못 덮어씀 → location 객체 자체를 교체
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign },
    });
  });

  it('성공 시 세션 쿠키를 지우고 로그인 페이지로 이동합니다', async () => {
    signOut.mockResolvedValue({ error: null });
    render(<HomePage />);
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
    expect(document.cookie).not.toContain('sb-session=1');
  });

  it('실패 시 에러 메시지를 보여주고 이동하지 않습니다', async () => {
    signOut.mockResolvedValue({ error: { message: '로그아웃 실패' } });
    render(<HomePage />);
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('로그아웃 실패'));
    expect(assign).not.toHaveBeenCalled();
    expect(document.cookie).toContain('sb-session=1');
  });

  it('그룹 관리 화면으로 이동하는 링크를 보여줍니다', () => {
    render(<HomePage />);
    expect(screen.getByRole('link', { name: '그룹 관리' })).toHaveAttribute('href', '/groups');
  });
});
