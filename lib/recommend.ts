import type { RecommendationCriteria } from './types/api';

export type Candidate = {
  placeId: string;
  category: string;
  distanceMeters: number;
  googleRating: number | null;
  googleRatingsTotal: number;
  personalRating: number | null;
  groupAverage: number | null;
  snoozedUntil: string | null;
};
export type RecommendationPrefs = {
  categoryWeights: Record<string, number>;
  maxDistanceMeters: number;
};

// ponytail: 휴리스틱 가중치, 써보고 조정
const EXPONENTS = {
  category: 1,
  personal: 1,
  group: 1,
  google: 1,
  distance: 1,
} as const;

// 제네릭이라 name 등 확장 필드를 붙인 후보를 넣어도 타입이 그대로 보존된다(호출부 캐스트 불필요).
export function filterCandidates<T extends Candidate>(
  candidates: T[],
  now: Date,
  criteria: RecommendationCriteria,
): T[] {
  return candidates.filter(
    (c) =>
      c.personalRating !== 0 &&
      (!c.snoozedUntil || new Date(c.snoozedUntil) <= now) &&
      c.googleRating !== null &&
      c.googleRating >= criteria.minGoogleRating &&
      c.googleRatingsTotal >= criteria.minGoogleReviews,
  );
}

export function scoreCandidate(candidate: Candidate, prefs: RecommendationPrefs): number {
  const category = prefs.categoryWeights[candidate.category] ?? 1;
  const personal = candidate.personalRating == null ? 1 : candidate.personalRating / 3;
  const group = candidate.groupAverage == null ? 1 : candidate.groupAverage / 3;
  const reviewConfidence = candidate.googleRatingsTotal / (candidate.googleRatingsTotal + 20);
  const google =
    candidate.googleRating == null ? 1 : 1 + (candidate.googleRating / 5 - 1) * reviewConfidence;
  const distance = 1 + 0.2 * Math.max(0, 1 - candidate.distanceMeters / prefs.maxDistanceMeters);
  return (
    category ** EXPONENTS.category *
    personal ** EXPONENTS.personal *
    group ** EXPONENTS.group *
    google ** EXPONENTS.google *
    distance ** EXPONENTS.distance
  );
}

export function pickWeightedRandom<T extends { weight: number }>(
  candidates: T[],
  rng: () => number,
): T | null {
  const valid = candidates.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return null;
  let cursor = rng() * total;
  for (const item of valid) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return valid.at(-1) ?? null;
}
