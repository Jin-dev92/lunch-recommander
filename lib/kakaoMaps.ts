// Map.tsx와 SavedPlacesMap.tsx가 공유하는 카카오맵 SDK 로딩 유틸.
//
// 카카오 SDK는 TypeScript 타입을 제공하지 않는다. 커뮤니티 타입 패키지를 의존성으로 끌어오는 대신,
// 이 앱이 실제로 쓰는 API(지도·마커·이벤트·좌표)만 아래에 직접 선언한다. 사용 범위가 좁고
// 프로젝트 규칙이 `as any`를 금지하므로 정확한 타입이 필요하다.
// @see https://apis.map.kakao.com/web/documentation/

export type KakaoLatLng = {
  getLat(): number;
  getLng(): number;
};

/** 지도 클릭 이벤트 핸들러가 받는 인자. @see https://apis.map.kakao.com/web/sample/addMapClickEventWithMarker/ */
export type KakaoMouseEvent = {
  latLng: KakaoLatLng;
};

export type KakaoMap = {
  setCenter(latLng: KakaoLatLng): void;
  setLevel(level: number): void;
  getCenter(): KakaoLatLng;
};

export type KakaoMarker = {
  setPosition(latLng: KakaoLatLng): void;
  getPosition(): KakaoLatLng;
  // 카카오 마커에는 Google의 setVisible(boolean)에 대응하는 메서드가 없다.
  // 지도에서 떼거나(null) 다시 붙여서 표시 여부를 제어한다.
  setMap(map: KakaoMap | null): void;
};

export type KakaoMaps = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (options: {
    map?: KakaoMap;
    position: KakaoLatLng;
    draggable?: boolean;
    title?: string;
  }) => KakaoMarker;
  event: {
    // 마커 dragend 콜백은 인자를 받지 않으므로(샘플 addDraggableMarkerDragEvent 참고)
    // 새 좌표는 marker.getPosition()으로 읽는다. 지도 click 콜백만 MouseEvent를 받는다.
    addListener(
      target: KakaoMap | KakaoMarker,
      type: string,
      handler: (event: KakaoMouseEvent) => void,
    ): void;
  };
  load(callback: () => void): void;
};

/**
 * 확대 레벨. 카카오는 1~14이며 **숫자가 작을수록 확대**된다(Google zoom과 방향이 반대다).
 * 좌표가 확정되면 가게가 구분되는 수준(3)으로, 좌표를 모를 때는 도시 전체가 보이는 수준(6)으로 둔다.
 */
export const KAKAO_MAP_LEVEL = {
  PINPOINT: 3,
  CITY: 6,
} as const;

/**
 * autoload=false를 붙이면 SDK가 자동 초기화를 건너뛰고, kakao.maps.load 콜백이 초기화 완료를
 * 알려준다. next/script가 스크립트를 비동기로 주입해 전역이 언제 준비되는지 알 수 없으므로
 * 이 콜백이 필요하다. appkey는 도메인 제한이 걸린 공개 JavaScript 키다(REST 키가 아니다).
 * @see https://apis.map.kakao.com/web/documentation/ (kakao.maps.load)
 */
export const KAKAO_MAP_SCRIPT_SRC =
  'https://dapi.kakao.com/v2/maps/sdk.js' +
  `?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}` +
  '&autoload=false';

const SDK_POLL_INTERVAL_MS = 50;
const SDK_TIMEOUT_MS = 5000;

/**
 * 스크립트 태그가 준비된 뒤 호출한다. SDK 초기화가 끝난 kakao.maps를 돌려준다.
 *
 * next/script의 준비 이벤트가 스크립트 본문 실행보다 먼저 뜰 수 있어, 전역이 실제로 나타날
 * 때까지 기다린다(한 번만 검사하고 실패로 확정하면 지도가 영구히 빈 영역으로 남는다 —
 * docs/superpowers/specs/2026-07-25-map-initial-render-fix.md 참고).
 * 전역이 준비된 뒤에는 kakao.maps.load 콜백이 초기화 완료를 알려준다.
 */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const maps = (globalThis as unknown as { kakao?: { maps?: KakaoMaps } }).kakao?.maps;
      if (maps && typeof maps.load === 'function') {
        maps.load(() => resolve(maps));
        return;
      }
      if (Date.now() - startedAt >= SDK_TIMEOUT_MS) {
        reject(new Error('카카오맵 SDK 준비 시간이 초과되었습니다.'));
        return;
      }
      window.setTimeout(check, SDK_POLL_INTERVAL_MS);
    };
    check();
  });
}
