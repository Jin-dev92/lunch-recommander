import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapCanvasProps } from './map/types';

// 주소 검색은 useGeocode → axiosInstance → supabaseClient를 탄다. 네트워크·QueryClient를 모킹한다.
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.mock('../lib/axiosInstance', () => ({ axiosInstance: { post: vi.fn() } }));
import { axiosInstance } from '../lib/axiosInstance';
const geocodePost = axiosInstance.post as ReturnType<typeof vi.fn>;

// 지도 SDK 연결은 캔버스 쪽 테스트(components/map/*.test.tsx)가 검증한다. 여기서는 Map이
// 캔버스에 무엇을 넘기고 캔버스 콜백에 어떻게 반응하는지만 본다.
let canvasProps: MapCanvasProps | null = null;
vi.mock('./map/MapCanvas', () => ({
  default: function MockMapCanvas(props: MapCanvasProps) {
    canvasProps = props;
    return <div className={props.className} aria-label={props.ariaLabel} />;
  },
}));

import Map from './Map';

// useGeocode(mutation)가 QueryClientProvider를 요구하므로 렌더를 감싼다.
function renderMap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  canvasProps = null;
  geocodePost.mockReset();
});

describe('지도', () => {
  it('첫 위치 응답을 기다리는 동안에도 기본 서울 좌표로 지도를 띄웁니다', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });

    renderMap(<Map onLocationChange={vi.fn()} />);

    await waitFor(() => expect(canvasProps).not.toBeNull());
    expect(canvasProps!.center).toEqual({ lat: 37.5665, lng: 126.978 });
    // 좌표를 모르면 도시 전체가 보이는 수준으로 두고 핀은 그리지 않는다.
    expect(canvasProps!.zoomLevel).toBe('city');
    expect(canvasProps!.markers).toEqual([]);
  });

  it('현재 위치를 얻으면 콜백과 지도 중심·핀을 그 좌표로 맞춥니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();

    renderMap(<Map onLocationChange={onLocationChange} />);

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0, radius: 500 }),
    );
    expect(canvasProps!.center).toEqual({ lat: 37.5, lng: 127.0 });
    expect(canvasProps!.zoomLevel).toBe('pinpoint');
    // 고정밀 측위도 빗나가므로 핀은 끌 수 있어야 한다.
    expect(canvasProps!.markers).toEqual([
      expect.objectContaining({ lat: 37.5, lng: 127.0, draggable: true }),
    ]);
  });

  it('고정밀 측위를 요청합니다', async () => {
    // 옵션이 없으면 WiFi/IP 기반 대략 측위로 떨어져 수 km 어긋난다.
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    renderMap(<Map onLocationChange={vi.fn()} />);

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
      maximumAge: 0,
    });
  });

  it('핀을 끌면 보정된 위치가 콜백으로 전달됩니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();

    renderMap(<Map onLocationChange={onLocationChange} />);
    await waitFor(() => expect(canvasProps?.markers.length).toBe(1));

    canvasProps!.onMarkerDragEnd!(canvasProps!.markers[0].id, 37.6, 127.1);

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.6, lng: 127.1, radius: 500 }),
    );
  });

  it('지도를 누르면 그 지점으로 핀과 검색 위치가 옮겨집니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();

    renderMap(<Map onLocationChange={onLocationChange} />);
    await waitFor(() => expect(canvasProps).not.toBeNull());

    canvasProps!.onMapClick!(37.4, 126.9);

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.4, lng: 126.9, radius: 500 }),
    );
    expect(canvasProps!.markers).toEqual([expect.objectContaining({ lat: 37.4, lng: 126.9 })]);
  });

  it('주소를 검색하면 지오코딩 좌표로 위치를 옮기고 현재 중심을 함께 보냅니다', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    geocodePost.mockResolvedValue({ data: { lat: 37.6, lng: 127.05 } });
    const onLocationChange = vi.fn();
    renderMap(<Map onLocationChange={onLocationChange} />);

    fireEvent.change(screen.getByLabelText('주소 검색'), { target: { value: '성북동 1가' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.6, lng: 127.05, radius: 500 }),
    );
    // 검색 시점에는 결과 좌표를 모르므로, 서버가 provider를 고를 수 있게 near를 보낸다.
    expect(geocodePost).toHaveBeenCalledWith('/geocode', {
      address: '성북동 1가',
      near: { lat: 37.5665, lng: 126.978 },
    });
  });

  it('주소 검색에 실패하면 서버가 준 문구를 보여줍니다', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    geocodePost.mockRejectedValue(new Error('주소를 찾을 수 없습니다.'));
    renderMap(<Map onLocationChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('주소 검색'), { target: { value: '없는주소zzz' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('주소를 찾을 수 없습니다.'),
    );
  });

  it('빈 주소로는 지오코딩을 호출하지 않습니다', () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    renderMap(<Map onLocationChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(geocodePost).not.toHaveBeenCalled();
  });

  it('지도 새로고침 버튼을 누르면 새로고침 콜백을 호출합니다', () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    const onRefresh = vi.fn();

    renderMap(<Map onLocationChange={vi.fn()} onRefresh={onRefresh} />);

    const refresh = screen.getByRole('button', { name: '지도 새로고침' });
    expect(refresh.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByLabelText('주변 지도').parentElement).toContainElement(refresh);
    fireEvent.click(refresh);

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('검색 반경과 음식 종류 조건을 제공합니다', () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    renderMap(<Map onLocationChange={vi.fn()} onCriteriaChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: '100m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1km' })).toBeInTheDocument();
    // 평점·리뷰는 해외(Google) 결과에만 있어 필터로 쓰지 않는다. 필터는 음식 종류 하나다.
    expect(screen.getByLabelText('음식 종류')).toHaveValue('전체');
    expect(screen.getByRole('option', { name: '한식' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '술집' })).toBeInTheDocument();
    expect(screen.queryByLabelText('최소 평점')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('최소 리뷰 수')).not.toBeInTheDocument();
  });

  it('음식 종류를 변경하면 콜백에 새 조건을 전달합니다', () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    const onCriteriaChange = vi.fn();
    renderMap(<Map onLocationChange={vi.fn()} onCriteriaChange={onCriteriaChange} />);

    fireEvent.change(screen.getByLabelText('음식 종류'), { target: { value: '한식' } });
    expect(onCriteriaChange).toHaveBeenLastCalledWith({ category: '한식' });

    fireEvent.change(screen.getByLabelText('음식 종류'), { target: { value: '전체' } });
    expect(onCriteriaChange).toHaveBeenLastCalledWith({ category: '전체' });
  });

  it('반경을 변경하면 콜백에 새 반경이 전달됩니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    renderMap(<Map onLocationChange={onLocationChange} />);
    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0, radius: 500 }),
    );

    fireEvent.change(screen.getByLabelText('검색 반경'), { target: { value: '1000' } });

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0, radius: 1000 }),
    );
    // 반경 변경은 좌표를 다시 물을 필요가 없다.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('지도 로드에 실패하면 에러 메시지를 보여줍니다', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    renderMap(<Map onLocationChange={vi.fn()} />);
    await waitFor(() => expect(canvasProps).not.toBeNull());

    canvasProps!.onError!();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('지도를 불러오지 못했습니다'),
    );
  });

  it('위치 권한이 거부되면 다시 요청할 수 있고 성공 시 경고를 지웁니다', async () => {
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((_success, error) => error())
      .mockImplementationOnce((success) =>
        success({ coords: { latitude: 37.5, longitude: 127.0 } }),
      );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    renderMap(<Map onLocationChange={onLocationChange} />);
    const retry = await screen.findByRole('button', { name: '현재 위치 권한이 필요합니다.' });

    fireEvent.click(retry);

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0, radius: 500 }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('위치 권한이 영구 차단되면 브라우저 설정 안내를 보여줍니다', async () => {
    const getCurrentPosition = vi.fn((_success, error) => error());
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: { query },
    });
    renderMap(<Map onLocationChange={vi.fn()} />);
    const retry = await screen.findByRole('button', { name: '현재 위치 권한이 필요합니다.' });

    fireEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '브라우저 설정에서 위치 권한을 허용해 주세요.',
      ),
    );
  });

  it('위치를 다시 요청하는 동안 버튼을 비활성화하고 스피너를 보여줍니다', async () => {
    let retrySuccess: PositionCallback | undefined;
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((_success, error) => error())
      .mockImplementationOnce((success) => {
        retrySuccess = success;
      });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    renderMap(<Map onLocationChange={vi.fn()} />);
    const retry = await screen.findByRole('button', { name: '현재 위치 권한이 필요합니다.' });

    fireEvent.click(retry);

    await waitFor(() => {
      expect(retry).toBeDisabled();
      expect(retry).toHaveAttribute('aria-busy', 'true');
      expect(retry).toHaveTextContent('위치 확인 중…');
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    retrySuccess?.({ coords: { latitude: 37.5, longitude: 127 } } as GeolocationPosition);
  });
});
