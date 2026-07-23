'use client';
import { useState } from 'react';
import Link from 'next/link';
import Map from '../components/Map';
import Recommend from '../components/Recommend';
import { ROUTES, SESSION_COOKIE } from '../lib/constants';
import { useSignOut } from '../lib/hooks/mutations';
import { errorMessage } from '../lib/messages';
import type { SearchLocation } from '../lib/types/api';

export default function HomePage() {
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  const signOut = useSignOut();

  // 쿠키 정리·화면 이동은 UI 후처리이므로 mutation hook이 아니라 여기서 처리한다.
  const logout = () =>
    signOut.mutate(undefined, {
      onSuccess: () => {
        document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
        window.location.assign(ROUTES.LOGIN);
      },
    });

  return (
    <main>
      <h1>점심 추천</h1>
      <Link href={ROUTES.GROUPS}>그룹 관리</Link>
      <button onClick={logout} disabled={signOut.isPending}>
        로그아웃
      </button>
      {signOut.isError && <p role="alert">{errorMessage(signOut.error)}</p>}
      <Map onLocationChange={setSearchLocation} />
      {searchLocation && (
        <p>
          선택된 위치: {searchLocation.lat}, {searchLocation.lng} ({searchLocation.radius}m)
        </p>
      )}
      <Recommend location={searchLocation} />
    </main>
  );
}
