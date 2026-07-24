'use client';
import { useState } from 'react';
import Link from 'next/link';
import GroupManager from '../components/GroupManager';
import Map from '../components/Map';
import Recommend from '../components/Recommend';
import { ROUTES } from '../lib/constants';
import { ensureSession } from '../lib/api';
import { useAuth } from '../lib/hooks/useAuth';
import { useSignOut } from '../lib/hooks/mutations';
import { errorMessage } from '../lib/messages';
import type { SearchLocation } from '../lib/types/api';
import styles from './page.module.css';

export default function HomePage() {
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const { isLoggedIn } = useAuth();
  const signOut = useSignOut();

  // 로그아웃해도 앱은 공개라 로그인 화면으로 보내지 않는다. 세션만 익명으로 되돌려
  // 계속 추천을 쓸 수 있게 한다. 헤더·평가 UI는 세션 변화 구독으로 자동 갱신된다.
  const logout = () => signOut.mutate(undefined, { onSuccess: () => ensureSession() });

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>점심 추천</h1>
        <nav className={styles.actions}>
          {isLoggedIn ? (
            <>
              <GroupManager />
              <button
                className={styles.secondaryAction}
                onClick={logout}
                disabled={signOut.isPending}
              >
                로그아웃
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
      <Map onLocationChange={setSearchLocation} />
      {searchLocation && (
        <p className={styles.location}>
          선택된 위치: {searchLocation.lat}, {searchLocation.lng} ({searchLocation.radius}m)
        </p>
      )}
      <Recommend location={searchLocation} canRate={isLoggedIn} />
    </main>
  );
}
