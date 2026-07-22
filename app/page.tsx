'use client';
import { useState } from 'react';
import Map from '../components/Map';
import { supabase } from '../lib/supabaseClient';

type SearchLocation = { lat: number; lng: number; radius: 500 | 1000 };

export default function HomePage() {
  const [error, setError] = useState('');
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null);
  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      return;
    }
    document.cookie = 'sb-session=; path=/; max-age=0';
    window.location.assign('/login');
  }
  return (
    <main>
      <h1>점심 추천</h1>
      <button onClick={logout}>로그아웃</button>
      {error && <p role="alert">{error}</p>}
      <Map onLocationChange={setSearchLocation} />
      {searchLocation && (
        <p>
          선택된 위치: {searchLocation.lat}, {searchLocation.lng} ({searchLocation.radius}m)
        </p>
      )}
    </main>
  );
}
