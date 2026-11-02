/**
 * 검색 좌표가 국내인지 판정해 지도·장소 검색 provider를 고른다.
 * Edge Function은 Deno 런타임이라 이 파일을 import할 수 없어
 * supabase/functions/_shared/region.ts에 같은 경계값을 둔다. 둘을 함께 고쳐야 한다.
 */

export const MAP_PROVIDER = {
  KAKAO: 'kakao',
  GOOGLE: 'google',
} as const;

export type MapProvider = (typeof MAP_PROVIDER)[keyof typeof MAP_PROVIDER];

/**
 * 한국 좌표 사각형. 경도 상한 129.6은 **후쿠오카(130.4°E)를 제외하기 위한 값**이다.
 * 흔히 쓰는 느슨한 사각형(경도 124~132)은 후쿠오카·기타큐슈를 국내로 오판해
 * 일본 여행 중에 카카오로 라우팅되고 빈 결과를 받게 된다.
 *
 * 알려진 오판 두 가지:
 *   - 쓰시마(34.4°N, 129.3°E)는 국내로 판정된다. 후쿠오카를 제외하면서 쓰시마까지
 *     빼려면 사각형 하나로는 부족해, 목적지 빈도가 낮다고 보고 감수한다.
 *   - 울릉도(130.9°E)·독도(131.9°E)는 해외로 판정된다. Google이 정상 렌더하므로
 *     기능상 문제는 없다.
 */
const KOREA_BOUNDS = {
  minLat: 33.0,
  maxLat: 38.7,
  minLng: 124.5,
  maxLng: 129.6,
} as const;

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
