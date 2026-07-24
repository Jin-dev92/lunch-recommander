import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit, type UsageStore } from '../_shared/rateLimit.ts';
import { withCors } from '../_shared/cors.ts';

// 사진 리소스 이름은 nearby가 준 photos[0].name이다(예: places/ABC/photos/XYZ).
// 이 값을 그대로 Google 미디어 URL에 이어 붙이므로, 형식을 검증해 경로 주입을 막는다.
const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export type PlacePhotoDeps = {
  authenticate: (jwt: string) => Promise<{ id: string } | null>;
  checkLimit: (userId: string, ip: string) => Promise<boolean>;
  fetchPhotoUri: (photoName: string, maxPx: number) => Promise<string | null>;
};

export function createPlacePhotoHandler(deps: PlacePhotoDeps) {
  return async (request: Request): Promise<Response> => {
    const jwt = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const user = jwt ? await deps.authenticate(jwt) : null;
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    // 사진 조회도 과금 대상(GetPhotoMedia SKU)이라 요금폭탄 방지를 위해 레이트리밋을 건다.
    if (!(await deps.checkLimit(user.id, ip)))
      return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });

    let body: { photoName?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' }, { status: 400 });
    }
    const photoName = typeof body.photoName === 'string' ? body.photoName : '';
    if (!PHOTO_NAME_PATTERN.test(photoName))
      return Response.json({ error: '사진 정보가 올바르지 않습니다.' }, { status: 400 });

    let photoUri: string | null;
    try {
      photoUri = await deps.fetchPhotoUri(photoName, 400);
    } catch {
      return Response.json({ error: '사진을 불러오지 못했습니다.' }, { status: 502 });
    }
    if (!photoUri) return Response.json({ error: '사진이 없습니다.' }, { status: 404 });
    return Response.json({ photoUri });
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

// skipHttpRedirect=true면 이미지 바이트 대신 { photoUri }가 온다. photoUri는 키 없이 열리는
// 임시 URL이라 <img src>에 그대로 쓸 수 있고, 서버 키는 이 함수 밖으로 나가지 않는다.
export function createPhotoFetcher(googlePlacesApiKey: string): PlacePhotoDeps['fetchPhotoUri'] {
  return async (photoName, maxPx) => {
    const url =
      `https://places.googleapis.com/v1/${photoName}/media` +
      `?maxHeightPx=${maxPx}&maxWidthPx=${maxPx}&skipHttpRedirect=true`;
    const response = await fetch(url, { headers: { 'X-Goog-Api-Key': googlePlacesApiKey } });
    if (!response.ok) throw new Error(`Google 사진 조회 오류: ${response.status}`);
    const json = (await response.json()) as { photoUri?: string };
    return json.photoUri ?? null;
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

  const deps: PlacePhotoDeps = {
    authenticate: async (jwt) => {
      const { data, error } = await supabase.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    checkLimit: async (userId, ip) => (await checkRateLimit(usageStore, userId, ip)).allowed,
    fetchPhotoUri: createPhotoFetcher(googlePlacesApiKey),
  };

  Deno.serve(withCors(createPlacePhotoHandler(deps)));
}
