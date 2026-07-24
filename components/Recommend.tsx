'use client';
import { useState } from 'react';
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
import type { SearchLocation } from '../lib/types/api';
import { ROUTES } from '../lib/constants';
import Link from 'next/link';
import RatingControls from './RatingControls';
import CategoryPrefs from './CategoryPrefs';
import styles from './Recommend.module.css';

type Result = Candidate & {
  name: string;
  categoryLabel: string;
  priceLevel: string | null;
  photoName: string | null;
  weight: number;
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
  const [categoryWeights, setCategoryWeights] = useState<Record<string, number>>({});
  const { refetch, isFetching } = useRecommendationData(location);
  // 사진은 추천된 곳에 photoName이 있을 때만 조회된다(hook 안에서 enabled로 제어).
  const photo = usePlacePhoto(result?.photoName ?? null);

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
    </section>
  );
}
