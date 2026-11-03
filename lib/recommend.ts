import { ALL_CATEGORIES } from './constants';

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

/**
 * 추천 대상이 될 수 없는 후보를 걸러낸다(영구 제외·스누즈 중).
 * 음식 종류 좁히기는 여기서 하지 않는다 — 그건 사용자가 바꿀 때마다 달라지는 조건이고,
 * 이 결과는 위치가 바뀔 때만 다시 만들면 되기 때문이다. 둘을 섞으면 종류를 바꿀 때마다
 * 후보를 다시 받아와야 한다(외부 API 호출과 레이트리밋을 그만큼 더 쓴다).
 * 제네릭이라 name 등 확장 필드를 붙인 후보를 넣어도 타입이 그대로 보존된다.
 */
export function filterCandidates<T extends Candidate>(candidates: T[], now: Date): T[] {
  return candidates.filter(
    (c) => c.personalRating !== 0 && (!c.snoozedUntil || new Date(c.snoozedUntil) <= now),
  );
}

/** 음식 종류로 좁힌다. ALL_CATEGORIES면 좁히지 않는다. */
export function byCategory<T extends Candidate>(candidates: T[], category: string): T[] {
  return category === ALL_CATEGORIES
    ? candidates
    : candidates.filter((c) => c.category === category);
}

/**
 * 후보에 실제로 존재하는 음식 종류와 개수. 많은 순으로 정렬하고, 같으면 이름순으로 둬
 * 추천을 다시 돌려도 선택지 순서가 흔들리지 않게 한다.
 */
export function categoryCounts(candidates: Candidate[]): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates)
    counts.set(candidate.category, (counts.get(candidate.category) ?? 0) + 1);
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
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
