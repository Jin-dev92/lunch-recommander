'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAPS_SCRIPT_SRC, waitForMapsSdk } from '../../lib/googleMaps';
import type { MapCanvasProps, MapZoomLevel } from './types';

// 카카오 level과 방향이 반대다(Google zoom은 클수록 확대). 의미값을 여기서 숫자로 바꿔
// 소비 컴포넌트가 provider별 차이를 모르게 한다.
const GOOGLE_ZOOM = {
  pinpoint: 16,
  city: 13,
} as const;

function zoomFor(zoomLevel: MapZoomLevel): number {
  return GOOGLE_ZOOM[zoomLevel];
}

/** 해외 좌표에서 쓰는 Google 지도 캔버스. 국내는 KakaoCanvas가 담당한다. */
export default function GoogleCanvas({
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
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const markerCtorRef = useRef<typeof google.maps.Marker | null>(null);
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
      // loading=async는 스크립트 준비 이벤트와 importLibrary 노출 시점이 다를 수 있으므로,
      // SDK 전역이 실제로 준비될 때까지 기다린다.
      const maps = await waitForMapsSdk();
      // Marker는 maps가 아니라 marker 라이브러리 소속이므로 함께 요청한다.
      const [{ Map: GoogleMap }, { Marker }] = await Promise.all([
        maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
        maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
      ]);
      if (cancelled || mapRef.current || !node.current) return;

      const map = new GoogleMap(node.current, {
        center,
        zoom: zoomFor(zoomLevel),
        mapTypeControl: false,
      });
      map.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) handlers.current.onMapClick?.(event.latLng.lat(), event.latLng.lng());
      });
      markerCtorRef.current = Marker;
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
    if (!mapRef.current) return;
    mapRef.current.setCenter({ lat: center.lat, lng: center.lng });
    mapRef.current.setZoom(zoomFor(zoomLevel));
    // deps에는 center 객체가 아니라 원시값만 넣는다(참조가 바뀔 때마다 재실행되지 않게).
  }, [center.lat, center.lng, zoomLevel, mapReady]);

  // 마커는 목록이 바뀔 때마다 지우고 다시 그린다.
  useEffect(() => {
    const Marker = markerCtorRef.current;
    const map = mapRef.current;
    if (!Marker || !map) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = markers.map((item) => {
      const marker = new Marker({
        map,
        position: { lat: item.lat, lng: item.lng },
        draggable: item.draggable,
        title: item.title,
      });
      // Google dragend는 이벤트 객체로 좌표를 넘겨준다(카카오와 다른 지점).
      if (item.draggable)
        marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
          if (event.latLng)
            handlers.current.onMarkerDragEnd?.(item.id, event.latLng.lat(), event.latLng.lng());
        });
      marker.addListener('click', () => handlers.current.onMarkerClick?.(item.id));
      return marker;
    });
  }, [markers, mapReady]);

  return (
    <>
      <Script
        src={MAPS_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={markSdkReady}
        onReady={markSdkReady}
        onError={() => handlers.current.onError?.()}
      />
      <div className={className} ref={node} aria-label={ariaLabel} aria-hidden={ariaHidden} />
    </>
  );
}
