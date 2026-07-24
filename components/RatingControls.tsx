'use client';
import { useRef, useState } from 'react';
import { EXCLUDE_RATING_SCORE, MAX_STAR_SCORE, MIN_STAR_SCORE } from '../lib/constants';
import { useSaveRating, useSnoozeRating } from '../lib/hooks/mutations';
import { MESSAGES } from '../lib/messages';
import styles from './RatingControls.module.css';
import Spinner from './Spinner';

const STAR_SCORES = Array.from(
  { length: MAX_STAR_SCORE - MIN_STAR_SCORE + 1 },
  (_, index) => MIN_STAR_SCORE + index,
);

/**
 * 0점은 별 0개가 아니라 "추천 후보에서 영구 제외"다(lib/recommend.ts의 filterCandidates).
 * 별에 섞어 두면 "맛없음" 표시로 오해해 누르게 되므로, 별점은 1~5로만 두고 제외는 따로 뗀다.
 * 선택 상태를 들고 있으므로 음식점이 바뀔 때는 상위에서 key로 remount한다.
 */
export default function RatingControls({
  placeId,
  userId,
  currentScore,
  onExclude,
}: {
  placeId: string;
  userId: string;
  currentScore?: number | null;
  /** 영구 제외가 저장된 뒤 호출된다. 상위에서 다음 추천을 띄우는 데 쓴다. */
  onExclude?: () => void;
}) {
  const [score, setScore] = useState<number | null>(currentScore ?? null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const saveRating = useSaveRating();
  const snoozeRating = useSnoozeRating();

  // 실패 여부는 mutation이 이미 들고 있으므로 별도 state를 두지 않는다(재시도 시 자동으로 초기화된다).
  const error = saveRating.isError
    ? MESSAGES.RATING_SAVE_FAILED
    : snoozeRating.isError
      ? MESSAGES.SNOOZE_FAILED
      : '';
  const isPending = saveRating.isPending || snoozeRating.isPending;

  function rate(next: number) {
    setScore(next);
    saveRating.mutate({ userId, placeId, score: next });
  }

  // 영구 제외는 되돌릴 수 없으므로 확인을 받는다. 확인되면 저장 후 상위가 다음 추천을 띄운다.
  function confirmExclude() {
    setScore(EXCLUDE_RATING_SCORE);
    saveRating.mutate(
      { userId, placeId, score: EXCLUDE_RATING_SCORE },
      {
        onSuccess: () => {
          confirmDialog.current?.close();
          onExclude?.();
        },
      },
    );
  }

  return (
    <section className={styles.section} aria-label="개인 평점" aria-busy={isPending}>
      {isPending && (
        <p className={styles.pendingStatus} role="status">
          <Spinner />
          저장 중…
        </p>
      )}
      <div className={styles.scoreGrid} role="group" aria-label="별점">
        {STAR_SCORES.map((value) => {
          const filled = score !== null && value <= score;
          return (
            <button
              className={filled ? `${styles.scoreButton} ${styles.filled}` : styles.scoreButton}
              key={value}
              type="button"
              disabled={isPending}
              aria-label={`${value}점`}
              aria-pressed={score === value}
              onClick={() => rate(value)}
            >
              <span aria-hidden="true">{filled ? '★' : '☆'}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button
          className={styles.snoozeButton}
          type="button"
          disabled={isPending}
          onClick={() => snoozeRating.mutate({ userId, placeId })}
        >
          1주간 그만 보기
        </button>
        <button
          className={styles.excludeButton}
          type="button"
          disabled={isPending}
          onClick={() => confirmDialog.current?.showModal()}
        >
          다시 추천 안 함
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <dialog
        className={styles.confirmDialog}
        ref={confirmDialog}
        aria-labelledby="exclude-confirm"
      >
        <p className={styles.confirmMessage} id="exclude-confirm">
          {MESSAGES.EXCLUDE_CONFIRM}
        </p>
        <div className={styles.confirmActions}>
          <button
            className={styles.snoozeButton}
            type="button"
            disabled={isPending}
            onClick={() => confirmDialog.current?.close()}
          >
            취소
          </button>
          <button
            className={styles.excludeButton}
            type="button"
            disabled={isPending}
            onClick={confirmExclude}
          >
            제외하기
          </button>
        </div>
      </dialog>
    </section>
  );
}
