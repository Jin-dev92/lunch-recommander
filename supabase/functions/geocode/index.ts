import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit, type UsageStore } from '../_shared/rateLimit.ts';
import { withCors } from '../_shared/cors.ts';

// 주소 문자열의 상한. 정상 주소는 이보다 훨씬 짧고, 지나치게 긴 입력은 지오코딩에 넘기지 않는다.
const MAX_ADDRESS_LENGTH = 200;

export type Coords = { lat: number; lng: number };
export type GeocodeDeps = {
  authenticate: (jwt: string) => Promise<{ id: string } | null>;
  checkLimit: (userId: string, ip: string) => Promise<boolean>;
  geocode: (address: string) => Promise<Coords | null>;
};

export function createGeocodeHandler(deps: GeocodeDeps) {
  return async (request: Request): Promise<Response> => {
    const jwt = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const user = jwt ? await deps.authenticate(jwt) : null;
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    // 지오코딩도 과금 대상이라 요금폭탄 방지를 위해 nearby와 같은 레이트리밋을 건다.
    if (!(await deps.checkLimit(user.id, ip)))
      return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });

    let body: { address?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' }, { status: 400 });
    }
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address || address.length > MAX_ADDRESS_LENGTH)
      return Response.json({ error: '검색할 주소를 입력해주세요.' }, { status: 400 });

    let coords: Coords | null;
    try {
      coords = await deps.geocode(address);
    } catch {
      return Response.json({ error: '주소 검색에 실패했습니다.' }, { status: 502 });
    }
    if (!coords) return Response.json({ error: '주소를 찾을 수 없습니다.' }, { status: 404 });
    return Response.json(coords);
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase/Google 연동입니다. 테스트에서는 사용하지 않습니다. ---

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

// Google Geocoding API. language·region을 한국 기준으로 맞춰 국내 주소 해석 정확도를 높인다.
// 서버 키는 이 함수 밖으로 나가지 않는다.
export function createGeocoder(googleApiKey: string): GeocodeDeps['geocode'] {
  return async (address) => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('language', 'ko');
    url.searchParams.set('region', 'kr');
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

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`필수 환경변수 ${name}가 설정되지 않았습니다.`);
  return value;
}

if (import.meta.main) {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  // nearby·place-photo와 같은 서버 키를 쓴다. 이 키에 Geocoding API 접근을 허용해야 한다.
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
    geocode: createGeocoder(googleApiKey),
  };

  Deno.serve(withCors(createGeocodeHandler(deps)));
}
