import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('token=token-1'),
}));

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(() => Promise.reject(new Error('페이지의 직접 Supabase 접근'))),
    },
  },
}));

vi.mock('../../../lib/api', () => ({
  getSignupApproval: vi.fn(),
  decideSignupApproval: vi.fn(),
}));

import { decideSignupApproval, getSignupApproval } from '../../../lib/api';
import { renderWithQuery } from '../../../tests/renderWithQuery';
import ApprovePage from './page';

const getSignupApprovalMock = getSignupApproval as ReturnType<typeof vi.fn>;
const decideSignupApprovalMock = decideSignupApproval as ReturnType<typeof vi.fn>;

describe('관리자 회원가입 승인', () => {
  beforeEach(() => {
    getSignupApprovalMock.mockReset();
    decideSignupApprovalMock.mockReset();
  });

  it('요청 이메일과 상태를 표시합니다', async () => {
    getSignupApprovalMock.mockResolvedValue({
      email: 'guest@example.com',
      status: 'pending',
    });

    renderWithQuery(<ApprovePage />);

    expect(await screen.findByText('guest@example.com')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(getSignupApprovalMock).toHaveBeenCalledWith('token-1');
  });

  it('요청 정보를 불러오는 동안 공통 스피너를 보여줍니다', async () => {
    getSignupApprovalMock.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<ApprovePage />);

    expect(await screen.findByRole('status')).toHaveTextContent('요청 정보를 확인하고 있습니다…');
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it.each([
    ['승인', 'approve', '승인 완료'],
    ['거절', 'reject', '거절 완료'],
  ])('%s 버튼이 결과를 표시하고 재제출을 막습니다', async (button, action, result) => {
    getSignupApprovalMock.mockResolvedValue({
      email: 'guest@example.com',
      status: 'pending',
    });
    decideSignupApprovalMock.mockResolvedValue({});

    renderWithQuery(<ApprovePage />);
    const clicked = await screen.findByRole('button', { name: button });
    fireEvent.click(clicked);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(result));
    expect(decideSignupApprovalMock).toHaveBeenCalledWith({
      token: 'token-1',
      action,
    });

    // 성공 후 버튼이 사라져 재제출이 불가능해야 한다
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
    expect(decideSignupApprovalMock).toHaveBeenCalledTimes(1);
  });

  it('이미 가입된 사용자는 별도 안내를 표시합니다', async () => {
    getSignupApprovalMock.mockResolvedValue({
      email: 'member@example.com',
      status: 'pending',
    });
    decideSignupApprovalMock.mockResolvedValue({ alreadyRegistered: true });

    renderWithQuery(<ApprovePage />);
    fireEvent.click(await screen.findByRole('button', { name: '승인' }));

    expect(await screen.findByRole('status')).toHaveTextContent('이미 가입된 사용자입니다.');
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
  });

  it('승인 결정 실패 시 오류를 표시하고 다시 시도할 수 있습니다', async () => {
    getSignupApprovalMock.mockResolvedValue({
      email: 'guest@example.com',
      status: 'pending',
    });
    decideSignupApprovalMock.mockRejectedValue(new Error('승인 처리에 실패했습니다.'));

    renderWithQuery(<ApprovePage />);
    fireEvent.click(await screen.findByRole('button', { name: '승인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('승인 처리에 실패했습니다.');
    expect(screen.getByRole('button', { name: '승인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '거절' })).toBeEnabled();
  });

  it('만료·무효 토큰 안내를 표시합니다', async () => {
    getSignupApprovalMock.mockRejectedValue(new Error('만료되었거나 유효하지 않은 요청입니다.'));

    renderWithQuery(<ApprovePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '만료되었거나 유효하지 않은 요청입니다.',
    );
    expect(getSignupApprovalMock).toHaveBeenCalledWith('token-1');
  });
});
