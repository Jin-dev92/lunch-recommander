import { describe, expect, it } from 'vitest';
import { FOOD_CATEGORY } from './constants';
import { filterCandidates, pickWeightedRandom, scoreCandidate, type Candidate } from './recommend';

// 기본 후보는 국내(카카오) 결과 모양이다 — 평점·리뷰가 없다.
const base: Candidate = {
  placeId: 'a',
  category: FOOD_CATEGORY.KOREAN,
  distanceMeters: 100,
  googleRating: null,
  googleRatingsTotal: 0,
  personalRating: null,
  snoozedUntil: null,
};
const criteria = { category: FOOD_CATEGORY.ALL };

describe('추천', () => {
  it('0점과 미래 스누즈를 제외하고 지난 스누즈를 포함합니다', () => {
    const now = new Date('2026-07-21T03:00:00Z');
    const candidates = [
      { ...base, placeId: 'zero', personalRating: 0 },
      { ...base, placeId: 'future', snoozedUntil: '2026-07-22T03:00:00Z' },
      { ...base, placeId: 'past', snoozedUntil: '2026-07-20T03:00:00Z' },
    ];
    expect(filterCandidates(candidates, now, criteria).map((x) => x.placeId)).toEqual(['past']);
  });
  it('음식 종류를 고르면 그 카테고리 후보만 포함합니다', () => {
    const candidates = [
      { ...base, placeId: 'korean', category: FOOD_CATEGORY.KOREAN },
      { ...base, placeId: 'chinese', category: FOOD_CATEGORY.CHINESE },
      // 카카오 2단계 카테고리는 열린 집합이라 상수 목록에 없는 값도 들어온다.
      { ...base, placeId: 'unlisted', category: '퓨전요리' },
    ];
    expect(
      filterCandidates(candidates, new Date(), { category: FOOD_CATEGORY.KOREAN }).map(
        (x) => x.placeId,
      ),
    ).toEqual(['korean']);
  });
  it('전체를 고르면 상수 목록에 없는 카테고리도 남깁니다', () => {
    const candidates = [
      { ...base, placeId: 'korean', category: FOOD_CATEGORY.KOREAN },
      { ...base, placeId: 'unlisted', category: '퓨전요리' },
    ];
    expect(filterCandidates(candidates, new Date(), criteria).map((x) => x.placeId)).toEqual([
      'korean',
      'unlisted',
    ]);
  });
  it('별점·선호 이력이 없으면 중립값으로 계산합니다', () => {
    expect(scoreCandidate(base, { categoryWeights: {}, maxDistanceMeters: 1000 })).toBeGreaterThan(
      0,
    );
  });
  it('카테고리 선호와 개인 별점이 점수에 반영됩니다', () => {
    const prefs = { categoryWeights: { [FOOD_CATEGORY.KOREAN]: 2 }, maxDistanceMeters: 1000 };
    const neutral = scoreCandidate(base, { categoryWeights: {}, maxDistanceMeters: 1000 });
    expect(scoreCandidate(base, prefs)).toBeCloseTo(neutral * 2);
    expect(scoreCandidate({ ...base, personalRating: 5 }, prefs)).toBeGreaterThan(
      scoreCandidate(base, prefs),
    );
  });
  it('가까운 후보가 먼 후보보다 높은 점수를 받습니다', () => {
    const prefs = { categoryWeights: {}, maxDistanceMeters: 1000 };
    expect(scoreCandidate({ ...base, distanceMeters: 50 }, prefs)).toBeGreaterThan(
      scoreCandidate({ ...base, distanceMeters: 900 }, prefs),
    );
  });
  it('평점이 없는 국내 후보는 google 항이 중립(1)이라 세 항 공식과 같은 점수가 납니다', () => {
    const prefs = { categoryWeights: { [FOOD_CATEGORY.KOREAN]: 2 }, maxDistanceMeters: 1000 };
    const candidate = { ...base, personalRating: 4 };
    const expected = 2 * (4 / 3) * (1 + 0.2 * Math.max(0, 1 - candidate.distanceMeters / 1000));
    expect(scoreCandidate(candidate, prefs)).toBeCloseTo(expected);
  });
  it('google 항은 감점 전용이라 평점 5.0이 평점 없음과 같은 점수를 냅니다', () => {
    // (rating/5 - 1)이 0 이하라서 이 항은 1을 넘지 않는다. 5.0이 중립이고 그 아래가 깎인다.
    const prefs = { categoryWeights: {}, maxDistanceMeters: 1000 };
    const noRating = scoreCandidate(base, prefs);
    const perfect = scoreCandidate({ ...base, googleRating: 5, googleRatingsTotal: 200 }, prefs);
    expect(perfect).toBeCloseTo(noRating);
  });
  it('평점이 낮을수록 점수가 더 깎입니다', () => {
    const prefs = { categoryWeights: {}, maxDistanceMeters: 1000 };
    const neutral = scoreCandidate(base, prefs);
    const good = scoreCandidate({ ...base, googleRating: 4.5, googleRatingsTotal: 200 }, prefs);
    const bad = scoreCandidate({ ...base, googleRating: 2.0, googleRatingsTotal: 200 }, prefs);
    expect(good).toBeLessThan(neutral);
    expect(bad).toBeLessThan(good);
  });
  it('같은 낮은 평점이어도 리뷰가 적으면 감점 폭이 작습니다', () => {
    // 표본이 빈약한 가게의 낮은 평점을 덜 신뢰한다.
    const prefs = { categoryWeights: {}, maxDistanceMeters: 1000 };
    const fewReviews = scoreCandidate({ ...base, googleRating: 2, googleRatingsTotal: 2 }, prefs);
    const manyReviews = scoreCandidate(
      { ...base, googleRating: 2, googleRatingsTotal: 500 },
      prefs,
    );
    expect(fewReviews).toBeGreaterThan(manyReviews);
  });
  it('결정적 rng에서 높은 가중치가 더 자주 선택됩니다', () => {
    let state = 1;
    const rng = () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
    const counts: Record<string, number> = { low: 0, high: 0 };
    for (let i = 0; i < 1000; i++)
      counts[
        pickWeightedRandom(
          [
            { id: 'low', weight: 1 },
            { id: 'high', weight: 9 },
          ],
          rng,
        )!.id
      ]++;
    expect(counts.high).toBeGreaterThan(800);
  });
});
