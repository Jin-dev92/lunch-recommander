import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapCanvasProps } from './types';

// 어느 캔버스가 선택됐는지만 보면 되므로 두 SDK 구현을 표식으로 대체한다.
vi.mock('./KakaoCanvas', () => ({
  default: (props: MapCanvasProps) => <div data-testid="kakao" aria-label={props.ariaLabel} />,
}));
vi.mock('./GoogleCanvas', () => ({
  default: (props: MapCanvasProps) => <div data-testid="google" aria-label={props.ariaLabel} />,
}));

import MapCanvas from './MapCanvas';

function renderAt(lat: number, lng: number) {
  return render(
    <MapCanvas center={{ lat, lng }} zoomLevel="pinpoint" markers={[]} ariaLabel="지도" />,
  );
}

describe('지도 provider 선택', () => {
  it('국내 좌표에서는 카카오 캔버스를 씁니다', () => {
    renderAt(37.5665, 126.978); // 서울시청
    expect(screen.getByTestId('kakao')).toBeInTheDocument();
    expect(screen.queryByTestId('google')).not.toBeInTheDocument();
  });

  it('제주도 좌표도 국내로 봅니다', () => {
    renderAt(33.4996, 126.5312); // 제주시
    expect(screen.getByTestId('kakao')).toBeInTheDocument();
  });

  it('해외 좌표에서는 Google 캔버스를 씁니다', () => {
    renderAt(48.8566, 2.3522); // 파리
    expect(screen.getByTestId('google')).toBeInTheDocument();
    expect(screen.queryByTestId('kakao')).not.toBeInTheDocument();
  });

  it('후쿠오카는 해외로 판정합니다', () => {
    // 느슨한 사각형(경도 124~132)을 쓰면 후쿠오카가 국내로 오판돼 카카오에서 빈 결과가 온다.
    // 일본은 가장 가능성 높은 해외 목적지라 이 경계가 중요하다.
    renderAt(33.5904, 130.4017);
    expect(screen.getByTestId('google')).toBeInTheDocument();
  });

  it('도쿄·뉴욕도 해외로 판정합니다', () => {
    renderAt(35.6762, 139.6503);
    expect(screen.getByTestId('google')).toBeInTheDocument();
    renderAt(40.7128, -74.006);
    expect(screen.getAllByTestId('google').length).toBeGreaterThan(0);
  });

  it('지역이 바뀌면 이전 캔버스를 언마운트합니다', () => {
    const { rerender } = render(
      <MapCanvas center={{ lat: 37.5665, lng: 126.978 }} zoomLevel="pinpoint" markers={[]} />,
    );
    expect(screen.getByTestId('kakao')).toBeInTheDocument();

    rerender(
      <MapCanvas center={{ lat: 48.8566, lng: 2.3522 }} zoomLevel="pinpoint" markers={[]} />,
    );

    // 두 SDK가 같은 div를 번갈아 조작하면 지도 인스턴스가 꼬이므로 완전히 교체돼야 한다.
    expect(screen.queryByTestId('kakao')).not.toBeInTheDocument();
    expect(screen.getByTestId('google')).toBeInTheDocument();
  });
});
