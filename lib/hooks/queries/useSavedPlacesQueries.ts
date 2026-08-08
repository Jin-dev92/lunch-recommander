'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { listSavedPlaces } from '../../api';
import type { SavedPlace } from '../../types/api';

export const savedPlaceQueryKeys = {
  all: ['savedPlaces'] as const,
  byFolder: (folderId: string | null) => ['savedPlaces', folderId] as const,
};

export const useSavedPlaces = (
  folderId: string | null,
  options?: Partial<UseQueryOptions<SavedPlace[]>>,
) =>
  useQuery<SavedPlace[]>({
    queryKey: savedPlaceQueryKeys.byFolder(folderId),
    queryFn: () => listSavedPlaces(folderId!),
    enabled: Boolean(folderId),
    ...options,
  });
