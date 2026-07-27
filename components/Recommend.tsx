'use client';
import { useEffect, useRef, useState } from 'react';
import { usePlacePhoto, useRecommendationData } from '../lib/hooks/queries';
import { googleMapsPlaceUrl, priceLevelSymbol } from '../lib/constants';
import { errorMessage, MESSAGES } from '../lib/messages';
import { mergeCandidates } from '../lib/mergeCandidates';
import {
  filterCandidates,
  pickWeightedRandom,
  scoreCandidate,
  type Candidate,
} from '../lib/recommend';
import {
  DEFAULT_RECOMMENDATION_CRITERIA,
  type RecommendationCriteria,
  type SearchLocation,
} from '../lib/types/api';
import { ROUTES } from '../lib/constants';
import Link from 'next/link';
import RatingControls from './RatingControls';
import CategoryPrefs from './CategoryPrefs';
import Spinner from './Spinner';
import styles from './Recommend.module.css';

type Result = Candidate & {
  name: string;
  categoryLabel: string;
  priceLevel: string | null;
  photoName: string | null;
  weight: number;
};

type RecommendationPool = {
  candidates: Result[];
  userId: string;
  categoryWeights: Record<string, number>;
};

export default function Recommend({
  location,
  criteria = DEFAULT_RECOMMENDATION_CRITERIA,
  canRate,
}: {
  location: SearchLocation | null;
  criteria?: RecommendationCriteria;
  // 로그인한 실사용자만 평가할 수 있다. 익명 사용자는 추천만 보고 평가 UI는 로그인 유도로 대체한다.
  canRate: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [poolExhausted, setPoolExhausted] = useState(false);
  const [categoryWeights, setCategoryWeights] = useState<Record<string, number>>({});
  const [recommendationPool, setRecommendationPool] = useState<RecommendationPool | null>(null);
  const seenPlaceIds = useRef(new Set<string>());
  const { refetch, isFetching } = useRecommendationData(location);
  // 사진은 추천된 곳에 photoName이 있을 때만 조회된다(hook 안에서 enabled로 제어).
  const photo = usePlacePhoto(result?.photoName ?? null);

  useEffect(() => {
    setRecommendationPool(null);
    seenPlaceIds.current.clear();
    setResult(null);
    setError('');
    setPoolExhausted(false);
  }, [
    location?.lat,
    location?.lng,
    location?.radius,
    criteria.minGoogleRating,
    criteria.minGoogleReviews,
  ]);

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
        candidates: filterCandidates(merged.candidates, new Date(), criteria).map((candidate) => ({
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

    const available = pool.candidates.filter(
      (candidate) => !seenPlaceIds.current.has(candidate.placeId),
    );
    const picked = pickWeightedRandom(available, Math.random);
    if (!picked) {
      if (pool.candidates.length > 0) setPoolExhausted(true);
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
      {result && (
        <article className={styles.result}>
          <div className={styles.resultHeader}>
            {/* 가게 외형은 이름 텍스트에 없는 정보라 의미 있는 alt를 준다. */}
            {photo.data && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.thumbnail}
                src={photo.data}
                alt={`${result.name} 사진`}
                width={72}
                height={72}
              />
            )}
            <h2 className={styles.name}>{result.name}</h2>
          </div>
          <p className={styles.meta}>
            {[
              result.categoryLabel,
              priceLevelSymbol(result.priceLevel),
              `${Math.round(result.distanceMeters)}m`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {/* 메뉴·사진·리뷰는 Google 지도 상세로 넘긴다. placeId만 쓰므로 추가 API 비용이 없다. */}
          <a
            className={styles.detailLink}
            href={googleMapsPlaceUrl(result.name, result.placeId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            메뉴·리뷰 자세히 보기
          </a>
          {canRate ? (
            <>
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
