'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { listFolders } from '../../api';
import type { Folder } from '../../types/api';

export const folderQueryKeys = {
  all: ['folders'] as const,
  list: () => ['folders', 'list'] as const,
};

export const useFolders = (options?: Partial<UseQueryOptions<Folder[]>>) =>
  useQuery<Folder[]>({
    queryKey: folderQueryKeys.list(),
    queryFn: listFolders,
    ...options,
  });
