import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn(), getSession: vi.fn() },
    from: vi.fn(),
  },
}));
vi.mock('../lib/axiosInstance', () => ({
  axiosInstance: { post: vi.fn() },
}));
import { axiosInstance } from '../lib/axiosInstance';
import { supabase } from '../lib/supabaseClient';
import { renderWithQuery } from '../tests/renderWithQuery';
import Recommend from './Recommend';

const getUser = supabase.auth.getUser as ReturnType<typeof vi.fn>;
const post = axiosInstance.post as ReturnType<typeof vi.fn>;
const from = supabase.from as ReturnType<typeof vi.fn>;

const location = { lat: 37, lng: 127, radius: 500 as const };
const restaurant = {
  placeId: 'p1',
  name: '식당',
  category: '한식',
  lat: 37,
  lng: 127,
  googleRating: 4,
  googleRatingsTotal: 10,
  distanceMeters: 50,
};

function mockNearby(restaurants: unknown[]) {
  return { data: { restaurants, source: 'cache' } };
}

function mockTables(
  ratings: unknown[] = [],
  prefs: unknown[] = [],
  ratingsError: unknown = null,
  prefsError: unknown = null,
) {
  from.mockImplementation((table: string) => ({
    select: vi
      .fn()
      .mockResolvedValue(
        table === 'ratings'
          ? { data: ratings, error: ratingsError }
          : { data: prefs, error: prefsError },
      ),
  }));
}

describe('추천 실행', () => {
  beforeEach(() => {
    getUser.mockReset();
    post.mockReset();
    from.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  });

  it('추천 버튼을 누르면 음식점 이름과 카테고리, 거리를 보여줍니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    expect(screen.getByText('한식 · 50m')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/nearby', location);
  });

  it('위치가 없으면 버튼이 비활성화됩니다', () => {
    renderWithQuery(<Recommend location={null} />);
    expect(screen.getByRole('button', { name: '한 곳 추천' })).toBeDisabled();
  });

  it('로그인하지 않았으면 에러 메시지를 보여줍니다', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('로그인이 필요합니다.'),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('추천할 후보가 없으면 에러 메시지를 보여주고 예외를 던지지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([]));
    mockTables();
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('추천할 음식점이 없습니다.'),
    );
  });

  it('개인 평점이 0점인 음식점은 추천에서 제외됩니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([{ user_id: 'me', place_id: 'p1', score: 0, snoozed_until: null }]);
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('추천할 음식점이 없습니다.'),
    );
  });

  it('스누즈 해제일이 미래인 음식점은 추천에서 제외됩니다', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([{ user_id: 'me', place_id: 'p1', score: 3, snoozed_until: future }]);
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('추천할 음식점이 없습니다.'),
    );
  });

  it('평점 조회에 실패하면 에러 메시지를 보여주고 추천을 진행하지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([], [], { message: '평점을 불러오지 못했습니다.' });
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('평점을 불러오지 못했습니다.'),
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('카테고리 선호 조회에 실패하면 에러 메시지를 보여주고 추천을 진행하지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([], [], null, { message: '선호도를 불러오지 못했습니다.' });
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('선호도를 불러오지 못했습니다.'),
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('Edge Function 호출이 실패하면 서버가 준 문구를 보여줍니다', async () => {
    post.mockRejectedValue(new Error('요청 한도를 초과했습니다.'));
    mockTables();
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('요청 한도를 초과했습니다.'),
    );
  });

  it('성공 후 재실행에서 후보가 없으면 이전 카드가 남지 않습니다', async () => {
    post.mockResolvedValueOnce(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());

    post.mockResolvedValueOnce(mockNearby([]));
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('추천할 음식점이 없습니다.'),
    );
    expect(screen.queryByRole('heading', { name: '식당' })).not.toBeInTheDocument();
  });
});
