import { describe, expect, it } from 'vitest';
import { mergeCandidates } from './mergeCandidates';

describe('후보 병합', () => {
  it('개인 평점을 포함합니다', () => {
    const restaurants = [
      {
        placeId: 'p1',
        name: '식당',
        category: '한식',
        categoryLabel: '한식 라벨',
        address: null,
        priceLevel: null,
        photoName: null,
        lat: 37,
        lng: 127,
        googleRating: 4,
        googleRatingsTotal: 10,
        distanceMeters: 50,
      },
    ];
    const ratings = [
      { user_id: 'me', place_id: 'p1', score: 4, snoozed_until: null },
      { user_id: 'other', place_id: 'p1', score: 2, snoozed_until: null },
    ];
    const result = mergeCandidates(restaurants, ratings, [{ category: '한식', weight: 1.5 }], 'me');
    expect(result.candidates[0]).toMatchObject({
      personalRating: 4,
    });
    expect(result.categoryWeights).toEqual({ 한식: 1.5 });
  });
});
