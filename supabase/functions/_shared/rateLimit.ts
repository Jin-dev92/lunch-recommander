export type UsageKey = { userId: string; ip: string; windowStart: string };
export type UsageStore = { increment(key: UsageKey): Promise<number> };

const LIMIT_PER_MINUTE = 10;

export async function checkRateLimit(
  store: UsageStore,
  userId: string,
  ip: string,
  now = new Date(),
): Promise<{ allowed: boolean; count: number; limit: number }> {
  // 요금폭탄 주의: 스팸 요청이 구글 API 과금으로 직결
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  const count = await store.increment({ userId, ip, windowStart });
  return { allowed: count <= LIMIT_PER_MINUTE, count, limit: LIMIT_PER_MINUTE };
}
