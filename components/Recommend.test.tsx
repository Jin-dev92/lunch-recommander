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
  category: 'korean_restaurant',
  categoryLabel: '한식',
  lat: 37,
  lng: 127,
  googleRating: 4,
  googleRatingsTotal: 30,
  priceLevel: null,
  photoName: null,
  distanceMeters: 50,
};

function mockNearby(restaurants: unknown[]) {
  return { data: { restaurants, source: 'cache' } };
}

// nearby와 place-photo가 같은 axiosInstance.post를 쓰므로 경로로 응답을 나눈다.
function mockPostByRoute(restaurants: unknown[], photoUri?: string) {
  post.mockImplementation((url: string) => {
    if (url === '/place-photo') return Promise.resolve({ data: { photoUri } });
    return Promise.resolve(mockNearby(restaurants));
  });
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
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    expect(screen.getByText('한식 · 50m')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/nearby', location);
  });

  it('추천 결과에 Google 지도 상세 링크를 보여줍니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    const link = (await screen.findByRole('link', {
      name: '메뉴·리뷰 자세히 보기',
    })) as HTMLAnchorElement;
    expect(link.href).toContain('query_place_id=p1');
    // 외부 새 탭 이동 시 opener 노출을 막아야 한다.
    expect(link.rel).toContain('noopener');
    expect(link.target).toBe('_blank');
  });

  it('가격대가 있으면 카테고리·거리와 함께 ₩ 기호로 보여줍니다', async () => {
    mockPostByRoute([{ ...restaurant, priceLevel: 'PRICE_LEVEL_MODERATE' }]);
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByText('한식 · ₩₩ · 50m')).toBeInTheDocument());
  });

  it('사진이 있으면 썸네일을 조회해 이름 옆에 보여줍니다', async () => {
    mockPostByRoute(
      [{ ...restaurant, photoName: 'places/p1/photos/x' }],
      'https://lh3.googleusercontent.com/photo',
    );
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    const img = (await screen.findByRole('img')) as HTMLImageElement;
    expect(img.src).toBe('https://lh3.googleusercontent.com/photo');
    expect(post).toHaveBeenCalledWith('/place-photo', { photoName: 'places/p1/photos/x' });
  });

  it('로그인한 사용자에게는 평가 컨트롤을 보여줍니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '다시 추천 안 함' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
  });

  it('로그인하지 않은 사용자에게는 평가 대신 로그인 유도를 보여줍니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate={false} />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    // 평가 컨트롤은 숨기고 로그인 링크만 노출한다.
    expect(screen.queryByRole('button', { name: '다시 추천 안 함' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('별점')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
  });

  it('사진 정보가 없으면 썸네일을 조회하지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/place-photo', expect.anything());
  });

  it('위치가 없으면 버튼이 비활성화됩니다', () => {
    renderWithQuery(<Recommend location={null} canRate />);
    expect(screen.getByRole('button', { name: '한 곳 추천' })).toBeDisabled();
  });

  it('추천을 가져오는 동안 영역의 로딩 상태를 알리고 버튼을 비활성화합니다', async () => {
    post.mockReturnValue(new Promise(() => {}));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    const button = screen.getByRole('button', { name: '한 곳 추천' });

    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button.closest('section')).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveTextContent('추천 중…');
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  it('로그인하지 않았으면 에러 메시지를 보여줍니다', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('로그인이 필요합니다.'),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('추천할 후보가 없으면 에러 메시지를 보여주고 예외를 던지지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('추천할 음식점이 없습니다.'),
    );
  });

  it('선택한 Google 평점과 리뷰 수 기준을 모두 만족하는 후보만 추천합니다', async () => {
    post.mockResolvedValue(
      mockNearby([
        { ...restaurant, placeId: 'low-rating', name: '평점 미달', googleRating: 4.4, googleRatingsTotal: 50 },
        { ...restaurant, placeId: 'low-reviews', name: '리뷰 미달', googleRating: 4.5, googleRatingsTotal: 49 },
        { ...restaurant, placeId: 'qualified', name: '조건 충족', googleRating: 4.5, googleRatingsTotal: 50 },
      ]),
    );
    mockTables();
    renderWithQuery(
      <Recommend
        location={location}
        criteria={{ minGoogleRating: 4.5, minGoogleReviews: 50 }}
        canRate
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '조건 충족' })).toBeInTheDocument(),
    );
  });

  it('개인 평점이 0점인 음식점은 추천에서 제외됩니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([{ user_id: 'me', place_id: 'p1', score: 0, snoozed_until: null }]);
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('추천할 음식점이 없습니다.'),
    );
  });

  it('스누즈 해제일이 미래인 음식점은 추천에서 제외됩니다', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([{ user_id: 'me', place_id: 'p1', score: 3, snoozed_until: future }]);
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('추천할 음식점이 없습니다.'),
    );
  });

  it('평점 조회에 실패하면 에러 메시지를 보여주고 추천을 진행하지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([], [], { message: '평점을 불러오지 못했습니다.' });
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('평점을 불러오지 못했습니다.'),
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('카테고리 선호 조회에 실패하면 에러 메시지를 보여주고 추천을 진행하지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables([], [], null, { message: '선호도를 불러오지 못했습니다.' });
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('선호도를 불러오지 못했습니다.'),
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('Edge Function 호출이 실패하면 서버가 준 문구를 보여줍니다', async () => {
    post.mockRejectedValue(new Error('요청 한도를 초과했습니다.'));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('요청 한도를 초과했습니다.'),
    );
  });

  it('성공 후 재실행에서 후보가 없으면 이전 카드가 남지 않습니다', async () => {
    post.mockResolvedValueOnce(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
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
