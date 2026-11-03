import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES } from './constants';
import {
  byCategory,
  categoryCounts,
  filterCandidates,
  pickWeightedRandom,
  scoreCandidate,
  type Candidate,
} from './recommend';

const base: Candidate = {
  placeId: 'a',
  category: '한식',
  distanceMeters: 100,
  personalRating: null,
  snoozedUntil: null,
};

describe('추천', () => {
  it('0점과 미래 스누즈를 제외하고 지난 스누즈를 포함합니다', () => {
    const now = new Date('2026-07-21T03:00:00Z');
    const candidates = [
      { ...base, placeId: 'zero', personalRating: 0 },
      { ...base, placeId: 'future', snoozedUntil: '2026-07-22T03:00:00Z' },
      { ...base, placeId: 'past', snoozedUntil: '2026-07-20T03:00:00Z' },
    ];
    expect(filterCandidates(candidates, now).map((x) => x.placeId)).toEqual(['past']);
  });
  it('filterCandidates는 음식 종류를 보지 않습니다', () => {
    // 종류 좁히기는 추첨 시점으로 분리했다. 섞으면 종류를 바꿀 때마다 후보를 다시 받아야 한다.
    const candidates = [
      { ...base, placeId: 'korean', category: '한식' },
      { ...base, placeId: 'bakery', category: '제과,베이커리' },
    ];
    expect(filterCandidates(candidates, new Date()).map((x) => x.placeId)).toEqual([
      'korean',
      'bakery',
    ]);
  });
  it('byCategory는 고른 종류만 남기고 전체면 그대로 둡니다', () => {
    const candidates = [
      { ...base, placeId: 'korean', category: '한식' },
      { ...base, placeId: 'chinese', category: '중식' },
      // 카카오 2단계 카테고리는 열린 집합이라 어떤 값이든 들어올 수 있다.
      { ...base, placeId: 'bakery', category: '제과,베이커리' },
    ];
    expect(byCategory(candidates, '한식').map((x) => x.placeId)).toEqual(['korean']);
    expect(byCategory(candidates, '제과,베이커리').map((x) => x.placeId)).toEqual(['bakery']);
    expect(byCategory(candidates, ALL_CATEGORIES).map((x) => x.placeId)).toEqual([
      'korean',
      'chinese',
      'bakery',
    ]);
  });
  it('categoryCounts는 실제 존재하는 종류만 많은 순으로 셉니다', () => {
    const candidates = [
      { ...base, placeId: '1', category: '한식' },
      { ...base, placeId: '2', category: '한식' },
      { ...base, placeId: '3', category: '제과,베이커리' },
      { ...base, placeId: '4', category: '중식' },
      { ...base, placeId: '5', category: '중식' },
    ];
    // 같은 개수면 이름순이라 추천을 다시 돌려도 선택지 순서가 흔들리지 않는다.
    expect(categoryCounts(candidates)).toEqual([
      { category: '중식', count: 2 },
      { category: '한식', count: 2 },
      { category: '제과,베이커리', count: 1 },
    ]);
  });
  it('categoryCounts는 후보가 없으면 빈 목록을 돌려줍니다', () => {
    expect(categoryCounts([])).toEqual([]);
  });
  it('별점·선호 이력이 없으면 중립값으로 계산합니다', () => {
    expect(scoreCandidate(base, { categoryWeights: {}, maxDistanceMeters: 1000 })).toBeGreaterThan(
      0,
    );
  });
  it('카테고리 선호와 개인 별점이 점수에 반영됩니다', () => {
    const prefs = { categoryWeights: { 한식: 2 }, maxDistanceMeters: 1000 };
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
