'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_RECOMMENDATION_CRITERIA,
  type MinimumGoogleRating,
  type MinimumGoogleReviews,
  type RecommendationCriteria,
  type SearchLocation,
} from '../lib/types/api';
import { MESSAGES } from '../lib/messages';
import styles from './Map.module.css';

type Coords = { lat: number; lng: number };

// loading=async는 Google이 권장하는 로딩 방식이다(생략하면 콘솔 경고가 뜬다). 대신 스크립트가
// 비동기로 들어오므로 google 전역이 언제 준비되는지 알 수 없어, onReady + importLibrary로 기다린다.
// language/region은 지도 위 라벨을 한국어·한국 기준으로 맞춘다.
const MAPS_SCRIPT_SRC =
  'https://maps.googleapis.com/maps/api/js' +
  `?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}` +
  '&loading=async&language=ko&region=KR';

export default function Map({
  onLocationChange,
  onCriteriaChange,
}: {
  onLocationChange: (value: SearchLocation) => void;
  onCriteriaChange?: (value: RecommendationCriteria) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  // 지도 인스턴스는 최초 1회만 만든다. 이 ref가 "이미 생성됨" 표시 역할도 한다.
  const mapRef = useRef<google.maps.Map | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [radius, setRadius] = useState<SearchLocation['radius']>(500);
  const [minGoogleRating, setMinGoogleRating] = useState<MinimumGoogleRating>(
    DEFAULT_RECOMMENDATION_CRITERIA.minGoogleRating,
  );
  const [minGoogleReviews, setMinGoogleReviews] = useState<MinimumGoogleReviews>(
    DEFAULT_RECOMMENDATION_CRITERIA.minGoogleReviews,
  );
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState('');

  const requestLocation = useCallback(async (isRetry = false) => {
    if (isRetry && navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'denied') {
          setError(MESSAGES.GEOLOCATION_SETTINGS_REQUIRED);
          return;
        }
      } catch {
        // Permissions API가 없거나 실패해도 Geolocation API로 직접 재시도한다.
      }
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setError('');
        setCoords({ lat: coords.latitude, lng: coords.longitude });
      },
      () =>
        setError(
          isRetry ? MESSAGES.GEOLOCATION_SETTINGS_REQUIRED : MESSAGES.GEOLOCATION_DENIED,
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  // 현재 위치는 최초 1회만 조회한다. 반경 변경은 좌표를 다시 물을 필요가 없다.
  // enableHighAccuracy가 없으면 WiFi/IP 기반 대략 측위로 떨어져 수 km 어긋난다.
  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);

  // deps에 coords 객체나 onLocationChange 참조를 그대로 넣으면 참조가 바뀔 때마다 재실행된다.
  useEffect(() => {
    if (coords) onLocationChange({ ...coords, radius });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng, radius]);

  // 좌표와 SDK가 모두 준비됐을 때 지도를 만든다. 둘 중 어느 쪽이 먼저 와도 상관없다.
  // 이후 좌표 변경(핀 이동)으로는 다시 만들지 않는다.
  useEffect(() => {
    if (!coords || !sdkReady || mapRef.current) return;
    let cancelled = false;

    (async () => {
      // loading=async는 요청한 라이브러리만 로드한다. Marker는 maps가 아니라 marker
      // 라이브러리 소속이므로 함께 가져오지 않으면 google.maps.Marker가 undefined다.
      const [{ Map: GoogleMap }, { Marker }] = await Promise.all([
        google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
        google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
      ]);
      // 라이브러리를 기다리는 사이 언마운트됐거나 다른 경로로 이미 만들어졌으면 중단한다.
      if (cancelled || mapRef.current || !node.current) return;

      const map = new GoogleMap(node.current, { center: coords, zoom: 16 });
      // 고정밀 측위도 실내나 데스크톱에서는 빗나가므로 사용자가 직접 보정할 수 있어야 한다.
      const marker = new Marker({
        position: coords,
        map,
        draggable: true,
        title: MESSAGES.MAP_ADJUST_HINT,
      });
      const moveTo = (latLng: google.maps.LatLng | null) => {
        if (!latLng) return;
        marker.setPosition(latLng);
        setCoords({ lat: latLng.lat(), lng: latLng.lng() });
      };
      marker.addListener('dragend', (event: google.maps.MapMouseEvent) => moveTo(event.latLng));
      map.addListener('click', (event: google.maps.MapMouseEvent) => moveTo(event.latLng));
      mapRef.current = map;
    })().catch(() => setError(MESSAGES.MAP_LOAD_FAILED));

    return () => {
      cancelled = true;
    };
  }, [coords, sdkReady]);

  return (
    <section className={styles.section}>
      <Script
        src={MAPS_SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
        onError={() => setError(MESSAGES.MAP_LOAD_FAILED)}
      />
      <div className={styles.searchFields}>
        <label className={styles.searchField}>
          검색 반경
          <select
            className={styles.select}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value) as SearchLocation['radius'])}
          >
            <option value="100">100m</option>
            <option value="300">300m</option>
            <option value="500">500m</option>
            <option value="1000">1km</option>
          </select>
        </label>
        <label className={styles.searchField}>
          최소 평점
          <select
            className={styles.select}
            value={minGoogleRating}
            onChange={(e) => {
              const value = Number(e.target.value) as MinimumGoogleRating;
              setMinGoogleRating(value);
              onCriteriaChange?.({ minGoogleRating: value, minGoogleReviews });
            }}
          >
            <option value="3.5">평점 3.5 이상</option>
            <option value="4">평점 4.0 이상</option>
            <option value="4.5">평점 4.5 이상</option>
            <option value="5">평점 5.0 이상</option>
          </select>
        </label>
        <label className={styles.searchField}>
          최소 리뷰 수
          <select
            className={styles.select}
            value={minGoogleReviews}
            onChange={(e) => {
              const value = Number(e.target.value) as MinimumGoogleReviews;
              setMinGoogleReviews(value);
              onCriteriaChange?.({ minGoogleRating, minGoogleReviews: value });
            }}
          >
            <option value="10">리뷰 10개 이상</option>
            <option value="30">리뷰 30개 이상</option>
            <option value="50">리뷰 50개 이상</option>
            <option value="70">리뷰 70개 이상</option>
            <option value="100">리뷰 100개 이상</option>
          </select>
        </label>
      </div>
      <div className={styles.map} ref={node} aria-label="주변 지도" />
      <p className={styles.hint}>{MESSAGES.MAP_ADJUST_HINT}</p>
      {error && (
        <div className={styles.error} role="alert">
          <button className={styles.retryButton} type="button" onClick={() => requestLocation(true)}>
            {error}
          </button>
        </div>
      )}
    </section>
  );
}
