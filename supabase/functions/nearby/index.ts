import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit, type UsageStore } from '../_shared/rateLimit.ts';
import { withCors } from '../_shared/cors.ts';

export type NearbyRestaurant = {
  placeId: string;
  name: string;
  // category는 Google의 primaryType(korean_restaurant 등) 기계값이다. 선호 가중치의 저장 키이자
  // 점수 계산 기준이므로 표기가 바뀌지 않는 값을 쓴다. 화면에는 categoryLabel을 보여준다.
  category: string;
  categoryLabel: string;
  lat: number;
  lng: number;
  googleRating: number | null;
  googleRatingsTotal: number;
  // Google priceLevel 열거형. 실제 가격이 아니라 4단계 등급이며, 없는 가게가 많아 null 허용.
  priceLevel: string | null;
  // 사진 리소스 이름. 실제 이미지는 추천된 1곳에 한해 place-photo 함수가 해석한다.
  photoName: string | null;
  distanceMeters: number;
};
export type NearbyDeps = {
  authenticate: (jwt: string) => Promise<{ id: string } | null>;
  checkLimit: (userId: string, ip: string) => Promise<boolean>;
  findCached: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>;
  fetchGoogle: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>;
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
      ![500, 1000].includes(body.radius)
    )
      return Response.json({ error: '위치 또는 반경이 올바르지 않습니다.' }, { status: 400 });
    const cached = await deps.findCached(body.lat, body.lng, body.radius);
    if (cached.length) return Response.json({ restaurants: cached, source: 'cache' });
    let restaurants: NearbyRestaurant[];
    try {
      restaurants = await deps.fetchGoogle(body.lat, body.lng, body.radius);
    } catch {
      return Response.json({ error: '외부 위치 정보 조회에 실패했습니다.' }, { status: 502 });
    }
    await deps.upsert(restaurants);
    return Response.json({ restaurants, source: 'google' });
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase/Google 연동입니다. 테스트에서는 사용하지 않습니다. ---

const CACHE_TTL_MS = 15 * 60 * 1000;

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

export function createGoogleFetcher(googlePlacesApiKey: string): NearbyDeps['fetchGoogle'] {
  return async (lat, lng, radius) => {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googlePlacesApiKey,
        // rating이 이미 Enterprise 등급을 부르므로 priceLevel·photos는 등급을 더 올리지 않는다.
        // 사진은 여기서 이름만 받고(무료), 실제 이미지 해석은 추천된 1곳만 place-photo가 한다.
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.photos',
      },
      body: JSON.stringify({
        // languageCode가 없으면 displayName과 primaryTypeDisplayName이 영문으로 온다.
        languageCode: 'ko',
        regionCode: 'KR',
        maxResultCount: 20,
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
    const places = json.places ?? [];
    return places.map((place: any) => ({
      placeId: place.id,
      name: place.displayName?.text ?? '',
      category: place.primaryType ?? 'restaurant',
      categoryLabel: place.primaryTypeDisplayName?.text ?? '기타',
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      googleRating: place.rating ?? null,
      googleRatingsTotal: place.userRatingCount ?? 0,
      priceLevel: place.priceLevel ?? null,
      photoName: place.photos?.[0]?.name ?? null,
      distanceMeters: distanceMeters(lat, lng, place.location?.latitude, place.location?.longitude),
    }));
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
    findCached: async (lat, lng, radius) => {
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data, error } = await supabase
        .from('restaurants')
        .select(
          'place_id,name,category,category_label,lat,lng,google_rating,google_ratings_total,price_level,photo_name,fetched_at',
        )
        .gte('fetched_at', cutoff);
      if (error) throw error;
      return (data ?? [])
        .map((row) => ({
          placeId: row.place_id,
          name: row.name,
          category: row.category,
          // 라벨을 모르는 구버전 캐시 행은 기계값을 그대로 보여준다(15분 뒤 새 값으로 대체된다).
          categoryLabel: row.category_label ?? row.category,
          lat: row.lat,
          lng: row.lng,
          googleRating: row.google_rating,
          googleRatingsTotal: row.google_ratings_total,
          priceLevel: row.price_level ?? null,
          photoName: row.photo_name ?? null,
          distanceMeters: distanceMeters(lat, lng, row.lat, row.lng),
        }))
        .filter((row) => row.distanceMeters <= radius);
    },
    fetchGoogle: createGoogleFetcher(googlePlacesApiKey),
    upsert: async (rows) => {
      if (!rows.length) return;
      const { error } = await supabase.from('restaurants').upsert(
        rows.map((row) => ({
          place_id: row.placeId,
          name: row.name,
          category: row.category,
          category_label: row.categoryLabel,
          lat: row.lat,
          lng: row.lng,
          google_rating: row.googleRating,
          google_ratings_total: row.googleRatingsTotal,
          price_level: row.priceLevel,
          photo_name: row.photoName,
          fetched_at: new Date().toISOString(),
        })),
      );
      if (error) throw error;
    },
  };

  Deno.serve(withCors(createNearbyHandler(deps)));
}
