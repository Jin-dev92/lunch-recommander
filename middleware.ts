import { NextRequest, NextResponse } from 'next/server';

// ponytail: supabase-js 브라우저 클라이언트는 세션을 localStorage에 저장해 미들웨어(서버)가
// 직접 읽을 수 없다. 로그인 성공 시 클라이언트가 심는 'sb-session' 마커 쿠키 유무로 대신 판단한다.
// 서버사이드 세션 검증(JWT 서명 확인 등)이 필요해지면 @supabase/ssr 도입을 고려한다.
export function middleware(request: NextRequest) {
  if (!request.cookies.has('sb-session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/groups/:path*'],
};
