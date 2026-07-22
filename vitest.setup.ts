import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// ponytail: vitest globals:false라 RTL 자동 cleanup이 안 붙는다 → 렌더 누적으로 "여러 개 찾음" 에러 방지
afterEach(() => cleanup());
