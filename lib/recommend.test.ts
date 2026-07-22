import { describe, expect, it } from 'vitest';
import { filterCandidates, pickWeightedRandom, scoreCandidate, type Candidate } from './recommend';

const base: Candidate = { placeId:'a', category:'한식', distanceMeters:100, googleRating:4, googleRatingsTotal:100, personalRating:null, groupAverage:null, snoozedUntil:null };

describe('추천', () => {
  it('0점과 미래 스누즈를 제외하고 지난 스누즈를 포함합니다', () => {
    const now = new Date('2026-07-21T03:00:00Z');
    const candidates = [
      { ...base, placeId:'zero', personalRating:0 },
      { ...base, placeId:'future', snoozedUntil:'2026-07-22T03:00:00Z' },
      { ...base, placeId:'past', snoozedUntil:'2026-07-20T03:00:00Z' },
    ];
    expect(filterCandidates(candidates, now).map((x) => x.placeId)).toEqual(['past']);
  });
  it('결측 평점을 중립값으로 계산합니다', () => {
    expect(scoreCandidate(base, { categoryWeights:{}, maxDistanceMeters:1000 })).toBeGreaterThan(0);
  });
  it('결정적 rng에서 높은 가중치가 더 자주 선택됩니다', () => {
    let state = 1;
    const rng = () => ((state = state * 16807 % 2147483647) - 1) / 2147483646;
    const counts: Record<string, number> = { low:0, high:0 };
    for (let i=0; i<1000; i++) counts[pickWeightedRandom([{id:'low',weight:1},{id:'high',weight:9}], rng)!.id]++;
    expect(counts.high).toBeGreaterThan(800);
  });
});
