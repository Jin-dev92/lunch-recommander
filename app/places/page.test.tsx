import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));
// 지도 컴포넌트는 SDK를 타므로 모킹(Task 8에서 실제 구현)
vi.mock('../../components/SavedPlacesMap', () => ({ default: () => null }));
import { useAuth } from '../../lib/hooks/useAuth';
import { renderWithQuery } from '../../tests/renderWithQuery';
import PlacesPage from './page';

const auth = useAuth as ReturnType<typeof vi.fn>;
beforeEach(() => auth.mockReset());

describe('맛집 지도 페이지', () => {
  it('로그인하지 않았으면 로그인 유도를 보여준다', () => {
    auth.mockReturnValue({ ready: true, isLoggedIn: false });
    renderWithQuery(<PlacesPage />);
    expect(screen.getByRole('link', { name: /로그인/ })).toHaveAttribute('href', '/login');
  });
});
