import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}));

import { createClient } from '@supabase/supabase-js';
import './supabaseClient';

describe('Supabase 클라이언트', () => {
  it('회원가입 전용 Auth 저장소를 기본 세션과 분리합니다', () => {
    expect(createClient).toHaveBeenNthCalledWith(
      2,
      undefined,
      undefined,
      expect.objectContaining({
        auth: expect.objectContaining({
          storageKey: 'lunch-recommender-signup-auth',
          persistSession: false,
        }),
      }),
    );
  });
});
