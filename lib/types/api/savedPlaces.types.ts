// @see public.saved_places (supabase/migrations/0011)
export type SavedPlace = {
  id: string;
  folderId: string;
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  memo: string | null;
  createdAt: string;
};
export type AddSavedPlaceRequest = {
  folderId: string;
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  memo?: string | null;
};
export type UpdateSavedPlaceMemoRequest = { id: string; memo: string | null };
