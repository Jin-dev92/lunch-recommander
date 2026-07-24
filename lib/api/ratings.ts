import { COLUMNS, NEUTRAL_RATING_SCORE, ON_CONFLICT, TABLE } from '../constants';
import { snoozedUntilOneWeekFrom } from '../snooze';
import { supabase } from '../supabaseClient';
import type { SaveRatingRequest, SnoozeRatingRequest } from '../types/api';
import { assertNoError, unwrap } from './unwrap';

export async function saveRating({ userId, placeId, score }: SaveRatingRequest): Promise<void> {
  assertNoError(
    await supabase
      .from(TABLE.RATINGS)
      .upsert({ user_id: userId, place_id: placeId, score }, { onConflict: ON_CONFLICT.RATINGS }),
  );
}

/** 기존 점수를 보존한 채 스누즈만 갱신한다. 평점 행이 없으면 중립 점수로 만든다. */
export async function snoozeRating({ userId, placeId }: SnoozeRatingRequest): Promise<void> {
  const existing = unwrap<{ score: number }>(
    await supabase
      .from(TABLE.RATINGS)
      .select(COLUMNS.RATING_SCORE)
      .eq('user_id', userId)
      .eq('place_id', placeId)
      .maybeSingle(),
  );
  assertNoError(
    await supabase.from(TABLE.RATINGS).upsert(
      {
        user_id: userId,
        place_id: placeId,
        score: existing?.score ?? NEUTRAL_RATING_SCORE,
        snoozed_until: snoozedUntilOneWeekFrom(new Date()),
      },
      { onConflict: ON_CONFLICT.RATINGS },
    ),
  );
}
