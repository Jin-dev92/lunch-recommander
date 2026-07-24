import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// next/script는 jsdom에서 실제로 스크립트를 받아오지 않는다. SDK 로드 완료 신호만 재현한다.
// onReady를 effect에서 호출해야 렌더 중 setState 경고가 나지 않는다.
let scriptShouldFail = false;
vi.mock('next/script', () => ({
  // 훅을 쓰는 컴포넌트이므로 이름이 대문자로 시작해야 rules-of-hooks를 통과한다.
  default: function MockScript({
    onReady,
    onError,
  }: {
    onReady?: () => void;
    onError?: () => void;
  }) {
    useEffect(() => {
      if (scriptShouldFail) onError?.();
      else onReady?.();
    }, [onReady, onError]);
    return null;
  },
}));

import Map from './Map';

// ponytail: 실제 Google Maps SDK를 로드하면 네트워크 호출이 발생하므로 전역 google 객체를 모킹.
// 핀 이동을 검증해야 하므로 addListener로 등록된 핸들러를 listeners에 모아 테스트에서 직접 호출한다.
const mapMock = vi.fn();
const markerMock = vi.fn();
let listeners: Record<string, (event: unknown) => void>;
const setPosition = vi.fn();

function latLng(lat: number, lng: number) {
  return { lat: () => lat, lng: () => lng };
}

beforeEach(() => {
  scriptShouldFail = false;
  listeners = {};
  setPosition.mockReset();
  const addListener = (event: string, handler: (e: unknown) => void) => {
    listeners[event] = handler;
  };
  mapMock.mockReset();
  markerMock.mockReset();
  mapMock.mockImplementation(() => ({ addListener }));
  markerMock.mockImplementation(() => ({ addListener, setPosition }));
  // 실제 SDK는 loading=async에서 요청한 라이브러리만 채운다. Map은 'maps', Marker는 'marker'
  // 소속이며 전역 google.maps에는 놓이지 않는다. 목이 전역에 다 얹어두면 라이브러리를
  // 빠뜨린 코드가 테스트를 통과해 버리므로, 여기서도 importLibrary로만 제공한다.
  (globalThis as unknown as { google: typeof google }).google = {
    maps: {
      importLibrary: vi.fn(async (name: string) => {
        if (name === 'maps') return { Map: mapMock };
        if (name === 'marker') return { Marker: markerMock };
        throw new Error(`요청하지 않은 라이브러리: ${name}`);
      }),
    },
  } as unknown as typeof google;
});

describe('지도', () => {
  it('검색 반경과 추천 품질 조건을 제공합니다', () => {
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
    });
    render(<Map onLocationChange={vi.fn()} onCriteriaChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: '100m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '300m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '500m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1km' })).toBeInTheDocument();
    expect(screen.getByLabelText('최소 평점')).toHaveValue('3.5');
    expect(screen.getByLabelText('최소 리뷰 수')).toHaveValue('30');
    expect(
      screen.getByRole('option', { name: '평점 5.0 이상' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '리뷰 100개 이상' })).toBeInTheDocument();
    expect(screen.getByLabelText('주변 지도')).not.toHaveAttribute('style');
  });

  it('추천 품질 조건을 변경하면 콜백에 완전한 조건을 전달합니다', () => {
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: vi.fn() },
    });
    const onCriteriaChange = vi.fn();
    render(<Map onLocationChange={vi.fn()} onCriteriaChange={onCriteriaChange} />);

    fireEvent.change(screen.getByLabelText('최소 평점'), { target: { value: '4.5' } });
    expect(onCriteriaChange).toHaveBeenLastCalledWith({
      minGoogleRating: 4.5,
      minGoogleReviews: 30,
    });

    fireEvent.change(screen.getByLabelText('최소 리뷰 수'), { target: { value: '70' } });
    expect(onCriteriaChange).toHaveBeenLastCalledWith({
      minGoogleRating: 4.5,
      minGoogleReviews: 70,
    });
  });

  it('현재 위치를 얻으면 콜백과 지도를 초기화합니다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    render(<Map onLocationChange={onLocationChange} />);
    await waitFor(() =>
      expect(onLocationChange).toHaveBeenCalledWith({
        lat: 37.5,
        lng: 127.0,
        radius: 500,
      }),
    );
    expect(mapMock).toHaveBeenCalledWith(expect.anything(), {
      center: { lat: 37.5, lng: 127.0 },
      zoom: 16,
    });
    expect(markerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { lat: 37.5, lng: 127.0 },
        map: expect.anything(),
        draggable: true,
      }),
    );
  });

  it('고정밀 측위를 요청합니다', async () => {
    // 옵션이 없으면 WiFi/IP 기반 대략 측위로 떨어져 수 km 어긋난다.
    // 세 번째 인자(옵션)를 검사해야 하므로 목에 Geolocation의 전체 시그니처를 입힌다.
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    render(<Map onLocationChange={vi.fn()} />);
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
    render(<Map onLocationChange={onLocationChange} />);
    await waitFor(() => expect(markerMock).toHaveBeenCalled());

    listeners.dragend({ latLng: latLng(37.6, 127.1) });

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
    render(<Map onLocationChange={onLocationChange} />);
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
    render(<Map onLocationChange={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('지도를 불러오지 못했습니다'),
    );
    expect(mapMock).not.toHaveBeenCalled();
  });

  it('SDK가 좌표보다 늦게 준비돼도 지도를 만듭니다', async () => {
    // 예전 구현은 좌표가 오는 순간 한 번만 검사하고 실패로 확정해 다시 시도하지 않았다.
    let resolveLibrary: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveLibrary = resolve;
    });
    (globalThis as unknown as { google: typeof google }).google.maps.importLibrary = vi
      .fn()
      .mockReturnValue(pending) as unknown as typeof google.maps.importLibrary;

    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    render(<Map onLocationChange={vi.fn()} />);

    expect(mapMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    resolveLibrary({ Map: mapMock, Marker: markerMock });

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
    render(<Map onLocationChange={onLocationChange} />);
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
    render(<Map onLocationChange={vi.fn()} />);
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
    render(<Map onLocationChange={vi.fn()} />);
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
    render(<Map onLocationChange={onLocationChange} />);
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
