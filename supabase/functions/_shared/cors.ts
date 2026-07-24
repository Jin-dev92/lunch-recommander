// 브라우저는 Content-Type: application/json 같은 "단순하지 않은" 헤더가 붙은 요청을 보내기 전에
// OPTIONS 프리플라이트를 먼저 보낸다. 여기에 CORS 헤더로 답하지 않으면 브라우저가 본 요청 자체를
// 차단한다. curl은 프리플라이트를 보내지도 CORS를 강제하지도 않아 이 문제가 드러나지 않는다.

// Allow-Origin을 *로 두어도 다른 사이트가 사용자의 세션을 도용할 수는 없다. 이 앱은 쿠키가 아니라
// Authorization 헤더로 인증하고, 토큰은 우리 origin의 localStorage에만 있어 교차 출처로 읽히지
// 않는다(자격증명 포함 요청도 허용하지 않는다). 남용 방어는 CORS가 아니라 각 함수의 rate limit과
// 승인 토큰 검증이 담당한다. 고정 도메인만 허용하면 Vercel 프리뷰 배포가 매번 막히는 문제도 있다.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * 핸들러를 감싸 프리플라이트에 응답하고 모든 응답에 CORS 헤더를 붙인다.
 * 핸들러 내부 로직은 그대로 두고 Deno.serve 진입점에서만 적용한다.
 */
export function withCors(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders });
    const response = await handler(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
