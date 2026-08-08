'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { addSavedPlace, deleteSavedPlace, updateSavedPlaceMemo } from '../../api';
import { savedPlaceQueryKeys } from '../queries';
import type { AddSavedPlaceRequest, UpdateSavedPlaceMemoRequest } from '../../types/api';

export const useAddSavedPlace = (
  options?: UseMutationOptions<void, Error, AddSavedPlaceRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AddSavedPlaceRequest) => addSavedPlace(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedPlaceQueryKeys.all }),
    ...options,
  });
};

export const useUpdateSavedPlaceMemo = (
  options?: UseMutationOptions<void, Error, UpdateSavedPlaceMemoRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memo }: UpdateSavedPlaceMemoRequest) => updateSavedPlaceMemo(id, memo),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedPlaceQueryKeys.all }),
    ...options,
  });
};

export const useDeleteSavedPlace = (options?: UseMutationOptions<void, Error, string>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedPlace(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedPlaceQueryKeys.all }),
    ...options,
  });
};
