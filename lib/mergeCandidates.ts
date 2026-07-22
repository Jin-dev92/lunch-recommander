import type { Candidate } from './recommend';

type NearbyRestaurant = { placeId:string; name:string; category:string; lat:number; lng:number; googleRating:number|null; googleRatingsTotal:number; distanceMeters:number };
type RatingRow = { user_id:string; place_id:string; score:number; snoozed_until:string|null };
type CategoryPrefRow = { category:string; weight:number };

export function mergeCandidates(restaurants:NearbyRestaurant[], ratings:RatingRow[], prefs:CategoryPrefRow[], currentUserId:string): { candidates:(Candidate & { name:string })[]; categoryWeights:Record<string,number> } {
  const candidates = restaurants.map((restaurant) => {
    const rows = ratings.filter((rating) => rating.place_id === restaurant.placeId);
    const mine = rows.find((rating) => rating.user_id === currentUserId);
    const group = rows.filter((rating) => rating.user_id !== currentUserId && rating.score > 0);
    return {
      ...restaurant,
      personalRating: mine?.score ?? null,
      snoozedUntil: mine?.snoozed_until ?? null,
      groupAverage: group.length ? group.reduce((sum, rating) => sum + rating.score, 0) / group.length : null,
    };
  });
  return { candidates, categoryWeights: Object.fromEntries(prefs.map((pref) => [pref.category, Number(pref.weight)])) };
}
