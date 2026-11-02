import { FOOD_CATEGORY } from './constants';
import type { RecommendationCriteria } from './types/api';

export type Candidate = {
  placeId: string;
  category: string;
  distanceMeters: number;
  // 해외(Google) 결과에만 값이 있다. 카카오 로컬 API에는 평점이 없어 국내는 null·0이다.
  googleRating: number | null;
  googleRatingsTotal: number;
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
      // ALL은 음식 종류를 좁히지 않는다. 카카오 2단계 카테고리는 열린 집합이라
      // 상수 목록에 없는 값도 들어오며, 기본값 ALL에서는 그런 후보도 남는다.
      (criteria.category === FOOD_CATEGORY.ALL || c.category === criteria.category),
  );
}

/**
 * 네 항 모두 1이 중립이다. google 항은 해외(Google) 결과에만 값이 들어가고, 평점이 없는
 * 국내(카카오) 결과는 1로 떨어져 **세 항 공식과 수학적으로 동일한 점수**가 나온다.
 * 후보 풀은 한 좌표 기준으로 만들어지므로 평점 있는 후보와 없는 후보가 한 추첨에 섞이지 않는다.
 */
export function scoreCandidate(candidate: Candidate, prefs: RecommendationPrefs): number {
  const category = prefs.categoryWeights[candidate.category] ?? 1;
  const personal = candidate.personalRating == null ? 1 : candidate.personalRating / 3;
  // 주의: 이 항은 **감점 전용**이다. (rating/5 - 1)이 0 이하라서 결과가 1을 넘지 않는다.
  // 평점 5.0이 중립(1)이고 그 아래가 깎인다. reviewConfidence는 리뷰가 적을수록 0에 가까워져
  // 표본이 빈약한 가게의 낮은 평점을 덜 신뢰하게 만든다(감점 폭이 줄어든다).
  const reviewConfidence = candidate.googleRatingsTotal / (candidate.googleRatingsTotal + 20);
  const google =
    candidate.googleRating == null ? 1 : 1 + (candidate.googleRating / 5 - 1) * reviewConfidence;
  const distance = 1 + 0.2 * Math.max(0, 1 - candidate.distanceMeters / prefs.maxDistanceMeters);
  return (
    category ** EXPONENTS.category *
    personal ** EXPONENTS.personal *
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
