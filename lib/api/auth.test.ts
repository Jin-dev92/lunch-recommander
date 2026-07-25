import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

import { supabase } from '../supabaseClient';
import { hasInviteSession, updatePassword } from './auth';

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const updateUser = supabase.auth.updateUser as ReturnType<typeof vi.fn>;

describe('인증 API', () => {
  beforeEach(() => {
    getSession.mockReset();
    updateUser.mockReset();
  });

  it('비익명 세션만 초대 세션으로 인정합니다', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: false } } },
      error: null,
    });

    await expect(hasInviteSession()).resolves.toBe(true);
  });

  it('세션이 없으면 초대 세션으로 인정하지 않습니다', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(hasInviteSession()).resolves.toBe(false);
  });

  it('익명 세션은 초대 세션으로 인정하지 않습니다', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
      error: null,
    });

    await expect(hasInviteSession()).resolves.toBe(false);
  });

  it('비밀번호 변경 오류를 예외로 승격합니다', async () => {
    updateUser.mockResolvedValue({ error: { message: '변경 실패' } });

    await expect(updatePassword({ password: 'strong-password-1' })).rejects.toThrow('변경 실패');
  });
});
