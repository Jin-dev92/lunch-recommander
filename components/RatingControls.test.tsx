import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));
import { supabase } from '../lib/supabaseClient';
import { renderWithQuery } from '../tests/renderWithQuery';
import RatingControls from './RatingControls';

const from = supabase.from as ReturnType<typeof vi.fn>;

function mockRatings(
  existingScore: number | null | undefined = undefined,
  options: { lookupError?: unknown; upsertError?: unknown } = {},
) {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: options.upsertError ?? null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options.lookupError
      ? null
      : existingScore === undefined
        ? null
        : { score: existingScore },
    error: options.lookupError ?? null,
  });
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: typeof maybeSingle;
  } = { eq: vi.fn(), maybeSingle };
  chain.eq.mockReturnValue(chain);
  from.mockImplementation(() => ({
    upsert,
    select: vi.fn().mockReturnValue(chain),
  }));
  return { upsert, maybeSingle };
}

describe('평점 저장', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it.each([1, 2, 3, 4, 5])('별 %i개를 누르면 해당 점수로 upsert됩니다', async (score) => {
    const { upsert } = mockRatings();
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: `${score}점` }));
    await vi.waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        { user_id: 'me', place_id: 'p1', score },
        { onConflict: 'user_id,place_id' },
      ),
    );
  });

  it('별점에는 0점 버튼이 없습니다', () => {
    mockRatings();
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    // 0점은 "별 0개"가 아니라 영구 제외라, 별에 섞으면 맛없음 표시로 오해된다.
    expect(screen.queryByRole('button', { name: '0점' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^[1-5]점$/ })).toHaveLength(5);
  });

  it('"다시 추천 안 함"은 확인을 받기 전에는 저장하지 않습니다', () => {
    const { upsert } = mockRatings();
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '다시 추천 안 함' }));
    // 되돌릴 수 없는 동작이라 경고 대화가 먼저 뜨고, 이 단계에서 저장은 없어야 한다.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('취소하면 대화가 닫히고 저장하지 않습니다', async () => {
    const { upsert } = mockRatings();
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '다시 추천 안 함' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('확인하면 0점(영구 제외)으로 저장하고 다음 추천을 요청합니다', async () => {
    const { upsert } = mockRatings();
    const onExclude = vi.fn();
    renderWithQuery(<RatingControls placeId="p1" userId="me" onExclude={onExclude} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 추천 안 함' }));
    fireEvent.click(screen.getByRole('button', { name: '제외하기' }));
    await vi.waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        { user_id: 'me', place_id: 'p1', score: 0 },
        { onConflict: 'user_id,place_id' },
      ),
    );
    // 저장이 끝난 뒤에만 다음 추천을 띄운다.
    await vi.waitFor(() => expect(onExclude).toHaveBeenCalledTimes(1));
  });

  it('기존 평점을 별의 채움 상태로 반영합니다', () => {
    mockRatings();
    renderWithQuery(<RatingControls placeId="p1" userId="me" currentScore={3} />);
    expect(screen.getByRole('button', { name: '3점' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '4점' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('스누즈를 누르면 기존 점수를 보존하며 snoozed_until을 7일 뒤로 설정합니다', async () => {
    const { upsert } = mockRatings(5);
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
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
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '1주간 그만 보기' }));
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0].score).toBe(3);
  });

  it('기존 평점이 0점(영구 제외)이면 스누즈해도 0점을 유지합니다', async () => {
    const { upsert } = mockRatings(0);
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '1주간 그만 보기' }));
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    const call = upsert.mock.calls[0][0];
    expect(call.score).toBe(0);
    expect(call.snoozed_until).toBeTruthy();
  });

  it('점수 조회에 실패하면 upsert하지 않고 에러를 표시합니다', async () => {
    const { upsert } = mockRatings(undefined, {
      lookupError: { message: 'db error' },
    });
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '1주간 그만 보기' }));
    await screen.findByRole('alert');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('평점 저장에 실패하면 에러를 표시합니다', async () => {
    mockRatings(undefined, { upsertError: { message: 'db error' } });
    renderWithQuery(<RatingControls placeId="p1" userId="me" />);
    fireEvent.click(screen.getByRole('button', { name: '3점' }));
    await screen.findByRole('alert');
  });
});
