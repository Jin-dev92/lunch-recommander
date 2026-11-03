import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 주소 검색은 useGeocode → axiosInstance → supabaseClient를 탄다. 네트워크·QueryClient를 모킹한다.
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.mock('../lib/axiosInstance', () => ({ axiosInstance: { post: vi.fn() } }));
import { axiosInstance } from '../lib/axiosInstance';
const geocodePost = axiosInstance.post as ReturnType<typeof vi.fn>;

// useGeocode(mutation)가 QueryClientProvider를 요구하므로 렌더를 감싼다.
function renderMap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// next/script는 jsdom에서 실제로 스크립트를 받아오지 않는다. SDK 로드 완료 신호만 재현한다.
// onReady를 effect에서 호출해야 렌더 중 setState 경고가 나지 않는다.
let scriptShouldFail = false;
vi.mock('next/script', () => ({
  // 훅을 쓰는 컴포넌트이므로 이름이 대문자로 시작해야 rules-of-hooks를 통과한다.
  default: function MockScript({
    onReady,
    onLoad,
    onError,
  }: {
    onReady?: () => void;
    onLoad?: () => void;
    onError?: () => void;
  }) {
    useEffect(() => {
      if (scriptShouldFail) onError?.();
      else onReady?.();
    }, [onReady, onError, onLoad]);
    return null;
  },
}));

import Map from './Map';

// ponytail: 실제 카카오맵 SDK를 로드하면 네트워크 호출이 발생하므로 전역 kakao 객체를 모킹.
// 핀 이동을 검증해야 하므로 kakao.maps.event.addListener로 등록된 핸들러를 listeners에
// 모아 테스트에서 직접 호출한다. 카카오 마커의 dragend 콜백은 인자를 받지 않으므로
// 핸들러도 인자 없이 호출하고, 새 좌표는 marker.getPosition()이 돌려주게 만든다.
type MockLatLng = { getLat(): number; getLng(): number };

const mapMock = vi.fn();
const markerMock = vi.fn();
let listeners: Record<string, (event: { latLng: MockLatLng }) => void>;
const setPosition = vi.fn();
const setMarkerMap = vi.fn();
const getPosition = vi.fn();
const setCenter = vi.fn();
const setLevel = vi.fn();
/** 카카오 LatLng는 생성자로 만들고 getLat/getLng로 읽는다. */
function latLng(lat: number, lng: number): MockLatLng {
  return { getLat: () => lat, getLng: () => lng };
}

// kakao.maps.load 콜백을 즉시 실행하지 않고 보류시켜, 초기화가 늦게 끝나는 경우를 재현한다.
let deferLoad = false;
let pendingLoad: (() => void) | undefined;

beforeEach(() => {
  scriptShouldFail = false;
  deferLoad = false;
  pendingLoad = undefined;
  geocodePost.mockReset();
  listeners = {};
  setPosition.mockReset();
  setMarkerMap.mockReset();
  getPosition.mockReset();
  setCenter.mockReset();
  setLevel.mockReset();
  mapMock.mockReset();
  markerMock.mockReset();
  mapMock.mockImplementation(() => ({ setCenter, setLevel }));
  markerMock.mockImplementation(() => ({
    setPosition,
    setMap: setMarkerMap,
    getPosition,
  }));
  (globalThis as unknown as { kakao: unknown }).kakao = {
    maps: {
      // autoload=false로 불러온 SDK는 이 콜백으로 초기화 완료를 알린다.
      load: (callback: () => void) => {
        if (deferLoad) pendingLoad = callback;
        else callback();
      },
      LatLng: vi.fn((lat: number, lng: number) => latLng(lat, lng)),
      Map: mapMock,
      Marker: markerMock,
      event: {
        addListener: (
          _target: unknown,
          event: string,
          handler: (e: { latLng: MockLatLng }) => void,
        ) => {
          listeners[event] = handler;
        },
      },
    },
  };
});

describe('지도', () => {
  it('첫 위치 응답을 기다리는 동안에도 기본 서울 지도를 만듭니다', async () => {
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
    });

    renderMap(<Map onLocationChange={vi.fn()} />);

    // 카카오 레벨은 숫자가 작을수록 확대된다. 좌표를 모를 때는 도시 전체가 보이는 레벨 6.
    await waitFor(() =>
      expect(mapMock).toHaveBeenCalledWith(expect.anything(), {
        center: expect.objectContaining({ getLat: expect.any(Function) }),
        level: 6,
      }),
    );
    expect(mapMock.mock.calls[0][1].center.getLat()).toBe(37.5665);
    expect(mapMock.mock.calls[0][1].center.getLng()).toBe(126.978);
    // 카카오 마커에는 setVisible이 없다. 좌표를 모르는 동안에는 지도에 붙이지 않는다.
    expect(markerMock).toHaveBeenCalledWith(expect.objectContaining({ draggable: true }));
    expect(setMarkerMap).not.toHaveBeenCalled();
  });

  it('주소를 검색하면 지오코딩 좌표로 위치를 옮깁니다', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    geocodePost.mockResolvedValue({ data: { lat: 37.6, lng: 127.05 } });
    const onLocationChange = vi.fn();
    renderMap(<Map onLocationChange={onLocationChange} />);

    fireEvent.change(screen.getByLabelText('주소 검색'), { target: { value: '성북동 1가' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.6, lng: 127.05, radius: 500 }),
    );
    expect(geocodePost).toHaveBeenCalledWith('/geocode', { address: '성북동 1가' });
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
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
    });
    const onRefresh = vi.fn();

    renderMap(<Map onLocationChange={vi.fn()} onRefresh={onRefresh} />);

    const refresh = screen.getByRole('button', { name: '지도 새로고침' });
    expect(refresh.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByLabelText('주변 지도').parentElement).toContainElement(refresh);
    fireEvent.click(refresh);

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('스크립트 준비 직후 카카오 SDK 전역이 늦게 노출돼도 지도를 만듭니다', async () => {
    // next/script의 준비 이벤트가 스크립트 본문 실행보다 먼저 뜰 수 있다.
    const global = globalThis as unknown as { kakao: unknown };
    const kakao = global.kakao;
    global.kakao = undefined;
    window.setTimeout(() => {
      global.kakao = kakao;
    }, 10);
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
    });

    renderMap(<Map onLocationChange={vi.fn()} />);

    await waitFor(() => expect(mapMock).toHaveBeenCalledTimes(1));
  });

  it('검색 반경만 제공하고 음식 종류는 다루지 않습니다', () => {
    // 음식 종류 선택지는 실제 검색 결과에서 나오므로 Recommend가 소유한다.
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
    });
    renderMap(<Map onLocationChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: '100m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '300m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '500m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1km' })).toBeInTheDocument();
    expect(screen.queryByLabelText('음식 종류')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('최소 평점')).not.toBeInTheDocument();
    expect(screen.getByLabelText('주변 지도')).not.toHaveAttribute('style');
  });

  it('현재 위치를 얻으면 콜백과 지도를 초기화합니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    renderMap(<Map onLocationChange={onLocationChange} />);
    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({
        lat: 37.5,
        lng: 127.0,
        radius: 500,
      }),
    );
    // 좌표가 확정되면 가게가 구분되는 레벨 3으로 만든다.
    expect(mapMock).toHaveBeenCalledWith(expect.anything(), {
      center: expect.objectContaining({ getLat: expect.any(Function) }),
      level: 3,
    });
    expect(mapMock.mock.calls[0][1].center.getLat()).toBe(37.5);
    expect(mapMock.mock.calls[0][1].center.getLng()).toBe(127.0);
    expect(markerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        position: expect.objectContaining({ getLat: expect.any(Function) }),
        draggable: true,
      }),
    );
    // 좌표를 알았으니 마커를 지도에 붙인다(카카오에는 setVisible이 없다).
    expect(setMarkerMap).toHaveBeenCalled();
  });

  it('고정밀 측위를 요청합니다', async () => {
    // 옵션이 없으면 WiFi/IP 기반 대략 측위로 떨어져 수 km 어긋난다.
    // 세 번째 인자(옵션)를 검사해야 하므로 목에 Geolocation의 전체 시그니처를 입힌다.
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
    await waitFor(() => expect(markerMock).toHaveBeenCalled());

    // 카카오 dragend 콜백은 인자를 받지 않는다. 새 좌표는 마커에서 직접 읽는다.
    getPosition.mockReturnValue(latLng(37.6, 127.1));
    listeners.dragend({ latLng: latLng(0, 0) });

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.6, lng: 127.1, radius: 500 }),
    );
    // 위치 보정으로 지도를 다시 만들지는 않는다.
    expect(mapMock).toHaveBeenCalledTimes(1);
  });

  it('지도를 누르면 그 지점으로 핀과 검색 위치가 옮겨집니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    renderMap(<Map onLocationChange={onLocationChange} />);
    await waitFor(() => expect(mapMock).toHaveBeenCalled());

    listeners.click({ latLng: latLng(37.4, 126.9) });

    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.4, lng: 126.9, radius: 500 }),
    );
    expect(setPosition).toHaveBeenCalled();
  });

  it('지도 스크립트 로드에 실패하면 에러 메시지를 보여주고 예외를 던지지 않습니다', async () => {
    scriptShouldFail = true;
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    renderMap(<Map onLocationChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('지도를 불러오지 못했습니다'),
    );
    expect(mapMock).not.toHaveBeenCalled();
  });

  it('SDK 초기화가 좌표보다 늦게 끝나도 지도를 만듭니다', async () => {
    // 예전 구현은 좌표가 오는 순간 한 번만 검사하고 실패로 확정해 다시 시도하지 않았다.
    deferLoad = true;

    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    renderMap(<Map onLocationChange={vi.fn()} />);

    await waitFor(() => expect(pendingLoad).toBeDefined());
    expect(mapMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    pendingLoad?.();

    await waitFor(() => expect(mapMock).toHaveBeenCalledTimes(1));
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
    const retry = await screen.findByRole('button', {
      name: '현재 위치 권한이 필요합니다.',
    });

    fireEvent.click(retry);

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({
        lat: 37.5,
        lng: 127.0,
        radius: 500,
      }),
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
    const retry = await screen.findByRole('button', {
      name: '현재 위치 권한이 필요합니다.',
    });

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
    const retry = await screen.findByRole('button', {
      name: '현재 위치 권한이 필요합니다.',
    });

    fireEvent.click(retry);

    await waitFor(() => {
      expect(retry).toBeDisabled();
      expect(retry).toHaveAttribute('aria-busy', 'true');
      expect(retry).toHaveTextContent('위치 확인 중…');
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    retrySuccess?.({
      coords: { latitude: 37.5, longitude: 127 },
    } as GeolocationPosition);
  });

  it('반경을 변경하면 콜백에 새 반경이 전달됩니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    renderMap(<Map onLocationChange={onLocationChange} />);
    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({
        lat: 37.5,
        lng: 127.0,
        radius: 500,
      }),
    );
    fireEvent.change(screen.getByLabelText('검색 반경'), {
      target: { value: '1000' },
    });
    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({
        lat: 37.5,
        lng: 127.0,
        radius: 1000,
      }),
    );
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mapMock).toHaveBeenCalledTimes(1);
  });
});
