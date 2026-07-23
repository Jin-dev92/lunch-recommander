'use client';

import { useEffect, useRef, useState } from 'react';

type Location = { lat: number; lng: number; radius: 500 | 1000 };
type Coords = { lat: number; lng: number };

export default function Map({ onLocationChange }: { onLocationChange: (value: Location) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState<500 | 1000>(500);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState('');

  // 현재 위치는 최초 1회만 조회한다. 반경 변경은 좌표를 다시 물을 필요가 없다.
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setCoords({ lat: coords.latitude, lng: coords.longitude }),
      () => setError('현재 위치 권한이 필요합니다.'),
    );
  }, []);

  useEffect(() => {
    if (coords) onLocationChange({ ...coords, radius });
  }, [coords, radius, onLocationChange]);

  // 지도/마커는 좌표가 처음 정해질 때만 생성한다. 반경 변경으로 다시 만들 필요는 없다.
  useEffect(() => {
    if (!coords) return;
    if (typeof google === 'undefined' || !google.maps) {
      setError('지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    const map = new google.maps.Map(node.current!, {
      center: coords,
      zoom: 16,
    });
    new google.maps.Marker({ position: coords, map });
  }, [coords]);

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
