'use client';

import { useEffect, useRef, useState } from 'react';

type Location = { lat: number; lng: number; radius: 500 | 1000 };

export default function Map({ onLocationChange }: { onLocationChange: (value: Location) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState<500 | 1000>(500);
  const [error, setError] = useState('');

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location: Location = { lat: coords.latitude, lng: coords.longitude, radius };
        onLocationChange(location);
        const map = new google.maps.Map(node.current!, { center: location, zoom: 16 });
        new google.maps.Marker({ position: location, map });
      },
      () => setError('현재 위치 권한이 필요합니다.'),
    );
  }, [radius, onLocationChange]);

  return (
    <section>
      <label>
        검색 반경
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value) as 500 | 1000)}>
          <option value="500">500m</option>
          <option value="1000">1km</option>
        </select>
      </label>
      <div ref={node} aria-label="주변 지도" style={{ height: 400 }} />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
