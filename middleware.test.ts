import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

describe('미들웨어', () => {
  it('sb-session 쿠키가 없으면 /login 으로 리다이렉트합니다', () => {
    const req = new NextRequest(new URL('http://localhost/'));
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('보호된 경로도 쿠키가 없으면 리다이렉트합니다', () => {
    const req = new NextRequest(new URL('http://localhost/groups/1'));
    const res = middleware(req);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('sb-session 쿠키가 있으면 통과시킵니다', () => {
    const req = new NextRequest(new URL('http://localhost/groups/1'), { headers: { cookie: 'sb-session=1' } });
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });
});
