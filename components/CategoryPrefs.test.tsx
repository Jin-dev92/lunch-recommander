import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));
import { supabase } from '../lib/supabaseClient';
import { renderWithQuery } from '../tests/renderWithQuery';
import CategoryPrefs from './CategoryPrefs';

const from = supabase.from as ReturnType<typeof vi.fn>;

function mockUpsert(error: unknown = null) {
  const upsert = vi.fn().mockResolvedValue({ data: null, error });
  from.mockImplementation(() => ({ upsert }));
  return upsert;
}

function render(currentWeight?: number) {
  return renderWithQuery(
    <CategoryPrefs
      userId="me"
      category="korean_restaurant"
      categoryLabel="한식당"
      currentWeight={currentWeight}
    />,
  );
}

describe('카테고리 기호 저장', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('표시 이름으로 3단계 선택지를 보여줍니다', () => {
    mockUpsert();
    render();
    expect(screen.getByText('한식당, 얼마나 좋아하세요?')).toBeInTheDocument();
    for (const label of ['별로예요', '보통', '좋아요']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  // 세 번째 인자는 시작 가중치다. 이미 선택된 항목을 다시 누르면 값이 바뀌지 않아
  // change 이벤트가 없고 저장도 일어나지 않으므로, 각 케이스는 다른 값에서 출발한다.
  it.each([
    ['별로예요', 0.5, undefined],
    ['보통', 1, 2],
    ['좋아요', 2, undefined],
  ])('%s를 고르면 가중치 %f로 저장합니다', async (label, weight, initial) => {
    const upsert = mockUpsert();
    render(initial);
    fireEvent.click(screen.getByRole('radio', { name: label }));
    await vi.waitFor(() =>
      // 저장 키는 표시용 한글이 아니라 안정적인 기계값이어야 한다.
      expect(upsert).toHaveBeenCalledWith(
        { user_id: 'me', category: 'korean_restaurant', weight },
        { onConflict: 'user_id,category' },
      ),
    );
    expect(from).toHaveBeenCalledWith('category_prefs');
  });

  it('저장된 가중치가 있으면 해당 선택지가 선택된 상태로 보입니다', () => {
    mockUpsert();
    render(2);
    expect(screen.getByRole('radio', { name: '좋아요' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '보통' })).not.toBeChecked();
  });

  it('저장된 가중치가 없으면 보통이 기본 선택입니다', () => {
    mockUpsert();
    render();
    expect(screen.getByRole('radio', { name: '보통' })).toBeChecked();
  });

  it('저장에 실패하면 에러를 표시합니다', async () => {
    mockUpsert({ message: 'db error' });
    render();
    fireEvent.click(screen.getByRole('radio', { name: '좋아요' }));
    await screen.findByRole('alert');
  });

  it('선호 저장 중 컨트롤 영역에 공통 스피너를 한 번 보여줍니다', async () => {
    const upsert = vi.fn().mockReturnValue(new Promise(() => {}));
    from.mockImplementation(() => ({ upsert }));
    render();

    fireEvent.click(screen.getByRole('radio', { name: '좋아요' }));

    expect(await screen.findByRole('status')).toHaveTextContent('저장 중…');
    expect(screen.getAllByTestId('spinner')).toHaveLength(1);
    expect(screen.getByLabelText('카테고리 기호')).toHaveAttribute('aria-busy', 'true');
  });
});
