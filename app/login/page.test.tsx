import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn() },
  },
}));
vi.mock('../../lib/axiosInstance', () => ({
  axiosInstance: { post: vi.fn() },
}));
import { axiosInstance } from '../../lib/axiosInstance';
import { supabase } from '../../lib/supabaseClient';
import { renderWithQuery } from '../../tests/renderWithQuery';
import LoginPage from './page';

const signInWithPassword = supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>;
const post = axiosInstance.post as ReturnType<typeof vi.fn>;

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
    post.mockReset();
    document.cookie = 'sb-session=; path=/; max-age=0';
    assign = vi.fn();
    // ponytail: jsdom의 window.location.assign은 non-configurable이라 vi.spyOn으로 못 덮어씀 → location 객체 자체를 교체
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign },
    });
  });

  it('이메일과 비밀번호 입력을 표시합니다', () => {
    renderWithQuery(<LoginPage />);
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('로그인 성공 시 세션 쿠키를 심고 이동합니다', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderWithQuery(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(document.cookie).toContain('sb-session=1');
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password1',
    });
  });

  it('로그인 실패 시 에러 메시지를 보여주고 이동하지 않습니다', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: '잘못된 비밀번호입니다' },
    });
    renderWithQuery(<LoginPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('잘못된 비밀번호입니다'),
    );
    expect(assign).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('sb-session=1');
  });

  it('회원가입 요청 성공 안내를 표시합니다', async () => {
    post.mockResolvedValue({ data: { message: '승인되면 메일로 안내됩니다' } });
    renderWithQuery(<LoginPage />);
    fireEvent.change(screen.getByLabelText('회원가입 요청 이메일'), {
      target: { value: 'guest@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '회원가입 요청' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('승인되면 메일로 안내됩니다'),
    );
    expect(post).toHaveBeenCalledWith('/signup-request', {
      email: 'guest@example.com',
    });
  });

  it('회원가입 요청 오류를 alert로 표시합니다', async () => {
    post.mockRejectedValue(new Error('요청 한도를 초과했습니다.'));
    renderWithQuery(<LoginPage />);
    fireEvent.change(screen.getByLabelText('회원가입 요청 이메일'), {
      target: { value: 'guest@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '회원가입 요청' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('요청 한도를 초과했습니다.'),
    );
  });
});
