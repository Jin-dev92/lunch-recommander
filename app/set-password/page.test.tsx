import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn(), updateUser: vi.fn() },
  },
}));
import { supabase } from '../../lib/supabaseClient';
import SetPasswordPage from './page';

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const updateUser = supabase.auth.updateUser as ReturnType<typeof vi.fn>;

describe('비밀번호 설정', () => {
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    getSession.mockReset();
    updateUser.mockReset();
    document.cookie = 'sb-session=; path=/; max-age=0';
    assign = vi.fn();
    // ponytail: jsdom의 window.location.assign은 non-configurable이라 vi.spyOn으로 못 덮어씀 → location 객체 자체를 교체
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign },
    });
  });

  it('초대 세션이 없으면 잘못된 진입을 안내합니다', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<SetPasswordPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('유효한 초대 링크로 접속해 주세요.');
  });

  it('익명 세션(초대 아님)이면 잘못된 진입을 안내합니다', async () => {
    // 로그인이 optional이라 방문자는 익명 세션을 가질 수 있다. 익명은 초대가 아니므로 막는다.
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'anon', is_anonymous: true } } },
    });
    render(<SetPasswordPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('유효한 초대 링크로 접속해 주세요.');
  });

  it('비밀번호 설정 성공 시 메인으로 이동합니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockResolvedValue({ error: null });
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'strong-password-1' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '비밀번호 설정' }).closest('form')!);
    // 초대 링크가 세운 실사용자 세션이 있으므로 재로그인 없이 바로 메인으로 보낸다.
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(updateUser).toHaveBeenCalledWith({ password: 'strong-password-1' });
  });

  it('비밀번호 설정에 실패하면 이동하지 않습니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockResolvedValue({ error: { message: '비밀번호가 너무 짧습니다.' } });
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'short' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '비밀번호 설정' }).closest('form')!);
    await screen.findByRole('alert');
    expect(assign).not.toHaveBeenCalled();
  });

  it('비밀번호 설정 오류를 alert로 표시합니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockResolvedValue({ error: { message: '비밀번호가 너무 짧습니다.' } });
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'short' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '비밀번호 설정' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('비밀번호가 너무 짧습니다.'),
    );
  });

  it('getSession이 예외를 던지면 로딩에 멈추지 않고 오류를 표시합니다', async () => {
    getSession.mockRejectedValue(new Error('network down'));
    render(<SetPasswordPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '초대 정보를 확인하지 못했습니다. 다시 시도해 주세요.',
    );
    expect(screen.queryByText('초대 정보를 확인하는 중입니다.')).not.toBeInTheDocument();
  });

  it('updateUser가 예외를 던지면 alert를 표시하고 버튼을 다시 활성화합니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockRejectedValue(new Error('network down'));
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'strong-password-1' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '비밀번호 설정' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '비밀번호 설정 중 오류가 발생했습니다. 다시 시도해 주세요.',
      ),
    );
    expect(screen.getByRole('button', { name: '비밀번호 설정' })).not.toBeDisabled();
  });

  it('성공 후에는 버튼이 비활성화되어 재제출할 수 없습니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockResolvedValue({ error: null });
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'strong-password-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 설정' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '비밀번호 설정' })).toBeDisabled();

    updateUser.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 설정' }));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('빈 비밀번호는 required로 인해 제출이 차단됩니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    render(<SetPasswordPage />);
    await screen.findByLabelText('새 비밀번호');
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 설정' }));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('비밀번호 입력에 minLength 8 제약이 걸려있습니다', async () => {
    // jsdom은 프로그래밍 방식 value 대입 시 "dirty value flag"를 세우지 않아
    // minlength 위반을 실제 폼 제출 차단으로 재현할 수 없다(HTML 표준 동작).
    // 그래서 제약이 실제로 선언돼 있는지를 속성으로 확인한다.
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    render(<SetPasswordPage />);
    const input = await screen.findByLabelText('새 비밀번호');
    expect(input).toHaveAttribute('minLength', '8');
  });

  it('제출 진행 중에는 중복 제출이 차단됩니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    let resolveUpdate: (value: { error: null }) => void;
    updateUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'strong-password-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 설정' }));
    const pendingButton = await screen.findByRole('button', { name: '설정 중…' });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설정 중…' }));
    expect(updateUser).toHaveBeenCalledTimes(1);
    resolveUpdate!({ error: null });
  });
});
