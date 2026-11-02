import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// next/script는 jsdom에서 실제로 스크립트를 받아오지 않는다. 로드 완료 신호만 재현한다.
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

import GoogleCanvas from './GoogleCanvas';

function latLng(lat: number, lng: number) {
  return { lat: () => lat, lng: () => lng };
}

const mapMock = vi.fn();
const markerMock = vi.fn();
const setCenter = vi.fn();
const setZoom = vi.fn();
const setMarkerMap = vi.fn();
// 지도와 마커가 각자 addListener를 갖는다(카카오의 전역 event.addListener와 다른 지점).
let mapListeners: Record<string, (event: unknown) => void>;
let markerListeners: Record<string, (event: unknown) => void>;

beforeEach(() => {
  scriptShouldFail = false;
  mapListeners = {};
  markerListeners = {};
  [mapMock, markerMock, setCenter, setZoom, setMarkerMap].forEach((m) => m.mockReset());
  mapMock.mockImplementation(() => ({
    setCenter,
    setZoom,
    addListener: (event: string, handler: (e: unknown) => void) => {
      mapListeners[event] = handler;
    },
  }));
  markerMock.mockImplementation(() => ({
    setMap: setMarkerMap,
    addListener: (event: string, handler: (e: unknown) => void) => {
      markerListeners[event] = handler;
    },
  }));
  // 실제 SDK는 요청한 라이브러리만 채운다. Map은 'maps', Marker는 'marker' 소속이며
  // 전역 google.maps에는 놓이지 않는다. 목도 importLibrary로만 제공해 누락을 잡는다.
  (globalThis as unknown as { google: unknown }).google = {
    maps: {
      importLibrary: vi.fn(async (name: string) => {
        if (name === 'maps') return { Map: mapMock };
        if (name === 'marker') return { Marker: markerMock };
        throw new Error(`요청하지 않은 라이브러리: ${name}`);
      }),
    },
  };
});

describe('Google 지도 캔버스', () => {
  it('좌표와 확대 수준으로 지도를 만듭니다', async () => {
    render(
      <GoogleCanvas center={{ lat: 48.8566, lng: 2.3522 }} zoomLevel="pinpoint" markers={[]} />,
    );

    // Google zoom은 클수록 확대된다(카카오 level과 방향이 반대).
    await waitFor(() =>
      expect(mapMock).toHaveBeenCalledWith(expect.anything(), {
        center: { lat: 48.8566, lng: 2.3522 },
        zoom: 16,
        mapTypeControl: false,
      }),
    );
  });

  it('city 수준은 더 작은 zoom을 씁니다', async () => {
    render(<GoogleCanvas center={{ lat: 48.8566, lng: 2.3522 }} zoomLevel="city" markers={[]} />);
    await waitFor(() => expect(mapMock).toHaveBeenCalled());
    expect(mapMock.mock.calls[0][1].zoom).toBe(13);
  });

  it('마커를 그리고 드래그 종료 좌표를 이벤트에서 읽어 전달합니다', async () => {
    const onMarkerDragEnd = vi.fn();
    render(
      <GoogleCanvas
        center={{ lat: 48.8566, lng: 2.3522 }}
        zoomLevel="pinpoint"
        markers={[{ id: 'pin', lat: 48.8566, lng: 2.3522, draggable: true }]}
        onMarkerDragEnd={onMarkerDragEnd}
      />,
    );
    await waitFor(() => expect(markerListeners.dragend).toBeDefined());

    // Google dragend는 이벤트 객체로 좌표를 넘겨준다(카카오와 다른 지점).
    markerListeners.dragend({ latLng: latLng(48.86, 2.36) });

    expect(onMarkerDragEnd).toHaveBeenCalledWith('pin', 48.86, 2.36);
  });

  it('지도 클릭 좌표를 전달합니다', async () => {
    const onMapClick = vi.fn();
    render(
      <GoogleCanvas
        center={{ lat: 48.8566, lng: 2.3522 }}
        zoomLevel="pinpoint"
        markers={[]}
        onMapClick={onMapClick}
      />,
    );
    await waitFor(() => expect(mapListeners.click).toBeDefined());

    mapListeners.click({ latLng: latLng(48.85, 2.34) });

    expect(onMapClick).toHaveBeenCalledWith(48.85, 2.34);
  });

  it('latLng이 없는 클릭 이벤트는 무시합니다', async () => {
    const onMapClick = vi.fn();
    render(
      <GoogleCanvas
        center={{ lat: 48.8566, lng: 2.3522 }}
        zoomLevel="pinpoint"
        markers={[]}
        onMapClick={onMapClick}
      />,
    );
    await waitFor(() => expect(mapListeners.click).toBeDefined());

    mapListeners.click({ latLng: null });

    expect(onMapClick).not.toHaveBeenCalled();
  });

  it('마커 클릭을 id로 알려줍니다', async () => {
    const onMarkerClick = vi.fn();
    render(
      <GoogleCanvas
        center={{ lat: 48.8566, lng: 2.3522 }}
        zoomLevel="city"
        markers={[{ id: 'saved-1', lat: 48.8566, lng: 2.3522 }]}
        onMarkerClick={onMarkerClick}
      />,
    );
    await waitFor(() => expect(markerListeners.click).toBeDefined());

    markerListeners.click({});

    expect(onMarkerClick).toHaveBeenCalledWith('saved-1');
  });

  it('중심이 바뀌면 지도를 다시 만들지 않고 옮깁니다', async () => {
    const { rerender } = render(
      <GoogleCanvas center={{ lat: 48.8566, lng: 2.3522 }} zoomLevel="pinpoint" markers={[]} />,
    );
    await waitFor(() => expect(mapMock).toHaveBeenCalledTimes(1));

    rerender(<GoogleCanvas center={{ lat: 48.86, lng: 2.36 }} zoomLevel="pinpoint" markers={[]} />);

    await waitFor(() => expect(setCenter).toHaveBeenCalled());
    expect(mapMock).toHaveBeenCalledTimes(1);
  });

  it('스크립트 준비 직후 importLibrary가 늦게 노출돼도 지도를 만듭니다', async () => {
    const maps = (globalThis as unknown as { google: { maps: Record<string, unknown> } }).google
      .maps;
    const importLibrary = maps.importLibrary;
    maps.importLibrary = undefined;
    window.setTimeout(() => {
      maps.importLibrary = importLibrary;
    }, 10);

    render(
      <GoogleCanvas center={{ lat: 48.8566, lng: 2.3522 }} zoomLevel="pinpoint" markers={[]} />,
    );

    await waitFor(() => expect(mapMock).toHaveBeenCalledTimes(1));
  });

  it('스크립트 로드에 실패하면 onError를 부르고 예외를 던지지 않습니다', async () => {
    scriptShouldFail = true;
    const onError = vi.fn();

    render(
      <GoogleCanvas
        center={{ lat: 48.8566, lng: 2.3522 }}
        zoomLevel="pinpoint"
        markers={[]}
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mapMock).not.toHaveBeenCalled();
  });
});
