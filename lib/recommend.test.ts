import { describe, expect, it } from 'vitest';
import { FOOD_CATEGORY } from './constants';
import { filterCandidates, pickWeightedRandom, scoreCandidate, type Candidate } from './recommend';

const base: Candidate = {
  placeId: 'a',
  category: FOOD_CATEGORY.KOREAN,
  distanceMeters: 100,
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
