'use client';
import { useState } from 'react';
import Link from 'next/link';
import Map from '../components/Map';
import Recommend from '../components/Recommend';
import Spinner from '../components/Spinner';
import { ROUTES } from '../lib/constants';
import { useAuth } from '../lib/hooks/useAuth';
import { useSignOut } from '../lib/hooks/mutations';
import { errorMessage, MESSAGES } from '../lib/messages';
import {
  DEFAULT_RECOMMENDATION_CRITERIA,
  type RecommendationCriteria,
  type SearchLocation,
} from '../lib/types/api';
import styles from './page.module.css';

export default function HomePage() {
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const [criteria, setCriteria] = useState<RecommendationCriteria>(DEFAULT_RECOMMENDATION_CRITERIA);
  const { isLoggedIn } = useAuth();
  const signOut = useSignOut();

  // 로그아웃 뒤 익명 세션 재발급은 전역 게이트가 새 Turnstile 토큰으로 처리한다.
  const logout = () => signOut.mutate();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>{MESSAGES.APP_NAME}</h1>
        <nav className={styles.actions}>
          {isLoggedIn ? (
            <>
              <Link className={styles.secondaryAction} href={ROUTES.PLACES}>
                내 맛집 지도
              </Link>
              <button
                className={styles.secondaryAction}
                onClick={logout}
                disabled={signOut.isPending}
              >
                {signOut.isPending ? (
                  <>
                    <Spinner />
                    로그아웃 중…
                  </>
                ) : (
                  '로그아웃'
                )}
              </button>
            </>
          ) : (
            <Link className={styles.secondaryAction} href={ROUTES.LOGIN}>
              로그인
            </Link>
          )}
        </nav>
      </header>
      {signOut.isError && (
        <p className={styles.error} role="alert">
          {errorMessage(signOut.error)}
        </p>
      )}
      <Map onLocationChange={setSearchLocation} onCriteriaChange={setCriteria} />
      {searchLocation && (
        <p className={styles.location}>
          선택된 위치: {searchLocation.lat}, {searchLocation.lng} ({searchLocation.radius}m)
        </p>
      )}
      <Recommend location={searchLocation} criteria={criteria} canRate={isLoggedIn} />
    </main>
  );
}
