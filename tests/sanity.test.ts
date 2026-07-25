import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../lib/messages';

describe('프로젝트', () => {
  it('서비스 이름을 고정합니다', () => {
    expect(MESSAGES.APP_NAME).toBe('오늘 뭐먹지');
  });
});
