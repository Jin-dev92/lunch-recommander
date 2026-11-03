'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecommendationData } from '../lib/hooks/queries';

import { errorMessage, MESSAGES } from '../lib/messages';
import { mergeCandidates } from '../lib/mergeCandidates';
import {
  byCategory,
  categoryCounts,
  filterCandidates,
  pickWeightedRandom,
  scoreCandidate,
  type Candidate,
} from '../lib/recommend';
import { type SearchLocation } from '../lib/types/api';
import { ALL_CATEGORIES, ROUTES } from '../lib/constants';
import Link from 'next/link';
import RatingControls from './RatingControls';
import CategoryPrefs from './CategoryPrefs';
import SaveToFolderButton from './SaveToFolderButton';
import Spinner from './Spinner';
import styles from './Recommend.module.css';

type Result = Candidate & {
  name: string;
  categoryLabel: string;
  address: string | null;
  lat: number;
  lng: number;
  placeUrl: string;
  weight: number;
};

type RecommendationPool = {
  candidates: Result[];
  userId: string;
  categoryWeights: Record<string, number>;
};

export default function Recommend({
  location,
  canRate,
}: {
  location: SearchLocation | null;
  // 로그인한 실사용자만 평가할 수 있다. 익명 사용자는 추천만 보고 평가 UI는 로그인 유도로 대체한다.
  canRate: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [poolExhausted, setPoolExhausted] = useState(false);
  const [categoryWeights, setCategoryWeights] = useState<Record<string, number>>({});
  const [recommendationPool, setRecommendationPool] = useState<RecommendationPool | null>(null);
  // 음식 종류 선택지는 고정 목록이 아니라 받아온 후보에서 나온다. 그래서 이 상태는
  // 첫 추천 이후에만 의미가 있고, 바꿔도 후보를 다시 받아오지 않는다.
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const seenPlaceIds = useRef(new Set<string>());
  const { refetch, isFetching } = useRecommendationData(location);

  // 위치가 바뀌면 후보 자체가 달라지므로 전부 초기화한다.
  useEffect(() => {
    setRecommendationPool(null);
    seenPlaceIds.current.clear();
    setResult(null);
    setError('');
    setPoolExhausted(false);
    setCategory(ALL_CATEGORIES);
  }, [location?.lat, location?.lng, location?.radius]);

  // 종류만 바꾼 경우엔 후보를 다시 받지 않는다. 좁힌 범위에서 새로 뽑을 수 있도록
  // "이미 본 곳" 기록만 비운다.
  useEffect(() => {
    seenPlaceIds.current.clear();
    setResult(null);
    setPoolExhausted(false);
  }, [category]);

  // 실제로 존재하는 종류만 선택지로 보여준다. 개수를 함께 보여주면 왜 그 결과가
  // 나왔는지 납득이 된다.
  const options = useMemo(
    () => categoryCounts(recommendationPool?.candidates ?? []),
    [recommendationPool],
  );

  async function run() {
    if (!location) return;
    setResult(null);
    setError('');
    setPoolExhausted(false);
    let pool = recommendationPool;
    if (!pool) {
      const { data, error: fetchError } = await refetch();
      if (fetchError) return setError(errorMessage(fetchError));
      if (!data) return setError(MESSAGES.NO_CANDIDATES);

      const merged = mergeCandidates(data.restaurants, data.ratings, data.prefs, data.userId);
      pool = {
        userId: data.userId,
        categoryWeights: merged.categoryWeights,
        candidates: filterCandidates(merged.candidates, new Date()).map((candidate) => ({
          ...candidate,
          weight: scoreCandidate(candidate, {
            categoryWeights: merged.categoryWeights,
            maxDistanceMeters: location.radius,
          }),
        })),
      };
      setRecommendationPool(pool);
      setUserId(pool.userId);
      setCategoryWeights(pool.categoryWeights);
    }

    // 종류 좁히기는 여기서 한다(후보를 다시 받지 않기 위해).
    const inCategory = byCategory(pool.candidates, category);
    const available = inCategory.filter(
      (candidate) => !seenPlaceIds.current.has(candidate.placeId),
    );
    const picked = pickWeightedRandom(available, Math.random);
    if (!picked) {
      if (inCategory.length > 0) setPoolExhausted(true);
      else setError(MESSAGES.NO_CANDIDATES);
      return;
    }
    seenPlaceIds.current.add(picked.placeId);
    setResult(picked);
  }

  return (
    <section className={styles.section} aria-busy={isFetching}>
      <button className={styles.primaryButton} onClick={run} disabled={!location || isFetching}>
        {isFetching ? (
          <>
            <Spinner />
            추천 중…
          </>
        ) : (
          '한 곳 추천'
        )}
      </button>
      {options.length > 1 && (
        <label className={styles.categoryField}>
          음식 종류
          <select
            className={styles.categorySelect}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value={ALL_CATEGORIES}>
              {ALL_CATEGORIES} ({recommendationPool?.candidates.length ?? 0})
            </option>
            {options.map(({ category: name, count }) => (
              <option key={name} value={name}>
                {name} ({count})
              </option>
            ))}
          </select>
        </label>
      )}
      {result && (
        <article className={styles.result}>
          <div className={styles.resultHeader}>
            <h2 className={styles.name}>{result.name}</h2>
          </div>
          <p className={styles.meta}>
            {[result.categoryLabel, `${Math.round(result.distanceMeters)}m`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {result.address && <p className={styles.address}>{result.address}</p>}
          {/* 카카오 로컬 API에는 사진·평점·가격대가 없다. 메뉴·사진·리뷰는 nearby가 함께
              돌려주는 카카오맵 장소 상세(place_url)로 넘긴다. 추가 API 호출이 없다. */}
          <a
            className={styles.detailLink}
            href={result.placeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {MESSAGES.KAKAO_MAP_DETAIL_LINK}
          </a>
          {canRate ? (
            <>
              <SaveToFolderButton
                key={`save-${result.placeId}`}
                place={{
                  placeId: result.placeId,
                  name: result.name,
                  lat: result.lat,
                  lng: result.lng,
                  address: result.address,
                }}
              />
              {/* 두 컴포넌트는 선택 상태를 들고 있으므로 대상이 바뀌면 remount해 이전 선택을 지운다. */}
              <RatingControls
                key={result.placeId}
                placeId={result.placeId}
                userId={userId}
                currentScore={result.personalRating}
                onExclude={run}
              />
              <CategoryPrefs
                key={result.category}
                userId={userId}
                category={result.category}
                categoryLabel={result.categoryLabel}
                currentWeight={categoryWeights[result.category]}
              />
            </>
          ) : (
            <p className={styles.loginPrompt}>
              <Link href={ROUTES.LOGIN}>로그인</Link>하면 별점·취향을 반영해 더 잘 골라드려요.
            </p>
          )}
        </article>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {poolExhausted && (
        <p className={styles.notice} role="status">
          {MESSAGES.RECOMMENDATION_POOL_EXHAUSTED}
        </p>
      )}
    </section>
  );
}
