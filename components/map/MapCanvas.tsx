'use client';

import { MAP_PROVIDER, providerFor } from '../../lib/region';
import GoogleCanvas from './GoogleCanvas';
import KakaoCanvas from './KakaoCanvas';
import type { MapCanvasProps } from './types';

/**
 * 좌표로 지도 provider를 골라 캔버스 하나만 렌더한다. 고르지 않은 쪽의 SDK 스크립트는
 * 아예 받지 않으므로 불필요한 네트워크 비용과 과금이 생기지 않는다.
 *
 * key를 provider로 주어, 지역이 바뀌면 이전 캔버스를 언마운트하고 새로 만든다.
 * 두 SDK가 같은 div를 번갈아 조작하면 지도 인스턴스가 꼬인다.
 */
export default function MapCanvas(props: MapCanvasProps) {
  const provider = providerFor(props.center.lat, props.center.lng);
  return provider === MAP_PROVIDER.KAKAO ? (
    <KakaoCanvas key={MAP_PROVIDER.KAKAO} {...props} />
  ) : (
    <GoogleCanvas key={MAP_PROVIDER.GOOGLE} {...props} />
  );
}
