import { describe, expect, it } from 'vitest';
import { snoozedUntilOneWeekFrom } from './snooze';
describe('스누즈', () => {
  it('현재 시각에서 정확히 7일 뒤를 반환합니다', () => {
    expect(snoozedUntilOneWeekFrom(new Date('2026-07-21T03:00:00Z'))).toBe(
      '2026-07-28T03:00:00.000Z',
    );
  });
});
