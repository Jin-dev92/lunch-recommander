import { ON_CONFLICT, TABLE } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type { AddSavedPlaceRequest, SavedPlace } from '../types/api';
import { getCurrentUser } from './auth';
import { assertNoError, unwrap } from './unwrap';

type SavedPlaceRow = {
  id: string;
  folder_id: string;
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  memo: string | null;
  created_at: string;
};
const COLS = 'id,folder_id,place_id,name,lat,lng,address,memo,created_at';
const toSavedPlace = (r: SavedPlaceRow): SavedPlace => ({
  id: r.id,
  folderId: r.folder_id,
  placeId: r.place_id,
  name: r.name,
  lat: r.lat,
  lng: r.lng,
  address: r.address,
  memo: r.memo,
  createdAt: r.created_at,
});

export async function listSavedPlaces(folderId: string): Promise<SavedPlace[]> {
  const rows = unwrap<SavedPlaceRow[]>(
    await supabase
      .from(TABLE.SAVED_PLACES)
      .select(COLS)
      .eq('folder_id', folderId)
      .order('created_at'),
  );
  return (rows ?? []).map(toSavedPlace);
}

export async function addSavedPlace(req: AddSavedPlaceRequest): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.isAnonymous) throw new Error(MESSAGES.LOGIN_REQUIRED);
  // 같은 폴더에 같은 가게가 이미 있으면 조용히 성공 처리(중복 저장 방지, 사용자에겐 저장됨으로 보인다).
  assertNoError(
    await supabase.from(TABLE.SAVED_PLACES).upsert(
      {
        folder_id: req.folderId,
        place_id: req.placeId,
        name: req.name,
        lat: req.lat,
        lng: req.lng,
        address: req.address,
        memo: req.memo ?? null,
        created_by: user.id,
      },
      { onConflict: ON_CONFLICT.SAVED_PLACES, ignoreDuplicates: true },
    ),
  );
}

export async function updateSavedPlaceMemo(id: string, memo: string | null): Promise<void> {
  assertNoError(await supabase.from(TABLE.SAVED_PLACES).update({ memo }).eq('id', id));
}

export async function deleteSavedPlace(id: string): Promise<void> {
  assertNoError(await supabase.from(TABLE.SAVED_PLACES).delete().eq('id', id));
}
