'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import AnonymousSessionGate from '../components/AnonymousSessionGate';

// QueryClient는 렌더마다 새로 만들면 캐시가 통째로 날아가므로 useState 초기화로 한 번만 만든다.
export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // 재시도는 과금·레이트리밋이 걸린 Edge Function을 여러 번 두드리게 하므로 끈다.
          queries: { retry: false, staleTime: 1000 * 30 },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AnonymousSessionGate>{children}</AnonymousSessionGate>
    </QueryClientProvider>
  );
}
