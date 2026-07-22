import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit, type UsageStore } from '../_shared/rateLimit.ts';

export type NearbyRestaurant={placeId:string;name:string;category:string;lat:number;lng:number;googleRating:number|null;googleRatingsTotal:number;distanceMeters:number};
export type NearbyDeps={authenticate:(jwt:string)=>Promise<{id:string}|null>;checkLimit:(userId:string,ip:string)=>Promise<boolean>;findCached:(lat:number,lng:number,radius:number)=>Promise<NearbyRestaurant[]>;fetchGoogle:(lat:number,lng:number,radius:number)=>Promise<NearbyRestaurant[]>;upsert:(rows:NearbyRestaurant[])=>Promise<void>};

export function createNearbyHandler(deps:NearbyDeps) {
  return async (request:Request):Promise<Response> => {
    const jwt=request.headers.get('authorization')?.replace(/^Bearer /,'');
    const user=jwt ? await deps.authenticate(jwt) : null;
    if (!user) return Response.json({error:'인증이 필요합니다.'},{status:401});
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    if (!await deps.checkLimit(user.id,ip)) return Response.json({error:'요청 한도를 초과했습니다.'},{status:429});
    const body=await request.json();
    if (!Number.isFinite(body.lat)||!Number.isFinite(body.lng)||![500,1000].includes(body.radius)) return Response.json({error:'위치 또는 반경이 올바르지 않습니다.'},{status:400});
    const cached=await deps.findCached(body.lat,body.lng,body.radius);
    if (cached.length) return Response.json({restaurants:cached,source:'cache'});
    const restaurants=await deps.fetchGoogle(body.lat,body.lng,body.radius);
    await deps.upsert(restaurants);
    return Response.json({restaurants,source:'google'});
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase/Google 연동입니다. 테스트에서는 사용하지 않습니다. ---

const CACHE_TTL_MS = 15 * 60 * 1000;

function distanceMeters(lat1:number,lng1:number,lat2:number,lng2:number):number {
  const R = 6371000;
  const toRad = (deg:number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

if (import.meta.main) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googlePlacesApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const usageStore: UsageStore = {
    // ponytail: select 후 upsert라 동시 요청 시 카운트 경합 가능. 원자적 증가가 필요해지면 DB 함수(rpc)로 승격.
    increment: async (key) => {
      const { data: existing, error: selectError } = await supabase
        .from('api_usage')
        .select('count')
        .eq('user_id', key.userId)
        .eq('ip', key.ip)
        .eq('window_start', key.windowStart)
        .maybeSingle();
      if (selectError) throw selectError;
      const next = (existing?.count ?? 0) + 1;
      const { error: upsertError } = await supabase
        .from('api_usage')
        .upsert({ user_id: key.userId, ip: key.ip, window_start: key.windowStart, count: next });
      if (upsertError) throw upsertError;
      return next;
    },
  };

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
        .select('place_id,name,category,lat,lng,google_rating,google_ratings_total,fetched_at')
        .gte('fetched_at', cutoff);
      if (error) throw error;
      return (data ?? [])
        .map((row) => ({
          placeId: row.place_id,
          name: row.name,
          category: row.category,
          lat: row.lat,
          lng: row.lng,
          googleRating: row.google_rating,
          googleRatingsTotal: row.google_ratings_total,
          distanceMeters: distanceMeters(lat, lng, row.lat, row.lng),
        }))
        .filter((row) => row.distanceMeters <= radius);
    },
    fetchGoogle: async (lat, lng, radius) => {
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googlePlacesApiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.location,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
          maxResultCount: 20,
          locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
          includedTypes: ['restaurant'],
        }),
      });
      const json = await response.json();
      const places = json.places ?? [];
      return places.map((place: any) => ({
        placeId: place.id,
        name: place.displayName?.text ?? '',
        category: place.primaryType ?? '기타',
        lat: place.location?.latitude,
        lng: place.location?.longitude,
        googleRating: place.rating ?? null,
        googleRatingsTotal: place.userRatingCount ?? 0,
        distanceMeters: distanceMeters(lat, lng, place.location?.latitude, place.location?.longitude),
      }));
    },
    upsert: async (rows) => {
      if (!rows.length) return;
      const { error } = await supabase.from('restaurants').upsert(
        rows.map((row) => ({
          place_id: row.placeId,
          name: row.name,
          category: row.category,
          lat: row.lat,
          lng: row.lng,
          google_rating: row.googleRating,
          google_ratings_total: row.googleRatingsTotal,
          fetched_at: new Date().toISOString(),
        })),
      );
      if (error) throw error;
    },
  };

  Deno.serve(createNearbyHandler(deps));
}
