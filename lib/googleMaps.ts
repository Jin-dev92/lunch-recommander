// 해외 좌표에서 쓰는 Google Maps SDK 로딩 유틸. 국내는 lib/kakaoMaps.ts를 쓴다.
// 어느 쪽을 쓸지는 lib/region.ts의 providerFor가 좌표로 결정한다.
const MAPS_SDK_POLL_INTERVAL_MS = 50;
const MAPS_SDK_TIMEOUT_MS = 5000;

export function waitForMapsSdk(): Promise<typeof google.maps> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const maps = (
        globalThis as unknown as {
          google?: { maps?: { importLibrary?: unknown } };
        }
      ).google?.maps;
      if (maps && typeof maps.importLibrary === 'function') {
        resolve(maps as typeof google.maps);
        return;
      }
      if (Date.now() - startedAt >= MAPS_SDK_TIMEOUT_MS) {
        reject(new Error('Google Maps SDK 준비 시간이 초과되었습니다.'));
        return;
      }
      window.setTimeout(check, MAPS_SDK_POLL_INTERVAL_MS);
    };
    check();
  });
}

// loading=async는 Google이 권장하는 로딩 방식이다(생략하면 콘솔 경고가 뜬다). 대신 스크립트가
// 비동기로 들어오므로 google 전역이 언제 준비되는지 알 수 없어, onReady + importLibrary로 기다린다.
// language=ko는 해외 지도에서도 라벨을 한국어로 보여준다. region은 주소 표기 기준이라
// 해외 전용 경로에서는 지정하지 않는다(현지 표기를 그대로 받는다).
export const MAPS_SCRIPT_SRC =
  'https://maps.googleapis.com/maps/api/js' +
  `?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}` +
  '&loading=async&language=ko';
