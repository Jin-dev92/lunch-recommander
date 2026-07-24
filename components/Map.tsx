'use client';

import { useEffect, useRef, useState } from 'react';
import type { SearchLocation } from '../lib/types/api';
import { MESSAGES } from '../lib/messages';
import styles from './Map.module.css';

type Coords = { lat: number; lng: number };

export default function Map({
  onLocationChange,
}: {
  onLocationChange: (value: SearchLocation) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState<500 | 1000>(500);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState('');

  // 현재 위치는 최초 1회만 조회한다. 반경 변경은 좌표를 다시 물을 필요가 없다.
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setCoords({ lat: coords.latitude, lng: coords.longitude }),
      () => setError(MESSAGES.GEOLOCATION_DENIED),
    );
  }, []);

  // deps에 coords 객체나 onLocationChange 참조를 그대로 넣으면 참조가 바뀔 때마다 재실행된다.
  useEffect(() => {
    if (coords) onLocationChange({ ...coords, radius });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng, radius]);

  // 지도/마커는 좌표가 처음 정해질 때만 생성한다. 반경 변경으로 다시 만들 필요는 없다.
  useEffect(() => {
    if (!coords) return;
    if (typeof google === 'undefined' || !google.maps) {
      setError(MESSAGES.MAP_LOAD_FAILED);
      return;
    }
    const map = new google.maps.Map(node.current!, {
      center: coords,
      zoom: 16,
    });
    new google.maps.Marker({ position: coords, map });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng]);

  return (
    <section className={styles.section}>
      <label className={styles.radiusField}>
        검색 반경
        <select
          className={styles.select}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value) as 500 | 1000)}
        >
          <option value="500">500m</option>
          <option value="1000">1km</option>
        </select>
      </label>
      <div className={styles.map} ref={node} aria-label="주변 지도" />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
