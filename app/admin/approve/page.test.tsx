import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=token-1'),
}));

import ApprovePage from './page';

describe('관리자 회원가입 승인', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('요청 이메일과 상태를 표시합니다', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ email: 'guest@example.com', status: 'pending' }),
    );

    render(<ApprovePage />);

    expect(await screen.findByText('guest@example.com')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it.each([
    ['승인', 'approve', '승인 완료'],
    ['거절', 'reject', '거절 완료'],
  ])('%s 버튼이 POST 후 결과를 표시합니다', async (button, action, result) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ email: 'guest@example.com', status: 'pending' }))
      .mockResolvedValueOnce(
        Response.json({ status: action === 'approve' ? 'approved' : 'rejected' }),
      );

    render(<ApprovePage />);
    fireEvent.click(await screen.findByRole('button', { name: button }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(result));
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ token: 'token-1', action }),
    });
  });

  it('만료·무효 토큰 안내를 표시합니다', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: '만료되었거나 유효하지 않은 요청입니다.' }, { status: 410 }),
    );

    render(<ApprovePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '만료되었거나 유효하지 않은 요청입니다.',
    );
  });
});
