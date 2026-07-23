import { assertEquals } from 'jsr:@std/assert';
import { sendAdminNotification } from './email.ts';

Deno.test('Resend에 관리자 승인 링크를 담아 발송합니다', async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(input), init };
    return Response.json({ id: 'email-1' }, { status: 200 });
  }) as typeof fetch;

  await sendAdminNotification(
    { fetch: fakeFetch, apiKey: 'resend-secret', from: '가입 알림 <signup@example.com>' },
    {
      to: 'admin@example.com',
      approveUrl: 'https://lunch.example.com/admin/approve?token=abc',
      requesterEmail: 'guest@example.com',
    },
  );

  assertEquals(captured?.url, 'https://api.resend.com/emails');
  assertEquals(captured?.init?.method, 'POST');
  assertEquals(new Headers(captured?.init?.headers).get('authorization'), 'Bearer resend-secret');
  assertEquals(JSON.parse(String(captured?.init?.body)), {
    from: '가입 알림 <signup@example.com>',
    to: ['admin@example.com'],
    subject: '회원가입 승인 요청',
    html:
      '<p>guest@example.com 님이 회원가입을 요청했습니다.</p>' +
      '<p><a href="https://lunch.example.com/admin/approve?token=abc">요청 검토하기</a></p>',
  });
});

Deno.test('Resend 오류 응답을 성공으로 처리하지 않습니다', async () => {
  const fakeFetch = (async () =>
    Response.json({ message: 'invalid api key' }, { status: 401 })) as typeof fetch;
  let message = '';
  try {
    await sendAdminNotification(
      { fetch: fakeFetch, apiKey: 'bad-key', from: 'signup@example.com' },
      {
        to: 'admin@example.com',
        approveUrl: 'https://lunch.example.com/admin/approve?token=abc',
        requesterEmail: 'guest@example.com',
      },
    );
  } catch (error) {
    message = (error as Error).message;
  }
  assertEquals(message, 'Resend 이메일 발송에 실패했습니다: 401');
});
