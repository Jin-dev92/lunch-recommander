import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Map from './Map';

// ponytail: 실제 Google Maps SDK를 로드하면 네트워크 호출이 발생하므로 전역 google 객체를 모킹
const mapMock = vi.fn();
const markerMock = vi.fn();
beforeEach(() => {
  mapMock.mockReset();
  markerMock.mockReset();
  (globalThis as unknown as { google: typeof google }).google = {
    maps: { Map: mapMock, Marker: markerMock },
  } as unknown as typeof google;
});

describe('지도', () => {
  it('두 검색 반경을 제공합니다', () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } });
    render(<Map onLocationChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: '500m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1km' })).toBeInTheDocument();
  });

  it('현재 위치를 얻으면 콜백과 지도를 초기화합니다', async () => {
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 37.5, longitude: 127.0 } }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    render(<Map onLocationChange={onLocationChange} />);
    await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0, radius: 500 }));
    expect(mapMock).toHaveBeenCalledWith(expect.anything(), { center: { lat: 37.5, lng: 127.0 }, zoom: 16 });
    expect(markerMock).toHaveBeenCalledWith({ position: { lat: 37.5, lng: 127.0 }, map: expect.anything() });
  });

  it('구글 지도 SDK가 로드되지 않았으면 에러 메시지를 보여주고 예외를 던지지 않습니다', async () => {
    // SDK 로드 실패/차단 상황을 재현하기 위해 전역 google을 제거한다
    delete (globalThis as unknown as { google?: typeof google }).google;
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 37.5, longitude: 127.0 } }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    render(<Map onLocationChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('지도를 불러오지 못했습니다'));
    expect(mapMock).not.toHaveBeenCalled();
  });

  it('위치 권한이 거부되면 에러 메시지를 보여줍니다', async () => {
    const getCurrentPosition = vi.fn((_success, error) => error());
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    render(<Map onLocationChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('현재 위치 권한이 필요합니다.'));
  });

  it('반경을 변경하면 콜백에 새 반경이 전달됩니다', async () => {
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 37.5, longitude: 127.0 } }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const onLocationChange = vi.fn();
    render(<Map onLocationChange={onLocationChange} />);
    await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0, radius: 500 }));
    fireEvent.change(screen.getByLabelText('검색 반경'), { target: { value: '1000' } });
    await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0, radius: 1000 }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mapMock).toHaveBeenCalledTimes(1);
  });
});
