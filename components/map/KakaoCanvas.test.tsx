import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// next/script는 jsdom에서 실제로 스크립트를 받아오지 않는다. 로드 완료 신호만 재현한다.
// onReady를 effect에서 호출해야 렌더 중 setState 경고가 나지 않는다.
let scriptShouldFail = false;
vi.mock('next/script', () => ({
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
    }, [onReady, onLoad, onError]);
    return null;
  },
}));

import KakaoCanvas from './KakaoCanvas';

type MockLatLng = { getLat(): number; getLng(): number };
function latLng(lat: number, lng: number): MockLatLng {
  return { getLat: () => lat, getLng: () => lng };
}

const mapMock = vi.fn();
const markerMock = vi.fn();
const setCenter = vi.fn();
const setLevel = vi.fn();
const setPosition = vi.fn();
const setMarkerMap = vi.fn();
const getPosition = vi.fn();
let listeners: Record<string, (event: { latLng: MockLatLng }) => void>;
// kakao.maps.load 콜백을 보류시켜 초기화가 늦게 끝나는 경우를 재현한다.
let deferLoad = false;
let pendingLoad: (() => void) | undefined;

beforeEach(() => {
  scriptShouldFail = false;
  deferLoad = false;
  pendingLoad = undefined;
  listeners = {};
  [mapMock, markerMock, setCenter, setLevel, setPosition, setMarkerMap, getPosition].forEach((m) =>
    m.mockReset(),
  );
  mapMock.mockImplementation(() => ({ setCenter, setLevel }));
  markerMock.mockImplementation(() => ({ setPosition, setMap: setMarkerMap, getPosition }));
  (globalThis as unknown as { kakao: unknown }).kakao = {
    maps: {
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

describe('카카오 지도 캔버스', () => {
  it('좌표와 확대 수준으로 지도를 만듭니다', async () => {
    render(<KakaoCanvas center={{ lat: 37.5, lng: 127 }} zoomLevel="pinpoint" markers={[]} />);

    // 카카오 레벨은 숫자가 작을수록 확대된다(Google zoom과 방향이 반대).
    await waitFor(() =>
      expect(mapMock).toHaveBeenCalledWith(expect.anything(), {
        center: expect.objectContaining({ getLat: expect.any(Function) }),
        level: 3,
      }),
    );
    expect(mapMock.mock.calls[0][1].center.getLat()).toBe(37.5);
    expect(mapMock.mock.calls[0][1].center.getLng()).toBe(127);
  });

  it('city 수준은 더 넓게 보이는 레벨을 씁니다', async () => {
    render(<KakaoCanvas center={{ lat: 37.5, lng: 127 }} zoomLevel="city" markers={[]} />);
    await waitFor(() => expect(mapMock).toHaveBeenCalled());
    expect(mapMock.mock.calls[0][1].level).toBe(6);
  });

  it('마커를 그리고 드래그 종료 좌표를 마커에서 읽어 전달합니다', async () => {
    const onMarkerDragEnd = vi.fn();
    render(
      <KakaoCanvas
        center={{ lat: 37.5, lng: 127 }}
        zoomLevel="pinpoint"
        markers={[{ id: 'pin', lat: 37.5, lng: 127, draggable: true }]}
        onMarkerDragEnd={onMarkerDragEnd}
      />,
    );
    await waitFor(() => expect(markerMock).toHaveBeenCalled());

    // 카카오 dragend 콜백은 인자를 받지 않는다. 새 좌표는 marker.getPosition()으로 읽는다.
    getPosition.mockReturnValue(latLng(37.6, 127.1));
    listeners.dragend({ latLng: latLng(0, 0) });

    expect(onMarkerDragEnd).toHaveBeenCalledWith('pin', 37.6, 127.1);
  });

  it('지도 클릭 좌표를 전달합니다', async () => {
    const onMapClick = vi.fn();
    render(
      <KakaoCanvas
        center={{ lat: 37.5, lng: 127 }}
        zoomLevel="pinpoint"
        markers={[]}
        onMapClick={onMapClick}
      />,
    );
    await waitFor(() => expect(mapMock).toHaveBeenCalled());

    listeners.click({ latLng: latLng(37.4, 126.9) });

    expect(onMapClick).toHaveBeenCalledWith(37.4, 126.9);
  });

  it('마커 클릭을 id로 알려줍니다', async () => {
    const onMarkerClick = vi.fn();
    render(
      <KakaoCanvas
        center={{ lat: 37.5, lng: 127 }}
        zoomLevel="city"
        markers={[{ id: 'saved-1', lat: 37.5, lng: 127 }]}
        onMarkerClick={onMarkerClick}
      />,
    );
    await waitFor(() => expect(markerMock).toHaveBeenCalled());

    listeners.click({ latLng: latLng(0, 0) });

    expect(onMarkerClick).toHaveBeenCalledWith('saved-1');
  });

  it('중심이 바뀌면 지도를 다시 만들지 않고 옮깁니다', async () => {
    const { rerender } = render(
      <KakaoCanvas center={{ lat: 37.5, lng: 127 }} zoomLevel="pinpoint" markers={[]} />,
    );
    await waitFor(() => expect(mapMock).toHaveBeenCalledTimes(1));

    rerender(<KakaoCanvas center={{ lat: 37.6, lng: 127.1 }} zoomLevel="pinpoint" markers={[]} />);

    await waitFor(() => expect(setCenter).toHaveBeenCalled());
    expect(mapMock).toHaveBeenCalledTimes(1);
  });

  it('스크립트 준비 직후 전역이 늦게 노출돼도 지도를 만듭니다', async () => {
    // next/script의 준비 이벤트가 스크립트 본문 실행보다 먼저 뜰 수 있다.
    const global = globalThis as unknown as { kakao: unknown };
    const kakao = global.kakao;
    global.kakao = undefined;
    window.setTimeout(() => {
      global.kakao = kakao;
    }, 10);

    render(<KakaoCanvas center={{ lat: 37.5, lng: 127 }} zoomLevel="pinpoint" markers={[]} />);

    await waitFor(() => expect(mapMock).toHaveBeenCalledTimes(1));
  });

  it('SDK 초기화 콜백이 늦게 끝나도 지도를 만듭니다', async () => {
    deferLoad = true;
    render(<KakaoCanvas center={{ lat: 37.5, lng: 127 }} zoomLevel="pinpoint" markers={[]} />);

    await waitFor(() => expect(pendingLoad).toBeDefined());
    expect(mapMock).not.toHaveBeenCalled();

    pendingLoad?.();

    await waitFor(() => expect(mapMock).toHaveBeenCalledTimes(1));
  });

  it('스크립트 로드에 실패하면 onError를 부르고 예외를 던지지 않습니다', async () => {
    scriptShouldFail = true;
    const onError = vi.fn();

    render(
      <KakaoCanvas
        center={{ lat: 37.5, lng: 127 }}
        zoomLevel="pinpoint"
        markers={[]}
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mapMock).not.toHaveBeenCalled();
  });
});
