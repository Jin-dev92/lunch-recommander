import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit, type UsageStore } from '../_shared/rateLimit.ts';
import { withCors } from '../_shared/cors.ts';
import { MAP_PROVIDER, providerFor, type MapProvider } from '../_shared/region.ts';
import { mapGoogleCategory, splitCategoryName } from '../_shared/category.ts';

export type NearbyRestaurant = {
  // 제공자가 준 장소 식별자. 카카오는 숫자 문자열, Google은 ChIJ로 시작해 형식이 겹치지 않는다.
  placeId: string;
  provider: MapProvider;
  name: string;
  // category는 한국어 음식 종류("한식")다. 선호 가중치의 저장 키이자 음식 종류 필터 기준이라
  // 표기가 바뀌지 않는 값을 쓴다. 카카오는 category_name의 2단계, Google은 primaryType을
  // 같은 한국어 값으로 매핑해 넣는다(_shared/category.ts). 화면에는 categoryLabel을 쓴다.
  category: string;
  categoryLabel: string;
  // 사람이 읽는 주소. 좌표만으로 위치를 알기 어려워 함께 보관한다.
  address: string | null;
  lat: number;
  lng: number;
  // 장소 상세 페이지. 사진·메뉴·리뷰를 이 링크가 담당하므로 캐시 적중 시에도 살아 있어야 한다.
  placeUrl: string;
  // 아래 셋은 Google(해외) 결과에만 값이 있다. 카카오 로컬 API에는 평점·리뷰·가격대가 없다.
  googleRating: number | null;
  googleRatingsTotal: number;
  priceLevel: string | null;
  distanceMeters: number;
};
export type NearbyDeps = {
  authenticate: (jwt: string) => Promise<{ id: string } | null>;
  checkLimit: (userId: string, ip: string) => Promise<boolean>;
  findCached: (
    lat: number,
    lng: number,
    radius: number,
    provider: MapProvider,
  ) => Promise<NearbyRestaurant[]>;
  fetchPlaces: (
    lat: number,
    lng: number,
    radius: number,
    provider: MapProvider,
  ) => Promise<NearbyRestaurant[]>;
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
    // 국내 좌표면 카카오, 해외면 Google. 캐시도 provider별로 분리해 조회한다.
    const provider = providerFor(body.lat, body.lng);
    const cached = await deps.findCached(body.lat, body.lng, body.radius, provider);
    if (cached.length) return Response.json({ restaurants: cached, source: 'cache' });
    let restaurants: NearbyRestaurant[];
    try {
      restaurants = await deps.fetchPlaces(body.lat, body.lng, body.radius, provider);
    } catch {
      return Response.json({ error: '외부 위치 정보 조회에 실패했습니다.' }, { status: 502 });
    }
    await deps.upsert(restaurants);
    return Response.json({ restaurants, source: provider });
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase/카카오/Google 연동입니다. 테스트에서는 사용하지 않습니다. ---

const CACHE_TTL_MS = 15 * 60 * 1000;

// 카카오 로컬 API의 음식점 카테고리 그룹 코드. CE7(카페)은 별개 코드라 포함되지 않는다.
// @see https://developers.kakao.com/docs/ko/local/dev-guide
const KAKAO_CATEGORY_GROUP_FOOD = 'FD6';
// 카테고리 검색의 한 페이지 최대 건수는 15다. 음식 종류 필터가 후보를 더 좁히므로
// 첫 페이지가 꽉 찼을 때만 두 번째 페이지를 더 받아 추천 풀을 넓힌다(최대 2회 호출).
const KAKAO_PAGE_SIZE = 15;
const KAKAO_MAX_PAGES = 2;
const GOOGLE_MAX_RESULTS = 20;

// 거리는 캐시 행과 신규 조회 모두 이 함수로 계산한다. 카카오 응답에도 distance가 있지만
// 캐시 경로와 Google 경로에는 없어서, 세 경로의 값이 어긋나지 않도록 한 가지 계산만 쓴다.
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

/** 국내 좌표에서 쓰는 카카오 카테고리 검색. 평점·리뷰·가격대는 응답에 없어 빈 값으로 채운다. */
export function createKakaoFetcher(kakaoRestApiKey: string) {
  return async (lat: number, lng: number, radius: number): Promise<NearbyRestaurant[]> => {
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
          provider: MAP_PROVIDER.KAKAO,
          name: place.place_name ?? '',
          ...splitCategoryName(place.category_name ?? ''),
          address: place.road_address_name || place.address_name || null,
          lat: placeLat,
          lng: placeLng,
          placeUrl: place.place_url ?? '',
          googleRating: null,
          googleRatingsTotal: 0,
          priceLevel: null,
          distanceMeters: distanceMeters(lat, lng, placeLat, placeLng),
        });
      }
      // 더 받을 것이 없으면 두 번째 호출을 아낀다.
      if (json.meta?.is_end !== false || documents.length < KAKAO_PAGE_SIZE) break;
    }
    return restaurants;
  };
}

/**
 * 해외 좌표에서 쓰는 Google Places 주변 검색.
 * rating을 요청하는 시점에 이미 Enterprise 등급 SKU가 적용되므로 priceLevel·formattedAddress를
 * 함께 받아도 등급이 더 오르지 않는다. 사진은 호출당 과금되는 별도 SKU라 요청하지 않는다.
 */
export function createGoogleFetcher(googlePlacesApiKey: string) {
  return async (lat: number, lng: number, radius: number): Promise<NearbyRestaurant[]> => {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googlePlacesApiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel',
      },
      body: JSON.stringify({
        // languageCode가 없으면 displayName과 primaryTypeDisplayName이 영문으로 온다.
        // regionCode는 지정하지 않는다 — 해외 전용 경로라 현지 주소 표기를 그대로 받는다.
        languageCode: 'ko',
        maxResultCount: GOOGLE_MAX_RESULTS,
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
        includedTypes: ['restaurant'],
      }),
    });
    if (!response.ok) throw new Error(`Google Places API 오류: ${response.status}`);
    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new Error('Google Places API 응답을 파싱할 수 없습니다.');
    }
    return (json.places ?? []).map((place: any) => {
      const placeLat = place.location?.latitude;
      const placeLng = place.location?.longitude;
      return {
        placeId: place.id,
        provider: MAP_PROVIDER.GOOGLE,
        name: place.displayName?.text ?? '',
        ...mapGoogleCategory(place.primaryType ?? null, place.primaryTypeDisplayName?.text ?? null),
        address: place.formattedAddress ?? null,
        lat: placeLat,
        lng: placeLng,
        // placeId만 쓰는 상세 URL이라 추가 API 호출·비용이 없다.
        placeUrl: googlePlaceUrl(place.displayName?.text ?? '', place.id),
        googleRating: place.rating ?? null,
        googleRatingsTotal: place.userRatingCount ?? 0,
        priceLevel: place.priceLevel ?? null,
        distanceMeters: distanceMeters(lat, lng, placeLat, placeLng),
      };
    });
  };
}

/**
 * Google 지도의 해당 가게 상세 페이지 URL. 메뉴·사진·리뷰·영업시간을 여기서 볼 수 있다.
 * 카카오는 place_url을 응답으로 주지만 Google은 주지 않으므로 placeId로 조립한다.
 * @see https://developers.google.com/maps/documentation/urls/get-started#search-action
 */
export function googlePlaceUrl(name: string, placeId: string): string {
  const params = new URLSearchParams({ api: '1', query: name, query_place_id: placeId });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/** 좌표가 국내인지에 따라 카카오/Google 어댑터를 고른다. */
export function createPlacesFetcher(
  fetchKakao: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>,
  fetchGoogle: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>,
): NearbyDeps['fetchPlaces'] {
  return (lat, lng, radius, provider) =>
    provider === MAP_PROVIDER.KAKAO ? fetchKakao(lat, lng, radius) : fetchGoogle(lat, lng, radius);
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
  const googlePlacesApiKey = requireEnv('GOOGLE_PLACES_API_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const usageStore = createUsageStore(supabase);

  const deps: NearbyDeps = {
    authenticate: async (jwt) => {
      const { data, error } = await supabase.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    checkLimit: async (userId, ip) => (await checkRateLimit(usageStore, userId, ip)).allowed,
    findCached: async (lat, lng, radius, provider) => {
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data, error } = await supabase
        .from('restaurants')
        .select(
          'place_id,provider,name,category,category_label,address,lat,lng,place_url,google_rating,google_ratings_total,price_level,fetched_at',
        )
        // provider로 걸러야 해외에서 국내 캐시 행이 섞여 나오지 않는다.
        .eq('provider', provider)
        .gte('fetched_at', cutoff);
      if (error) throw error;
      return (data ?? [])
        .map((row) => ({
          placeId: row.place_id,
          provider: row.provider as MapProvider,
          name: row.name,
          category: row.category,
          // 라벨을 모르는 구버전 캐시 행은 저장 키를 그대로 보여준다(15분 뒤 새 값으로 대체된다).
          categoryLabel: row.category_label ?? row.category,
          address: row.address ?? null,
          lat: row.lat,
          lng: row.lng,
          placeUrl: row.place_url ?? '',
          googleRating: row.google_rating,
          googleRatingsTotal: row.google_ratings_total ?? 0,
          priceLevel: row.price_level ?? null,
          distanceMeters: distanceMeters(lat, lng, row.lat, row.lng),
        }))
        .filter((row) => row.distanceMeters <= radius);
    },
    fetchPlaces: createPlacesFetcher(
      createKakaoFetcher(kakaoRestApiKey),
      createGoogleFetcher(googlePlacesApiKey),
    ),
    upsert: async (rows) => {
      if (!rows.length) return;
      const { error } = await supabase.from('restaurants').upsert(
        rows.map((row) => ({
          place_id: row.placeId,
          provider: row.provider,
          name: row.name,
          category: row.category,
          category_label: row.categoryLabel,
          address: row.address,
          lat: row.lat,
          lng: row.lng,
          place_url: row.placeUrl,
          google_rating: row.googleRating,
          google_ratings_total: row.googleRatingsTotal,
          price_level: row.priceLevel,
          fetched_at: new Date().toISOString(),
        })),
      );
      if (error) throw error;
    },
  };

  Deno.serve(withCors(createNearbyHandler(deps)));
}
