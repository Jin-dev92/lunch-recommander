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

type Result = Candidate & { name: string; weight: number };

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
    <section>
      <button onClick={run} disabled={!location || isFetching}>
        한 곳 추천
      </button>
      {result && (
        <article>
          <h2>{result.name}</h2>
          <p>
            {result.category} · {Math.round(result.distanceMeters)}m
          </p>
          <RatingControls placeId={result.placeId} userId={userId} />
          <CategoryPrefs
            userId={userId}
            categories={[result.category]}
            currentWeights={categoryWeights}
          />
        </article>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
