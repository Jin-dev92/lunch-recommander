import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // ponytail: supabase/functions는 자체 deno.json으로 `deno test`를 쓰는 Deno 전용 테스트라 vitest 대상에서 제외.
    // .claude·.worktrees는 에이전트 작업용 git worktree 사본이라 본 프로젝트 테스트 대상이 아니다
    // (사본은 자체 node_modules를 들고 있어 React가 중복 로드되면 "Invalid hook call"이 난다).
    exclude: ['**/node_modules/**', 'supabase/functions/**', '.claude/**', '.worktrees/**'],
  },
});
