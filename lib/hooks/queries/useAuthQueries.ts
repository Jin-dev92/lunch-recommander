'use client';

import { useQuery } from '@tanstack/react-query';
import { hasInviteSession } from '../../api';

export const authQueryKeys = {
  inviteSession: ['auth', 'invite-session'] as const,
};

export const useInviteSession = () =>
  useQuery({
    queryKey: authQueryKeys.inviteSession,
    queryFn: hasInviteSession,
    retry: false,
  });
