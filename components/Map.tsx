'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { type SearchLocation } from '../lib/types/api';
import { MESSAGES } from '../lib/messages';
import { useGeocode } from '../lib/hooks/mutations';
import { errorMessage } from '../lib/messages';
import {
  KAKAO_MAP_LEVEL,
  KAKAO_MAP_SCRIPT_SRC,
  loadKakaoMaps,
  type KakaoLatLng,
  type KakaoMap,
  type KakaoMarker,
  type KakaoMaps,
} from '../lib/kakaoMaps';
import styles from './Map.module.css';
import Spinner from './Spinner';

type Coords = { lat: number; lng: number };
const DEFAULT_MAP_CENTER: Coords = { lat: 37.5665, lng: 126.978 };

export default function Map({
  onLocationChange,
  onRefresh,
}: {
  onLocationChange: (value: SearchLocation) => void;
  onRefresh?: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  // 지도 인스턴스는 최초 1회만 만든다. 이 ref가 "이미 생성됨" 표시 역할도 한다.
  const mapRef = useRef<KakaoMap | null>(null);
  const markerRef = useRef<KakaoMarker | null>(null);
  // 좌표가 바뀔 때 LatLng를 새로 만들어야 하므로 SDK 네임스페이스를 들고 있는다.
  const mapsRef = useRef<KakaoMaps | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [radius, setRadius] = useState<SearchLocation['radius']>(500);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const refresh = onRefresh ?? (() => window.location.reload());
  const markSdkReady = useCallback(() => setSdkReady(true), []);
  const geocode = useGeocode();

  // 주소 검색: 좌표로 변환되면 setCoords가 지도 중심·핀·검색 위치를 함께 옮긴다.
  function searchAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = String(new FormData(event.currentTarget).get('address') ?? '').trim();
    if (!address) return;
    geocode.mutate(address, {
      onSuccess: (coords) => {
        setError('');
        setCoords(coords);
      },
    });
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

  // SDK만 준비되면 기본 서울 지도를 먼저 만든다. 첫 방문자의 위치 권한 응답이 늦거나
  // 실패해도 빈 영역으로 남지 않으며, 좌표가 준비되면 아래 effect가 중심과 핀을 옮긴다.
  useEffect(() => {
    if (!sdkReady || mapRef.current) return;
    let cancelled = false;

    (async () => {
      // autoload=false로 불러온 SDK는 kakao.maps.load 콜백이 초기화 완료를 알려준다.
      const maps = await loadKakaoMaps();
      // 초기화를 기다리는 사이 언마운트됐거나 다른 경로로 이미 만들어졌으면 중단한다.
      if (cancelled || mapRef.current || !node.current) return;

      const center = coords ?? DEFAULT_MAP_CENTER;
      const initialCenter = new maps.LatLng(center.lat, center.lng);
      const map = new maps.Map(node.current, {
        center: initialCenter,
        level: coords ? KAKAO_MAP_LEVEL.PINPOINT : KAKAO_MAP_LEVEL.CITY,
      });
      // 고정밀 측위도 실내나 데스크톱에서는 빗나가므로 사용자가 직접 보정할 수 있어야 한다.
      const marker = new maps.Marker({
        position: initialCenter,
        draggable: true,
        title: MESSAGES.MAP_ADJUST_HINT,
      });
      // 카카오 마커에는 setVisible이 없다. 좌표를 모르는 동안에는 지도에 붙이지 않는다.
      if (coords) marker.setMap(map);

      const moveTo = (latLng: KakaoLatLng) => {
        marker.setPosition(latLng);
        marker.setMap(map);
        setCoords({ lat: latLng.getLat(), lng: latLng.getLng() });
      };
      // 마커 dragend 콜백은 인자를 받지 않으므로 새 좌표를 마커에서 직접 읽는다.
      maps.event.addListener(marker, 'dragend', () => moveTo(marker.getPosition()));
      maps.event.addListener(map, 'click', (event) => moveTo(event.latLng));
      mapsRef.current = maps;
      mapRef.current = map;
      markerRef.current = marker;
    })().catch(() => {
      if (!cancelled) setError(MESSAGES.MAP_LOAD_FAILED);
    });

    return () => {
      cancelled = true;
    };
  }, [coords, sdkReady]);

  useEffect(() => {
    const maps = mapsRef.current;
    if (!coords || !maps || !mapRef.current || !markerRef.current) return;
    const latLng = new maps.LatLng(coords.lat, coords.lng);
    mapRef.current.setCenter(latLng);
    mapRef.current.setLevel(KAKAO_MAP_LEVEL.PINPOINT);
    markerRef.current.setPosition(latLng);
    markerRef.current.setMap(mapRef.current);
  }, [coords]);

  return (
    <section className={styles.section}>
      <Script
        src={KAKAO_MAP_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={markSdkReady}
        onReady={markSdkReady}
        onError={() => setError(MESSAGES.MAP_LOAD_FAILED)}
      />
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
      </div>
      <div className={styles.mapContainer}>
        <div className={styles.map} ref={node} aria-label="주변 지도" />
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
