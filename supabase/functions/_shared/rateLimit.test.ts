import { assertEquals } from 'jsr:@std/assert';
import { checkRateLimit, type UsageStore } from './rateLimit.ts';

Deno.test('한도 이하는 허용하고 초과는 차단합니다', async () => {
  let count = 0;
  const store: UsageStore = { increment: async () => ++count };
  for (let i = 0; i < 10; i++)
    assertEquals((await checkRateLimit(store, 'u1', '127.0.0.1')).allowed, true);
  assertEquals((await checkRateLimit(store, 'u1', '127.0.0.1')).allowed, false);
});

Deno.test('사용자 또는 IP가 다르면 별도 카운터로 취급합니다', async () => {
  const counts = new Map<string, number>();
  const store: UsageStore = {
    increment: async (key) => {
      const k = `${key.userId}|${key.ip}|${key.windowStart}`;
      const next = (counts.get(k) ?? 0) + 1;
      counts.set(k, next);
      return next;
    },
  };
  const now = new Date();
  for (let i = 0; i < 10; i++)
    assertEquals((await checkRateLimit(store, 'u1', '1.1.1.1', now)).allowed, true);
  // 같은 유저, 다른 IP -> 새 카운터
  assertEquals((await checkRateLimit(store, 'u1', '2.2.2.2', now)).allowed, true);
  // 다른 유저, 같은 IP -> 새 카운터
  assertEquals((await checkRateLimit(store, 'u2', '1.1.1.1', now)).allowed, true);
  // 원래 키는 여전히 초과 상태
  assertEquals((await checkRateLimit(store, 'u1', '1.1.1.1', now)).allowed, false);
});
