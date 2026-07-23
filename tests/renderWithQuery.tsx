import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * React Query를 쓰는 컴포넌트용 렌더 헬퍼.
 * 테스트마다 새 QueryClient를 만들어 캐시가 테스트 사이로 새지 않게 하고,
 * 재시도를 꺼서 실패 케이스가 지연 없이 곧바로 에러 상태가 되게 한다.
 */
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
