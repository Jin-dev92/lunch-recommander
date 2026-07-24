'use client';
import { useSaveRating, useSnoozeRating } from '../lib/hooks/mutations';
import { MESSAGES } from '../lib/messages';

export default function RatingControls({ placeId, userId }: { placeId: string; userId: string }) {
  const saveRating = useSaveRating();
  const snoozeRating = useSnoozeRating();

  // 실패 여부는 mutation이 이미 들고 있으므로 별도 state를 두지 않는다(재시도 시 자동으로 초기화된다).
  const error = saveRating.isError
    ? MESSAGES.RATING_SAVE_FAILED
    : snoozeRating.isError
      ? MESSAGES.SNOOZE_FAILED
      : '';
  const isPending = saveRating.isPending || snoozeRating.isPending;

  return (
    <section aria-label="개인 평점">
      {[0, 1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          disabled={isPending}
          onClick={() => saveRating.mutate({ userId, placeId, score })}
        >
          {score}점
        </button>
      ))}
      <button disabled={isPending} onClick={() => snoozeRating.mutate({ userId, placeId })}>
        1주간 그만 보기
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
