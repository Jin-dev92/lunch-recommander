import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit, type UsageStore } from '../_shared/rateLimit.ts';
import { withCors } from '../_shared/cors.ts';
import { MAP_PROVIDER, providerFor, type MapProvider } from '../_shared/region.ts';

// 주소 문자열의 상한. 정상 주소는 이보다 훨씬 짧고, 지나치게 긴 입력은 지오코딩에 넘기지 않는다.
const MAX_ADDRESS_LENGTH = 200;
// near가 없으면 국내로 간주한다. 주 사용 환경이 국내이고, 틀렸더라도 사용자가 지도를
// 해외로 옮긴 뒤 다시 검색하면 그때는 올바른 provider로 간다.
const DEFAULT_PROVIDER: MapProvider = MAP_PROVIDER.KAKAO;

export type Coords = { lat: number; lng: number };
export type GeocodeDeps = {
  authenticate: (jwt: string) => Promise<{ id: string } | null>;
  checkLimit: (userId: string, ip: string) => Promise<boolean>;
  geocode: (address: string, provider: MapProvider) => Promise<Coords | null>;
};

export function createGeocodeHandler(deps: GeocodeDeps) {
  return async (request: Request): Promise<Response> => {
    const jwt = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const user = jwt ? await deps.authenticate(jwt) : null;
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    // 지오코딩도 외부 API 호출 한도를 쓰므로 남용 방지를 위해 nearby와 같은 레이트리밋을 건다.
    // 국내 경로는 폴백까지 타면 한 요청이 외부 호출 2회를 쓴다.
    if (!(await deps.checkLimit(user.id, ip)))
      return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });

    let body: { address?: unknown; near?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' }, { status: 400 });
    }
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address || address.length > MAX_ADDRESS_LENGTH)
      return Response.json({ error: '검색할 주소를 입력해주세요.' }, { status: 400 });

    // 검색 시점에는 결과 좌표를 모르므로, 현재 지도 중심(near)으로 provider를 고른다.
    const provider = nearProvider(body.near);

    let coords: Coords | null;
    try {
      coords = await deps.geocode(address, provider);
    } catch {
      return Response.json({ error: '주소 검색에 실패했습니다.' }, { status: 502 });
    }
    if (!coords) return Response.json({ error: '주소를 찾을 수 없습니다.' }, { status: 404 });
    return Response.json(coords);
  };
}

/** near가 없거나 좌표 형식이 아니면 국내로 간주한다. */
export function nearProvider(near: unknown): MapProvider {
  if (!near || typeof near !== 'object') return DEFAULT_PROVIDER;
  const { lat, lng } = near as { lat?: unknown; lng?: unknown };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return DEFAULT_PROVIDER;
  return providerFor(lat as number, lng as number);
}

// --- 운영 어댑터: 아래는 실제 Supabase/카카오/Google 연동입니다. 테스트에서는 사용하지 않습니다. ---

// 원자적 증가는 nearby와 동일하게 DB 함수 increment_api_usage를 거친다(경합 시 한도 우회 방지).
function createUsageStore(supabase: {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}): UsageStore {
  return {
    increment: async (key) => {
      const { data, error } = await supabase.rpc('increment_api_usage', {
        p_user_id: key.userId,
        p_ip: key.ip,
        p_window_start: key.windowStart,
      });
      if (error) throw error;
      return data as number;
    },
  };
}

const KAKAO_ADDRESS_URL = 'https://dapi.kakao.com/v2/local/search/address.json';
const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/**
 * 국내 지오코딩. 카카오는 주소 해석과 장소명 검색이 다른 엔드포인트로 나뉘어 있다.
 * 검색창은 "판교역" 같은 장소명과 "서울 강남구 테헤란로 1" 같은 주소를 모두 받으므로,
 * 주소 검색을 먼저 시도하고 결과가 없을 때만 키워드 검색으로 재시도한다.
 * REST 키는 이 함수 밖으로 나가지 않는다.
 * @see https://developers.kakao.com/docs/ko/local/dev-guide
 */
export function createKakaoGeocoder(kakaoRestApiKey: string) {
  // 두 엔드포인트 모두 documents[0]의 최상위 x(경도)·y(위도)를 대표 좌표로 돌려준다.
  // 주소 검색 응답에는 address·road_address 안에도 좌표가 있지만, 문서가 어느 쪽을 쓰라고
  // 지정하지 않으므로 카카오가 질의에 대해 고른 최상위 값을 쓴다.
  const lookup = async (endpoint: string, query: string): Promise<Coords | null> => {
    const url = new URL(endpoint);
    url.searchParams.set('query', query);
    url.searchParams.set('size', '1');
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
    });
    if (!response.ok) throw new Error(`카카오 로컬 API 오류: ${response.status}`);
    const json = (await response.json()) as { documents?: { x?: string; y?: string }[] };
    const first = json.documents?.[0];
    if (!first) return null;
    const lat = Number(first.y);
    const lng = Number(first.x);
    // 좌표가 숫자로 파싱되지 않으면 "못 찾음"과 같게 취급한다(지도를 엉뚱한 곳으로 옮기지 않는다).
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  return async (address: string): Promise<Coords | null> =>
    (await lookup(KAKAO_ADDRESS_URL, address)) ?? (await lookup(KAKAO_KEYWORD_URL, address));
}

/**
 * 해외 지오코딩. Google Geocoding API는 정식 주소와 장소명을 한 엔드포인트에서 처리하므로
 * 폴백이 필요 없다. region은 지정하지 않는다 — 해외 전용 경로라 현지 기준 해석을 그대로 쓴다.
 * 서버 키는 이 함수 밖으로 나가지 않는다.
 */
export function createGoogleGeocoder(googleApiKey: string) {
  return async (address: string): Promise<Coords | null> => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('language', 'ko');
    url.searchParams.set('key', googleApiKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding API 오류: ${response.status}`);
    const json = (await response.json()) as {
      status?: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    // 결과가 없는 것은 오류가 아니라 "못 찾음"이므로 null로 구분한다.
    if (json.status === 'ZERO_RESULTS') return null;
    if (json.status !== 'OK') throw new Error(`Geocoding API 상태: ${json.status}`);
    const location = json.results?.[0]?.geometry?.location;
    return location ? { lat: location.lat, lng: location.lng } : null;
  };
}

/** 좌표가 국내인지에 따라 카카오/Google 지오코더를 고른다. */
export function createGeocoder(
  geocodeKakao: (address: string) => Promise<Coords | null>,
  geocodeGoogle: (address: string) => Promise<Coords | null>,
): GeocodeDeps['geocode'] {
  return (address, provider) =>
    provider === MAP_PROVIDER.KAKAO ? geocodeKakao(address) : geocodeGoogle(address);
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`필수 환경변수 ${name}가 설정되지 않았습니다.`);
  return value;
}

if (import.meta.main) {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  // nearby와 같은 서버 키 두 개를 쓴다. 카카오는 국내, Google은 해외 경로를 담당한다.
  const kakaoRestApiKey = requireEnv('KAKAO_REST_API_KEY');
  const googleApiKey = requireEnv('GOOGLE_PLACES_API_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const usageStore = createUsageStore(supabase);

  const deps: GeocodeDeps = {
    authenticate: async (jwt) => {
      const { data, error } = await supabase.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    checkLimit: async (userId, ip) => (await checkRateLimit(usageStore, userId, ip)).allowed,
    geocode: createGeocoder(
      createKakaoGeocoder(kakaoRestApiKey),
      createGoogleGeocoder(googleApiKey),
    ),
  };

  Deno.serve(withCors(createGeocodeHandler(deps)));
}
