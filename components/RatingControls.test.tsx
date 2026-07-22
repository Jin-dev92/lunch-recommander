import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));
import { supabase } from '../lib/supabaseClient';
import RatingControls from './RatingControls';

const from = supabase.from as ReturnType<typeof vi.fn>;

function mockRatings(
  existingScore: number | null | undefined = undefined,
  options: { lookupError?: unknown; upsertError?: unknown } = {}
) {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: options.upsertError ?? null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options.lookupError ? null : existingScore === undefined ? null : { score: existingScore },
    error: options.lookupError ?? null,
  });
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

  it('기존 평점이 0점(영구 제외)이면 스누즈해도 0점을 유지합니다', async () => {
    const { upsert } = mockRatings(0);
    render(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '1주간 그만 보기' }));
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    const call = upsert.mock.calls[0][0];
    expect(call.score).toBe(0);
    expect(call.snoozed_until).toBeTruthy();
  });

  it('점수 조회에 실패하면 upsert하지 않고 에러를 표시합니다', async () => {
    const { upsert } = mockRatings(undefined, { lookupError: { message: 'db error' } });
    render(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '1주간 그만 보기' }));
    await screen.findByRole('alert');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('평점 저장에 실패하면 에러를 표시합니다', async () => {
    mockRatings(undefined, { upsertError: { message: 'db error' } });
    render(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '3점' }));
    await screen.findByRole('alert');
  });
});
