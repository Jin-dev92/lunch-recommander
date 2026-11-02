/**
 * 지도 캔버스 공통 props. KakaoCanvas와 GoogleCanvas가 같은 모양을 받아
 * 소비 컴포넌트(Map.tsx, SavedPlacesMap.tsx)가 provider를 몰라도 되게 한다.
 *
 * 이 props 하나가 두 용도를 덮는다.
 *   - 위치 지정: 드래그 가능한 마커 1개 + onMapClick + onMarkerDragEnd
 *   - 저장 맛집: 마커 N개 + onMarkerClick
 */

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  draggable?: boolean;
};

/**
 * 확대 수준을 의미값으로 받는다. 카카오 level은 작을수록 확대되고 Google zoom은
 * 클수록 확대돼 방향이 반대인데, 그 차이를 각 캔버스 안에 가둬 둔다.
 */
export type MapZoomLevel = 'pinpoint' | 'city';

export type MapCanvasProps = {
  center: { lat: number; lng: number };
  zoomLevel: MapZoomLevel;
  markers: MapMarker[];
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void;
  onMarkerClick?: (id: string) => void;
  /** SDK 로딩·초기화 실패. 문구는 소비 컴포넌트가 정한다. */
  onError?: () => void;
  className?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
};
