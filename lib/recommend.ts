import { FOOD_CATEGORY } from './constants';
import type { RecommendationCriteria } from './types/api';

export type Candidate = {
  placeId: string;
  category: string;
  distanceMeters: number;
  personalRating: number | null;
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
      // ALL은 음식 종류를 좁히지 않는다. 카카오 2단계 카테고리는 열린 집합이라
      // 상수 목록에 없는 값도 들어오며, 기본값 ALL에서는 그런 후보도 남는다.
      (criteria.category === FOOD_CATEGORY.ALL || c.category === criteria.category),
  );
}

/**
 * 카카오 로컬 API에는 평점·리뷰 수가 없어 외부 평점 항이 없다. 사용자 자신의 취향 이력
 * (카테고리 선호·개인 별점)과 거리만으로 점수를 낸다. 세 항 모두 1이 중립이다.
 */
export function scoreCandidate(candidate: Candidate, prefs: RecommendationPrefs): number {
  const category = prefs.categoryWeights[candidate.category] ?? 1;
  const personal = candidate.personalRating == null ? 1 : candidate.personalRating / 3;
  const distance = 1 + 0.2 * Math.max(0, 1 - candidate.distanceMeters / prefs.maxDistanceMeters);
  return (
    category ** EXPONENTS.category * personal ** EXPONENTS.personal * distance ** EXPONENTS.distance
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
