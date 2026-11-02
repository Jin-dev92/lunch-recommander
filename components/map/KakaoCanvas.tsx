'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KAKAO_MAP_LEVEL,
  KAKAO_MAP_SCRIPT_SRC,
  loadKakaoMaps,
  type KakaoMap,
  type KakaoMarker,
  type KakaoMaps,
} from '../../lib/kakaoMaps';
import type { MapCanvasProps, MapZoomLevel } from './types';

function levelFor(zoomLevel: MapZoomLevel): number {
  return zoomLevel === 'pinpoint' ? KAKAO_MAP_LEVEL.PINPOINT : KAKAO_MAP_LEVEL.CITY;
}

/** 국내 좌표에서 쓰는 카카오 지도 캔버스. 해외는 GoogleCanvas가 담당한다. */
export default function KakaoCanvas({
  center,
  zoomLevel,
  markers,
  onMapClick,
  onMarkerDragEnd,
  onMarkerClick,
  onError,
  className,
  ariaLabel,
  ariaHidden,
}: MapCanvasProps) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  // 좌표가 바뀔 때 LatLng를 새로 만들어야 하므로 SDK 네임스페이스를 들고 있는다.
  const mapsRef = useRef<KakaoMaps | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  // 지도 인스턴스는 ref에 담기므로 ref 대입만으로는 리렌더가 일어나지 않는다. 이 state가
  // "지도 준비됨"을 알려야 아래 중심·마커 effect가 다시 돌아 마커가 실제로 그려진다.
  const [mapReady, setMapReady] = useState(false);
  const markSdkReady = useCallback(() => setSdkReady(true), []);

  // 콜백 참조가 바뀔 때마다 지도를 다시 만들지 않도록 ref에 담아 둔다.
  const handlers = useRef({ onMapClick, onMarkerDragEnd, onMarkerClick, onError });
  handlers.current = { onMapClick, onMarkerDragEnd, onMarkerClick, onError };

  // 지도는 최초 1회만 만든다. mapRef가 "이미 생성됨" 표시 역할도 한다.
  useEffect(() => {
    if (!sdkReady || mapRef.current) return;
    let cancelled = false;

    (async () => {
      // autoload=false로 불러온 SDK는 kakao.maps.load 콜백이 초기화 완료를 알려준다.
      const maps = await loadKakaoMaps();
      if (cancelled || mapRef.current || !node.current) return;

      const map = new maps.Map(node.current, {
        center: new maps.LatLng(center.lat, center.lng),
        level: levelFor(zoomLevel),
      });
      maps.event.addListener(map, 'click', (event) =>
        handlers.current.onMapClick?.(event.latLng.getLat(), event.latLng.getLng()),
      );
      mapsRef.current = maps;
      mapRef.current = map;
      setMapReady(true);
    })().catch(() => {
      if (!cancelled) handlers.current.onError?.();
    });

    return () => {
      cancelled = true;
    };
    // center·zoomLevel은 최초 생성값으로만 쓰고, 이후 변경은 아래 effect가 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  // 지도 중심·확대는 props가 바뀔 때 옮긴다. mapReady가 deps에 있어야 지도 생성 직후에도 한 번 돈다.
  useEffect(() => {
    const maps = mapsRef.current;
    if (!maps || !mapRef.current) return;
    mapRef.current.setCenter(new maps.LatLng(center.lat, center.lng));
    mapRef.current.setLevel(levelFor(zoomLevel));
  }, [center.lat, center.lng, zoomLevel, mapReady]);

  // 마커는 목록이 바뀔 때마다 지우고 다시 그린다.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = markers.map((item) => {
      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(item.lat, item.lng),
        draggable: item.draggable,
        title: item.title,
      });
      // 카카오 dragend 콜백은 인자를 받지 않는다. 새 좌표는 마커에서 직접 읽는다.
      if (item.draggable)
        maps.event.addListener(marker, 'dragend', () => {
          const position = marker.getPosition();
          handlers.current.onMarkerDragEnd?.(item.id, position.getLat(), position.getLng());
        });
      maps.event.addListener(marker, 'click', () => handlers.current.onMarkerClick?.(item.id));
      return marker;
    });
  }, [markers, mapReady]);

  return (
    <>
      <Script
        src={KAKAO_MAP_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={markSdkReady}
        onReady={markSdkReady}
        onError={() => handlers.current.onError?.()}
      />
      <div className={className} ref={node} aria-label={ariaLabel} aria-hidden={ariaHidden} />
    </>
  );
}
