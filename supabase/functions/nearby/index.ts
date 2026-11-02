import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit, type UsageStore } from '../_shared/rateLimit.ts';
import { withCors } from '../_shared/cors.ts';

export type NearbyRestaurant = {
  // 카카오 장소 식별자(로컬 API documents[].id)
  placeId: string;
  name: string;
  // category는 카카오 category_name("음식점 > 한식 > 육류,고기")의 2단계 값("한식")이다.
  // 선호 가중치의 저장 키이자 음식 종류 필터 기준이므로 표기가 바뀌지 않는 값을 쓴다.
  // 화면에는 더 구체적인 categoryLabel을 보여준다.
  category: string;
  categoryLabel: string;
  // 사람이 읽는 주소(도로명 우선). 좌표만으로 위치를 알기 어려워 함께 보관한다.
  address: string | null;
  lat: number;
  lng: number;
  // 카카오맵 장소 상세 페이지(place_url). 카카오 로컬 API에는 사진·평점·가격대가 없어서
  // 메뉴·사진·리뷰는 이 링크로 넘긴다. 캐시 적중 시에도 링크가 살아 있어야 해 DB에 보관한다.
  placeUrl: string;
  distanceMeters: number;
};
export type NearbyDeps = {
  authenticate: (jwt: string) => Promise<{ id: string } | null>;
  checkLimit: (userId: string, ip: string) => Promise<boolean>;
  findCached: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>;
  fetchKakao: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>;
  upsert: (rows: NearbyRestaurant[]) => Promise<void>;
};

export function createNearbyHandler(deps: NearbyDeps) {
  return async (request: Request): Promise<Response> => {
    const jwt = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const user = jwt ? await deps.authenticate(jwt) : null;
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    if (!(await deps.checkLimit(user.id, ip)))
      return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });
    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' }, { status: 400 });
    }
    if (
      !Number.isFinite(body.lat) ||
      !Number.isFinite(body.lng) ||
      ![100, 300, 500, 1000].includes(body.radius)
    )
      return Response.json({ error: '위치 또는 반경이 올바르지 않습니다.' }, { status: 400 });
    const cached = await deps.findCached(body.lat, body.lng, body.radius);
    if (cached.length) return Response.json({ restaurants: cached, source: 'cache' });
    let restaurants: NearbyRestaurant[];
    try {
      restaurants = await deps.fetchKakao(body.lat, body.lng, body.radius);
    } catch {
      return Response.json({ error: '외부 위치 정보 조회에 실패했습니다.' }, { status: 502 });
    }
    await deps.upsert(restaurants);
    return Response.json({ restaurants, source: 'kakao' });
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase/카카오 연동입니다. 테스트에서는 사용하지 않습니다. ---

const CACHE_TTL_MS = 15 * 60 * 1000;

// 카카오 로컬 API의 음식점 카테고리 그룹 코드. CE7(카페)은 별개 코드라 여기에 포함되지 않는다.
// @see https://developers.kakao.com/docs/ko/local/dev-guide
const KAKAO_CATEGORY_GROUP_FOOD = 'FD6';
// 카테고리 검색의 한 페이지 최대 건수는 15다. 음식 종류 필터가 후보를 더 좁히므로
// 첫 페이지가 꽉 찼을 때만 두 번째 페이지를 더 받아 추천 풀을 넓힌다(최대 2회 호출).
const KAKAO_PAGE_SIZE = 15;
const KAKAO_MAX_PAGES = 2;

// 거리는 캐시 행과 신규 조회 모두 이 함수로 계산한다. 카카오 응답에도 distance가 있지만
// 캐시 경로에는 없어서, 두 경로의 값이 어긋나지 않도록 한 가지 계산만 쓴다.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

// 원자적 증가는 반드시 DB 함수 `increment_api_usage`(INSERT ... ON CONFLICT DO UPDATE ... RETURNING count,
// service_role 전용, supabase/migrations/0002_rls.sql)를 통해서만 수행합니다.
// select 후 upsert로 TS에서 재구현하면 동시 요청 간 카운트 경합으로 한도 우회(요금폭탄 위험)가 발생합니다.
export function createUsageStore(supabase: RpcClient): UsageStore {
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

/**
 * 카카오 category_name("음식점 > 한식 > 육류,고기")을 저장 키와 표시 라벨로 쪼갠다.
 * 2단계 값이 저장 키(category_prefs.category와 짝)이고, 마지막 단계가 화면 표시용이다.
 */
export function splitCategoryName(categoryName: string): {
  category: string;
  categoryLabel: string;
} {
  const parts = categoryName
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  const category = parts[1] ?? '기타';
  // 단계가 2개 이하면 더 구체적인 라벨이 없으므로 저장 키를 그대로 보여준다.
  return { category, categoryLabel: parts.length > 2 ? parts[parts.length - 1] : category };
}

export function createKakaoFetcher(kakaoRestApiKey: string): NearbyDeps['fetchKakao'] {
  return async (lat, lng, radius) => {
    const restaurants: NearbyRestaurant[] = [];
    for (let page = 1; page <= KAKAO_MAX_PAGES; page++) {
      const url = new URL('https://dapi.kakao.com/v2/local/search/category.json');
      url.searchParams.set('category_group_code', KAKAO_CATEGORY_GROUP_FOOD);
      // 카카오는 x가 경도, y가 위도다(LatLng 순서와 반대).
      url.searchParams.set('x', String(lng));
      url.searchParams.set('y', String(lat));
      url.searchParams.set('radius', String(radius));
      url.searchParams.set('sort', 'distance');
      url.searchParams.set('size', String(KAKAO_PAGE_SIZE));
      url.searchParams.set('page', String(page));
      // REST API 키는 이 함수 밖으로 나가지 않는다(브라우저에 노출하면 도메인 제한이 없어 남용된다).
      const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
      });
      if (!response.ok) throw new Error(`카카오 로컬 API 오류: ${response.status}`);
      let json: any;
      try {
        json = await response.json();
      } catch {
        throw new Error('카카오 로컬 API 응답을 파싱할 수 없습니다.');
      }
      const documents = json.documents ?? [];
      for (const place of documents) {
        const placeLat = Number(place.y);
        const placeLng = Number(place.x);
        restaurants.push({
          placeId: place.id,
          name: place.place_name ?? '',
          ...splitCategoryName(place.category_name ?? ''),
          address: place.road_address_name || place.address_name || null,
          lat: placeLat,
          lng: placeLng,
          placeUrl: place.place_url ?? '',
          distanceMeters: distanceMeters(lat, lng, placeLat, placeLng),
        });
      }
      // 더 받을 것이 없으면 두 번째 호출을 아낀다.
      if (json.meta?.is_end !== false || documents.length < KAKAO_PAGE_SIZE) break;
    }
    return restaurants;
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
  const kakaoRestApiKey = requireEnv('KAKAO_REST_API_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const usageStore = createUsageStore(supabase);

  const deps: NearbyDeps = {
    authenticate: async (jwt) => {
      const { data, error } = await supabase.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    checkLimit: async (userId, ip) => (await checkRateLimit(usageStore, userId, ip)).allowed,
    findCached: async (lat, lng, radius) => {
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data, error } = await supabase
        .from('restaurants')
        .select('place_id,name,category,category_label,address,lat,lng,place_url,fetched_at')
        .gte('fetched_at', cutoff);
      if (error) throw error;
      return (data ?? [])
        .map((row) => ({
          placeId: row.place_id,
          name: row.name,
          category: row.category,
          // 라벨을 모르는 구버전 캐시 행은 저장 키를 그대로 보여준다(15분 뒤 새 값으로 대체된다).
          categoryLabel: row.category_label ?? row.category,
          address: row.address ?? null,
          lat: row.lat,
          lng: row.lng,
          placeUrl: row.place_url ?? '',
          distanceMeters: distanceMeters(lat, lng, row.lat, row.lng),
        }))
        .filter((row) => row.distanceMeters <= radius);
    },
    fetchKakao: createKakaoFetcher(kakaoRestApiKey),
    upsert: async (rows) => {
      if (!rows.length) return;
      const { error } = await supabase.from('restaurants').upsert(
        rows.map((row) => ({
          place_id: row.placeId,
          name: row.name,
          category: row.category,
          category_label: row.categoryLabel,
          address: row.address,
          lat: row.lat,
          lng: row.lng,
          place_url: row.placeUrl,
          fetched_at: new Date().toISOString(),
        })),
      );
      if (error) throw error;
    },
  };

  Deno.serve(withCors(createNearbyHandler(deps)));
}
