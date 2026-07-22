import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // ponytail: supabase/functions는 자체 deno.json으로 `deno test`를 쓰는 Deno 전용 테스트라 vitest 대상에서 제외
    exclude: ['**/node_modules/**', 'supabase/functions/**'],
  },
});
