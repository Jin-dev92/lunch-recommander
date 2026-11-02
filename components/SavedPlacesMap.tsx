'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { kakaoMapSearchUrl } from '../lib/constants';
import {
  useAddSavedPlace,
  useDeleteSavedPlace,
  useGeocode,
  useUpdateSavedPlaceMemo,
} from '../lib/hooks/mutations';
import { useSavedPlaces } from '../lib/hooks/queries';
import { errorMessage, MESSAGES } from '../lib/messages';
import {
  KAKAO_MAP_LEVEL,
  KAKAO_MAP_SCRIPT_SRC,
  loadKakaoMaps,
  type KakaoMap,
  type KakaoMarker,
} from '../lib/kakaoMaps';
import styles from './SavedPlacesMap.module.css';

type Coords = { lat: number; lng: number };
const DEFAULT_MAP_CENTER: Coords = { lat: 37.5665, lng: 126.978 };

/**
 * 선택된 폴더의 저장 맛집을 지도 핀 + 목록으로 보여준다. 목록 항목/핀을 선택하면
 * 상세(이름·주소·메모·지도 링크)가 열리고, canEdit이면 메모 수정·삭제도 할 수 있다.
 */
export default function SavedPlacesMap({
  folderId,
  canEdit,
}: {
  folderId: string | null;
  canEdit: boolean;
}) {
  const { data: places, isLoading, isError, error } = useSavedPlaces(folderId);
  const updateMemo = useUpdateSavedPlaceMemo();
  const deleteSavedPlace = useDeleteSavedPlace();
  const geocode = useGeocode();
  const addSavedPlace = useAddSavedPlace();

  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const confirmDialog = useRef<HTMLDialogElement>(null);

  const [sdkReady, setSdkReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState('');

  const selected = places?.find((place) => place.id === selectedId) ?? null;

  // 폴더가 바뀌면 이전 폴더에서 선택했던 항목이 남아 있지 않도록 초기화한다.
  useEffect(() => {
    setSelectedId(null);
  }, [folderId]);

  useEffect(() => {
    setMemoDraft(selected?.memo ?? '');
  }, [selected?.id, selected?.memo]);

  // SDK가 준비되면 지도를 한 번만 만들고, 이후 places가 바뀔 때마다(폴더 전환 포함)
  // 이전 마커를 지우고 다시 그린다.
  useEffect(() => {
    if (!sdkReady) return;
    let cancelled = false;

    (async () => {
      // autoload=false로 불러온 SDK는 kakao.maps.load 콜백이 초기화 완료를 알려준다.
      const maps = await loadKakaoMaps();
      if (cancelled || !mapNode.current) return;

      const first = places?.[0];
      if (!mapRef.current) {
        const center = first ?? DEFAULT_MAP_CENTER;
        mapRef.current = new maps.Map(mapNode.current, {
          center: new maps.LatLng(center.lat, center.lng),
          level: KAKAO_MAP_LEVEL.CITY,
        });
      }
      const map = mapRef.current;

      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = (places ?? []).map((place) => {
        const marker = new maps.Marker({
          position: new maps.LatLng(place.lat, place.lng),
          map,
          title: place.name,
        });
        maps.event.addListener(marker, 'click', () => setSelectedId(place.id));
        return marker;
      });

      if (first) map.setCenter(new maps.LatLng(first.lat, first.lng));
    })().catch(() => {
      if (!cancelled) setMapError(MESSAGES.MAP_LOAD_FAILED);
    });

    return () => {
      cancelled = true;
    };
  }, [sdkReady, places]);

  function saveMemo() {
    if (!selected) return;
    updateMemo.mutate({ id: selected.id, memo: memoDraft.trim() || null });
  }

  function confirmDelete() {
    if (!selected) return;
    deleteSavedPlace.mutate(selected.id, {
      onSuccess: () => {
        confirmDialog.current?.close();
        setSelectedId(null);
      },
    });
  }

  // 카카오 장소 식별자가 없으므로 좌표 기반 합성 키를 쓴다. 소수점 6자리로 고정해야
  // 같은 지점을 다시 검색해도 같은 placeId가 나와 unique(folder_id, place_id) 제약이
  // 중복을 흡수한다(upsert ignoreDuplicates는 useSavedPlacesMutations 쪽에서 처리).
  function searchAndAddPlace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderId) return;
    const form = event.currentTarget;
    const query = String(new FormData(form).get('query') ?? '').trim();
    if (!query) return;
    geocode.mutate(query, {
      onSuccess: (coords) => {
        addSavedPlace.mutate(
          {
            folderId,
            placeId: `manual:${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`,
            name: query,
            lat: coords.lat,
            lng: coords.lng,
            address: null,
          },
          { onSuccess: () => form.reset() },
        );
      },
    });
  }

  return (
    <section className={styles.section} aria-label="저장한 음식점 지도">
      <Script
        src={KAKAO_MAP_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onReady={() => setSdkReady(true)}
        onError={() => setMapError(MESSAGES.MAP_LOAD_FAILED)}
      />
      {/* 핀은 목록과 같은 선택 상태를 여는 보조 시각화라, 실제 상호작용은 아래 목록으로 제공한다. */}
      <div className={styles.map} ref={mapNode} aria-hidden="true" />
      {mapError && (
        <p className={styles.error} role="alert">
          {mapError}
        </p>
      )}
      {isError && (
        <p className={styles.error} role="alert">
          {errorMessage(error)}
        </p>
      )}

      {canEdit && folderId !== null && (
        <form className={styles.search} onSubmit={searchAndAddPlace}>
          <input
            className={styles.searchInput}
            type="search"
            name="query"
            aria-label="장소 검색"
            placeholder={MESSAGES.ADDRESS_SEARCH_PLACEHOLDER}
            maxLength={200}
          />
          <button type="submit" disabled={geocode.isPending || addSavedPlace.isPending}>
            {geocode.isPending || addSavedPlace.isPending ? '추가 중…' : '추가'}
          </button>
        </form>
      )}
      {(geocode.isError || addSavedPlace.isError) && (
        <p className={styles.error} role="alert">
          {errorMessage(geocode.error ?? addSavedPlace.error)}
        </p>
      )}

      {folderId === null ? (
        <p className={styles.empty}>{MESSAGES.SAVED_PLACES_NO_FOLDER}</p>
      ) : isLoading ? (
        <p role="status">불러오는 중…</p>
      ) : places && places.length === 0 ? (
        <p className={styles.empty}>{MESSAGES.SAVED_PLACES_EMPTY}</p>
      ) : (
        <ul className={styles.list}>
          {(places ?? []).map((place) => (
            <li className={styles.item} key={place.id}>
              <button
                type="button"
                className={
                  place.id === selectedId
                    ? `${styles.itemButton} ${styles.selected}`
                    : styles.itemButton
                }
                aria-pressed={place.id === selectedId}
                onClick={() => setSelectedId(place.id)}
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className={styles.detail}>
          <div className={styles.detailHeader}>
            <h3 className={styles.detailName}>{selected.name}</h3>
            {selected.address && <p className={styles.detailAddress}>{selected.address}</p>}
          </div>

          {canEdit ? (
            <div className={styles.memoEdit}>
              <textarea
                className={styles.memoInput}
                aria-label="메모"
                value={memoDraft}
                placeholder={MESSAGES.SAVED_PLACE_MEMO_PLACEHOLDER}
                onChange={(e) => setMemoDraft(e.target.value)}
              />
              <div className={styles.memoActions}>
                <button type="button" onClick={saveMemo} disabled={updateMemo.isPending}>
                  저장
                </button>
              </div>
              {updateMemo.isError && (
                <p className={styles.error} role="alert">
                  {MESSAGES.SAVED_PLACE_MEMO_SAVE_FAILED}
                </p>
              )}
            </div>
          ) : (
            selected.memo && <p className={styles.detailMemo}>{selected.memo}</p>
          )}

          <div className={styles.detailFooter}>
            <a
              className={styles.detailLink}
              href={kakaoMapSearchUrl(selected.name)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {MESSAGES.KAKAO_MAP_DETAIL_LINK}
            </a>
            {canEdit && (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => confirmDialog.current?.showModal()}
              >
                삭제
              </button>
            )}
          </div>
          {canEdit && deleteSavedPlace.isError && (
            <p className={styles.error} role="alert">
              {MESSAGES.SAVED_PLACE_DELETE_FAILED}
            </p>
          )}
        </div>
      )}

      {canEdit && (
        <dialog
          className={styles.confirmDialog}
          ref={confirmDialog}
          aria-labelledby="saved-place-delete-confirm"
        >
          <p id="saved-place-delete-confirm">{MESSAGES.SAVED_PLACE_DELETE_CONFIRM}</p>
          <div className={styles.confirmActions}>
            <button type="button" onClick={() => confirmDialog.current?.close()}>
              취소
            </button>
            <button type="button" onClick={confirmDelete}>
              삭제하기
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
