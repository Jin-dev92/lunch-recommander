import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));
import { supabase } from '../../lib/supabaseClient';
import LoginPage from './page';

const signInWithPassword = supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>;

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('이메일'), {
    target: { value: 'a@b.com' },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password1' },
  });
  fireEvent.submit(screen.getByRole('button', { name: '로그인' }).closest('form')!);
}

describe('로그인', () => {
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    signInWithPassword.mockReset();
    document.cookie = 'sb-session=; path=/; max-age=0';
    assign = vi.fn();
    // ponytail: jsdom의 window.location.assign은 non-configurable이라 vi.spyOn으로 못 덮어씀 → location 객체 자체를 교체
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign },
    });
  });

  it('이메일과 비밀번호 입력을 표시합니다', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('로그인 성공 시 세션 쿠키를 심고 이동합니다', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(document.cookie).toContain('sb-session=1');
  });

  it('로그인 실패 시 에러 메시지를 보여주고 이동하지 않습니다', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: '잘못된 비밀번호입니다' },
    });
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('잘못된 비밀번호입니다'),
    );
    expect(assign).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('sb-session=1');
  });
});
