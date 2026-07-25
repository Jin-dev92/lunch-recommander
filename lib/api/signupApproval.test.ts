import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { supabase } from '../supabaseClient';
import { decideSignupApproval, getSignupApproval } from './signupApproval';

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

describe('관리자 회원가입 승인 API', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('토큰으로 승인 요청 정보를 조회합니다', async () => {
    invoke.mockResolvedValue({
      data: { email: 'guest@example.com', status: 'pending' },
      error: null,
    });

    await expect(getSignupApproval('token-1')).resolves.toEqual({
      email: 'guest@example.com',
      status: 'pending',
    });
    expect(invoke).toHaveBeenCalledWith('approve-signup', {
      body: { token: 'token-1', action: 'info' },
    });
  });

  it('승인 요청 조회 응답이 비어 있으면 오류로 처리합니다', async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await expect(getSignupApproval('token-1')).rejects.toThrow('알 수 없는 오류가 발생했습니다.');
  });

  it('승인 결정을 제출합니다', async () => {
    invoke.mockResolvedValue({ data: { alreadyRegistered: false }, error: null });

    await expect(decideSignupApproval({ token: 'token-1', action: 'approve' })).resolves.toEqual({
      alreadyRegistered: false,
    });
    expect(invoke).toHaveBeenCalledWith('approve-signup', {
      body: { token: 'token-1', action: 'approve' },
    });
  });

  it('승인 결정 성공 응답이 비어 있어도 빈 결과로 정규화합니다', async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await expect(decideSignupApproval({ token: 'token-1', action: 'reject' })).resolves.toEqual({});
  });

  it('승인 결정 오류를 예외로 승격합니다', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: '승인 실패' } });

    await expect(decideSignupApproval({ token: 'token-1', action: 'approve' })).rejects.toThrow(
      '승인 실패',
    );
  });
});
