import type { Candidate } from './recommend';
import type { CategoryPrefRow, NearbyRestaurant, RatingRow } from './types/api';

export function mergeCandidates(
  restaurants: NearbyRestaurant[],
  ratings: RatingRow[],
  prefs: CategoryPrefRow[],
  currentUserId: string,
): {
  candidates: (Candidate & { name: string; categoryLabel: string })[];
  categoryWeights: Record<string, number>;
} {
  const candidates = restaurants.map((restaurant) => {
    const rows = ratings.filter((rating) => rating.place_id === restaurant.placeId);
    const mine = rows.find((rating) => rating.user_id === currentUserId);
    const group = rows.filter((rating) => rating.user_id !== currentUserId && rating.score > 0);
    return {
      ...restaurant,
      personalRating: mine?.score ?? null,
      snoozedUntil: mine?.snoozed_until ?? null,
      groupAverage: group.length
        ? group.reduce((sum, rating) => sum + rating.score, 0) / group.length
        : null,
    };
  });
  return {
    candidates,
    categoryWeights: Object.fromEntries(prefs.map((pref) => [pref.category, Number(pref.weight)])),
  };
}
