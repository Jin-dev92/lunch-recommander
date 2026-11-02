// lib/region.ts와 같은 경계값. Deno 런타임이라 lib/를 import할 수 없어 중복해 둔다.
// 경계를 바꿀 때는 두 파일을 함께 고쳐야 한다. 오판 사례 설명은 lib/region.ts 주석 참고.
export const MAP_PROVIDER = {
  KAKAO: 'kakao',
  GOOGLE: 'google',
} as const;

export type MapProvider = (typeof MAP_PROVIDER)[keyof typeof MAP_PROVIDER];

// 경도 상한 129.6은 후쿠오카(130.4°E)를 국내로 오판하지 않기 위한 값이다.
const KOREA_BOUNDS = { minLat: 33.0, maxLat: 38.7, minLng: 124.5, maxLng: 129.6 } as const;

export function isInKorea(lat: number, lng: number): boolean {
  return (
    lat >= KOREA_BOUNDS.minLat &&
    lat <= KOREA_BOUNDS.maxLat &&
    lng >= KOREA_BOUNDS.minLng &&
    lng <= KOREA_BOUNDS.maxLng
  );
}

export function providerFor(lat: number, lng: number): MapProvider {
  return isInKorea(lat, lng) ? MAP_PROVIDER.KAKAO : MAP_PROVIDER.GOOGLE;
}
