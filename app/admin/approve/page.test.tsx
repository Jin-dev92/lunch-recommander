import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=token-1'),
}));

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '../../../lib/supabaseClient';
import ApprovePage from './page';

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

describe('관리자 회원가입 승인', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('요청 이메일과 상태를 표시합니다', async () => {
    invoke.mockResolvedValue({ data: { email: 'guest@example.com', status: 'pending' }, error: null });

    render(<ApprovePage />);

    expect(await screen.findByText('guest@example.com')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('approve-signup', {
      body: { token: 'token-1', action: 'info' },
    });
  });

  it('요청 정보를 불러오는 동안 공통 스피너를 보여줍니다', async () => {
    invoke.mockReturnValue(new Promise(() => {}));

    render(<ApprovePage />);

    expect(await screen.findByRole('status')).toHaveTextContent('요청 정보를 확인하고 있습니다…');
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it.each([
    ['승인', 'approve', '승인 완료'],
    ['거절', 'reject', '거절 완료'],
  ])('%s 버튼이 결과를 표시하고 재제출을 막습니다', async (button, action, result) => {
    invoke
      .mockResolvedValueOnce({ data: { email: 'guest@example.com', status: 'pending' }, error: null })
      .mockResolvedValueOnce({
        data: { status: action === 'approve' ? 'approved' : 'rejected' },
        error: null,
      });

    render(<ApprovePage />);
    const clicked = await screen.findByRole('button', { name: button });
    fireEvent.click(clicked);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(result));
    expect(invoke).toHaveBeenNthCalledWith(2, 'approve-signup', {
      body: { token: 'token-1', action },
    });

    // 성공 후 버튼이 사라져 재제출이 불가능해야 한다
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('만료·무효 토큰 안내를 표시합니다', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: '만료되었거나 유효하지 않은 요청입니다.' },
    });

    render(<ApprovePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '만료되었거나 유효하지 않은 요청입니다.',
    );
    expect(invoke).toHaveBeenCalledWith('approve-signup', {
      body: { token: 'token-1', action: 'info' },
    });
  });
});
