'use client';
import { useState } from 'react';
import { useRecommendationData } from '../lib/hooks/queries';
import { errorMessage, MESSAGES } from '../lib/messages';
import { mergeCandidates } from '../lib/mergeCandidates';
import {
  filterCandidates,
  pickWeightedRandom,
  scoreCandidate,
  type Candidate,
} from '../lib/recommend';
import type { SearchLocation } from '../lib/types/api';
import RatingControls from './RatingControls';
import CategoryPrefs from './CategoryPrefs';
import styles from './Recommend.module.css';

type Result = Candidate & { name: string; categoryLabel: string; weight: number };

export default function Recommend({ location }: { location: SearchLocation | null }) {
  const [result, setResult] = useState<Result | null>(null);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [categoryWeights, setCategoryWeights] = useState<Record<string, number>>({});
  const { refetch, isFetching } = useRecommendationData(location);

  // 추첨은 누를 때마다 결과가 달라져야 하므로 캐시된 data를 그대로 쓰지 않고 매번 refetch한다.
  async function run() {
    if (!location) return;
    setResult(null);
    setError('');
    const { data, error: fetchError } = await refetch();
    if (fetchError) return setError(errorMessage(fetchError));
    if (!data) return setError(MESSAGES.NO_CANDIDATES);

    setUserId(data.userId);
    const merged = mergeCandidates(data.restaurants, data.ratings, data.prefs, data.userId);
    setCategoryWeights(merged.categoryWeights);
    const candidates = filterCandidates(merged.candidates, new Date()).map((candidate) => ({
      ...candidate,
      weight: scoreCandidate(candidate, {
        categoryWeights: merged.categoryWeights,
        maxDistanceMeters: location.radius,
      }),
    }));
    const picked = pickWeightedRandom(candidates, Math.random);
    if (!picked) return setError(MESSAGES.NO_CANDIDATES);
    setResult(picked);
  }

  return (
    <section className={styles.section} aria-busy={isFetching}>
      <button className={styles.primaryButton} onClick={run} disabled={!location || isFetching}>
        한 곳 추천
      </button>
      {result && (
        <article className={styles.result}>
          <h2 className={styles.name}>{result.name}</h2>
          <p className={styles.meta}>
            {result.categoryLabel} · {Math.round(result.distanceMeters)}m
          </p>
          {/* 두 컴포넌트는 선택 상태를 들고 있으므로 대상이 바뀌면 remount해 이전 선택을 지운다. */}
          <RatingControls
            key={result.placeId}
            placeId={result.placeId}
            userId={userId}
            currentScore={result.personalRating}
          />
          <CategoryPrefs
            key={result.category}
            userId={userId}
            category={result.category}
            categoryLabel={result.categoryLabel}
            currentWeight={categoryWeights[result.category]}
          />
        </article>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
