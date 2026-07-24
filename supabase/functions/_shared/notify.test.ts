import { assertEquals } from 'jsr:@std/assert';
import { sendAdminNotification } from './notify.ts';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1/secret-token';

function captureFetch(response: Response) {
  const captured: { url?: string; init?: RequestInit } = {};
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.url = String(input);
    captured.init = init;
    return response;
  }) as typeof fetch;
  return { captured, fakeFetch };
}

Deno.test('웹훅 URL로 관리자 승인 링크를 담아 발송합니다', async () => {
  const { captured, fakeFetch } = captureFetch(new Response(null, { status: 204 }));

  await sendAdminNotification(
    { fetch: fakeFetch, webhookUrl: WEBHOOK_URL },
    {
      approveUrl: 'https://lunch.example.com/admin/approve?token=abc',
      requesterEmail: 'guest@example.com',
    },
  );

  assertEquals(captured.url, WEBHOOK_URL);
  assertEquals(captured.init?.method, 'POST');
  const body = JSON.parse(String(captured.init?.body));
  assertEquals(body.content.includes('guest@example.com'), true);
  assertEquals(body.content.includes('https://lunch.example.com/admin/approve?token=abc'), true);
});

Deno.test('requesterEmail로 멘션을 주입할 수 없습니다', async () => {
  const { captured, fakeFetch } = captureFetch(new Response(null, { status: 204 }));

  await sendAdminNotification(
    { fetch: fakeFetch, webhookUrl: WEBHOOK_URL },
    {
      approveUrl: 'https://lunch.example.com/admin/approve?token=abc',
      requesterEmail: '@everyone@example.com',
    },
  );

  // 멘션 파싱이 꺼져 있으면 본문에 @everyone이 남아 있어도 실제 알림이 발생하지 않는다.
  const body = JSON.parse(String(captured.init?.body));
  assertEquals(body.allowed_mentions, { parse: [] });
});

Deno.test('웹훅 오류 응답을 성공으로 처리하지 않습니다', async () => {
  const { fakeFetch } = captureFetch(new Response('unknown webhook', { status: 404 }));
  let message = '';
  try {
    await sendAdminNotification(
      { fetch: fakeFetch, webhookUrl: WEBHOOK_URL },
      {
        approveUrl: 'https://lunch.example.com/admin/approve?token=abc',
        requesterEmail: 'guest@example.com',
      },
    );
  } catch (error) {
    message = (error as Error).message;
  }
  assertEquals(message, 'Discord 알림 발송에 실패했습니다: 404');
});
