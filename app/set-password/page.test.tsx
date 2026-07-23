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
  beforeEach(() => {
    getSession.mockReset();
    updateUser.mockReset();
  });

  it('초대 세션이 없으면 잘못된 진입을 안내합니다', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<SetPasswordPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '유효한 초대 링크로 접속해 주세요.',
    );
  });

  it('비밀번호 설정 성공 후 로그인 안내를 표시합니다', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    updateUser.mockResolvedValue({ error: null });
    render(<SetPasswordPage />);
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), {
      target: { value: 'strong-password-1' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '비밀번호 설정' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '비밀번호를 설정했습니다. 이제 로그인할 수 있습니다.',
      ),
    );
    expect(updateUser).toHaveBeenCalledWith({ password: 'strong-password-1' });
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
});
