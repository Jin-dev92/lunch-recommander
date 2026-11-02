'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
  DEFAULT_RECOMMENDATION_CRITERIA,
  type RecommendationCriteria,
  type SearchLocation,
} from '../lib/types/api';
import { FOOD_CATEGORY_OPTIONS, type FoodCategory } from '../lib/constants';
import { MESSAGES } from '../lib/messages';
import { useGeocode } from '../lib/hooks/mutations';
import { errorMessage } from '../lib/messages';
import MapCanvas from './map/MapCanvas';
import type { MapMarker } from './map/types';
import styles from './Map.module.css';
import Spinner from './Spinner';

type Coords = { lat: number; lng: number };
const DEFAULT_MAP_CENTER: Coords = { lat: 37.5665, lng: 126.978 };
// 위치 보정용 핀은 항상 1개다. 캔버스가 마커를 id로 식별하므로 고정 id를 쓴다.
const PIN_ID = 'search-location';

export default function Map({
  onLocationChange,
  onCriteriaChange,
  onRefresh,
}: {
  onLocationChange: (value: SearchLocation) => void;
  onCriteriaChange?: (value: RecommendationCriteria) => void;
  onRefresh?: () => void;
}) {
  const [radius, setRadius] = useState<SearchLocation['radius']>(500);
  const [category, setCategory] = useState<FoodCategory>(DEFAULT_RECOMMENDATION_CRITERIA.category);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const refresh = onRefresh ?? (() => window.location.reload());
  const geocode = useGeocode();

  // 주소 검색: 좌표로 변환되면 setCoords가 지도 중심·핀·검색 위치를 함께 옮긴다.
  function searchAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(new FormData(event.currentTarget).get('address') ?? '').trim();
    if (!address) return;
    geocode.mutate(
      // 지오코딩은 검색어만 있고 좌표가 없는 시점이라 지역 판정을 쓸 수 없다.
      // 현재 지도 중심을 함께 보내 서버가 provider를 고르게 한다.
      { address, near: coords ?? DEFAULT_MAP_CENTER },
      {
        onSuccess: (coords) => {
          setError('');
          setCoords(coords);
        },
      },
    );
  }

  const requestLocation = useCallback(async (isRetry = false) => {
    setIsLocating(true);
    if (isRetry && navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'denied') {
          setError(MESSAGES.GEOLOCATION_SETTINGS_REQUIRED);
          setIsLocating(false);
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
        setIsLocating(false);
      },
      () => {
        setError(isRetry ? MESSAGES.GEOLOCATION_SETTINGS_REQUIRED : MESSAGES.GEOLOCATION_DENIED);
        setIsLocating(false);
      },
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

  // 좌표를 모르는 동안에는 핀을 그리지 않는다. 매 렌더마다 새 배열을 넘기면
  // 캔버스가 마커를 지우고 다시 그리므로 원시값으로 메모한다.
  const markers = useMemo<MapMarker[]>(
    () =>
      coords
        ? [
            {
              id: PIN_ID,
              lat: coords.lat,
              lng: coords.lng,
              draggable: true,
              title: MESSAGES.MAP_ADJUST_HINT,
            },
          ]
        : [],
    // deps에 coords 객체를 넣으면 참조가 바뀔 때마다 새 배열이 나와 캔버스가 마커를 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coords?.lat, coords?.lng],
  );

  // 고정밀 측위도 실내나 데스크톱에서는 빗나가므로 사용자가 직접 보정할 수 있어야 한다.
  const moveTo = useCallback((lat: number, lng: number) => setCoords({ lat, lng }), []);
  const onMapError = useCallback(() => setError(MESSAGES.MAP_LOAD_FAILED), []);

  return (
    <section className={styles.section}>
      <form className={styles.addressSearch} onSubmit={searchAddress}>
        <input
          className={styles.addressInput}
          type="search"
          name="address"
          aria-label="주소 검색"
          placeholder={MESSAGES.ADDRESS_SEARCH_PLACEHOLDER}
          maxLength={200}
        />
        <button className={styles.addressButton} type="submit" disabled={geocode.isPending}>
          {geocode.isPending ? (
            <>
              <Spinner />
              검색 중…
            </>
          ) : (
            '검색'
          )}
        </button>
      </form>
      {geocode.isError && (
        <p className={styles.addressError} role="alert">
          {errorMessage(geocode.error)}
        </p>
      )}
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
          음식 종류
          <select
            className={styles.select}
            value={category}
            onChange={(e) => {
              const value = e.target.value as FoodCategory;
              setCategory(value);
              onCriteriaChange?.({ category: value });
            }}
          >
            {FOOD_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.mapContainer}>
        <MapCanvas
          center={coords ?? DEFAULT_MAP_CENTER}
          zoomLevel={coords ? 'pinpoint' : 'city'}
          markers={markers}
          onMapClick={moveTo}
          onMarkerDragEnd={(_id, lat, lng) => moveTo(lat, lng)}
          onError={onMapError}
          className={styles.map}
          ariaLabel="주변 지도"
        />
        <Tooltip title="지도 새로고침" placement="top">
          <IconButton
            className={styles.refreshButton}
            onClick={refresh}
            aria-label="지도 새로고침"
            size="large"
          >
            <RefreshRoundedIcon />
          </IconButton>
        </Tooltip>
      </div>
      <p className={styles.hint}>{MESSAGES.MAP_ADJUST_HINT}</p>
      {error && (
        <div className={styles.error} role="alert">
          {error === MESSAGES.GEOLOCATION_DENIED ||
          error === MESSAGES.GEOLOCATION_SETTINGS_REQUIRED ? (
            <button
              className={styles.retryButton}
              type="button"
              disabled={isLocating}
              aria-busy={isLocating}
              onClick={() => requestLocation(true)}
            >
              {isLocating ? (
                <>
                  <Spinner />
                  위치 확인 중…
                </>
              ) : (
                error
              )}
            </button>
          ) : (
            <p>{error}</p>
          )}
        </div>
      )}
    </section>
  );
}
