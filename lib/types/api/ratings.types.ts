// @see public.ratings 테이블 (supabase/migrations — user_id + place_id 유니크)

export type RatingRow = {
  user_id: string;
  place_id: string;
  score: number;
  snoozed_until: string | null;
};

export type SaveRatingRequest = {
  userId: string;
  placeId: string;
  score: number;
};

export type SnoozeRatingRequest = {
  userId: string;
  placeId: string;
};
