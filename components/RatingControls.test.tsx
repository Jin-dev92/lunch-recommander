import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));
import { supabase } from '../lib/supabaseClient';
import RatingControls from './RatingControls';

const from = supabase.from as ReturnType<typeof vi.fn>;

function mockRatings(existingScore: number | null | undefined = undefined) {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingScore === undefined ? null : { score: existingScore }, error: null });
  const chain: { eq: ReturnType<typeof vi.fn>; maybeSingle: typeof maybeSingle } = { eq: vi.fn(), maybeSingle };
  chain.eq.mockReturnValue(chain);
  from.mockImplementation(() => ({ upsert, select: vi.fn().mockReturnValue(chain) }));
  return { upsert, maybeSingle };
}

describe('평점 저장', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it.each([0, 1, 2, 3, 4, 5])('%i점 버튼을 누르면 해당 점수로 upsert됩니다', async (score) => {
    const { upsert } = mockRatings();
    render(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: `${score}점` }));
    await vi.waitFor(() =>
      expect(upsert).toHaveBeenCalledWith({ user_id: 'me', place_id: 'p1', score }, { onConflict: 'user_id,place_id' })
    );
  });

  it('스누즈를 누르면 기존 점수를 보존하며 snoozed_until을 7일 뒤로 설정합니다', async () => {
    const { upsert } = mockRatings(5);
    render(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '1주간 그만 보기' }));
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    const call = upsert.mock.calls[0][0];
    expect(call.score).toBe(5);
    const diffMs = new Date(call.snoozed_until).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 5000);
    expect(diffMs).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 5000);
  });

  it('기존 평점 행이 없으면 중립 기준인 3점으로 스누즈합니다', async () => {
    const { upsert } = mockRatings(undefined);
    render(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '1주간 그만 보기' }));
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0].score).toBe(3);
  });
});
