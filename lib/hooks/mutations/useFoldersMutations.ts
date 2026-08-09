'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { createFolder, deleteFolder, renameFolder } from '../../api';
import { folderQueryKeys } from '../queries';
import type { CreateFolderRequest, Folder, RenameFolderRequest } from '../../types/api';

export const useCreateFolder = (
  options?: UseMutationOptions<Folder, Error, CreateFolderRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: CreateFolderRequest) => createFolder(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: folderQueryKeys.all }),
    ...options,
  });
};

export const useRenameFolder = (options?: UseMutationOptions<void, Error, RenameFolderRequest>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: RenameFolderRequest) => renameFolder(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: folderQueryKeys.all }),
    ...options,
  });
};

export const useDeleteFolder = (options?: UseMutationOptions<void, Error, string>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: folderQueryKeys.all }),
    ...options,
  });
};
