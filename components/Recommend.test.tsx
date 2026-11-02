import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  // 카카오 category_name("음식점 > 한식 > 육류,고기")을 nearby가 쪼개 준 두 값.
  category: '한식',
  categoryLabel: '육류,고기',
  address: '서울 성북구 테스트로 1',
  lat: 37,
  lng: 127,
  placeUrl: 'https://place.map.kakao.com/p1',
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
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    expect(screen.getByText('육류,고기 · 50m')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/nearby', location);
  });

  it('추천 결과에 카카오맵 장소 상세 링크를 보여줍니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    const link = (await screen.findByRole('link', {
      name: '메뉴·사진·리뷰 자세히 보기',
    })) as HTMLAnchorElement;
    // nearby가 돌려준 place_url을 그대로 쓴다(조립하지 않는다).
    expect(link.href).toBe('https://place.map.kakao.com/p1');
    // 외부 새 탭 이동 시 opener 노출을 막아야 한다.
    expect(link.rel).toContain('noopener');
    expect(link.target).toBe('_blank');
  });

  it('첫 조회 이후에는 같은 후보 풀에서 이미 추천한 음식점을 건너뜁니다', async () => {
    const secondRestaurant = { ...restaurant, placeId: 'p2', name: '두 번째 식당' };
    post.mockResolvedValue(mockNearby([restaurant, secondRestaurant]));
    mockTables();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    renderWithQuery(<Recommend location={location} canRate />);

    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '두 번째 식당' })).toBeInTheDocument(),
    );

    expect(post).toHaveBeenCalledTimes(1);
    random.mockRestore();
  });

  it('후보를 모두 추천하면 검색 결과 고갈 안내를 보여줍니다', async () => {
    const secondRestaurant = { ...restaurant, placeId: 'p2', name: '두 번째 식당' };
    post.mockResolvedValue(mockNearby([restaurant, secondRestaurant]));
    mockTables();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    renderWithQuery(<Recommend location={location} canRate />);

    const recommend = () => fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    recommend();
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    recommend();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '두 번째 식당' })).toBeInTheDocument(),
    );
    recommend();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '이번 검색에서 추천할 음식점을 모두 확인했어요. 위치나 검색 조건을 바꿔보세요.',
      ),
    );
    random.mockRestore();
  });

  it('위치가 바뀌면 후보 풀과 중복 기록을 초기화합니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const view = renderWithQuery(<Recommend location={location} canRate />);

    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Recommend location={{ lat: 38, lng: 128, radius: 500 }} canRate />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());

    expect(post).toHaveBeenCalledTimes(2);
    random.mockRestore();
  });

  it('추천 결과에 주소를 보여줍니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    // 카카오 주소에는 국가명이 붙지 않으므로 받은 값을 그대로 보여준다.
    await waitFor(() => expect(screen.getByText('서울 성북구 테스트로 1')).toBeInTheDocument());
  });

  it('주소가 없으면 주소 줄을 그리지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([{ ...restaurant, address: null }]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    expect(screen.queryByText(/성북구 테스트로 1/)).not.toBeInTheDocument();
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

  it('카카오에는 사진·가격대가 없어 썸네일과 ₩ 표기를 그리지 않습니다', async () => {
    post.mockResolvedValue(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/₩/)).not.toBeInTheDocument();
    // nearby 외에 다른 Edge Function을 부르지 않는다(사진 조회 함수는 제거됐다).
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/nearby', location);
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

  it('선택한 음식 종류에 해당하는 후보만 추천합니다', async () => {
    post.mockResolvedValue(
      mockNearby([
        { ...restaurant, placeId: 'chinese', name: '중식당', category: '중식' },
        { ...restaurant, placeId: 'japanese', name: '일식당', category: '일식' },
        { ...restaurant, placeId: 'qualified', name: '한식당', category: '한식' },
      ]),
    );
    mockTables();
    renderWithQuery(<Recommend location={location} criteria={{ category: '한식' }} canRate />);

    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '한식당' })).toBeInTheDocument(),
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

  it('후보 풀을 모두 소진하면 이전 카드가 남지 않고 고갈 안내를 보여줍니다', async () => {
    post.mockResolvedValueOnce(mockNearby([restaurant]));
    mockTables();
    renderWithQuery(<Recommend location={location} canRate />);
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '식당' })).toBeInTheDocument());

    post.mockResolvedValueOnce(mockNearby([]));
    fireEvent.click(screen.getByRole('button', { name: '한 곳 추천' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '이번 검색에서 추천할 음식점을 모두 확인했어요. 위치나 검색 조건을 바꿔보세요.',
      ),
    );
    expect(screen.queryByRole('heading', { name: '식당' })).not.toBeInTheDocument();
  });
});
