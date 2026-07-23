import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));
import { supabase } from '../lib/supabaseClient';
import CategoryPrefs from './CategoryPrefs';

const from = supabase.from as ReturnType<typeof vi.fn>;

describe('카테고리 기호 저장', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('입력값에서 포커스가 벗어나면 해당 카테고리의 weight가 upsert됩니다', () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    from.mockImplementation(() => ({ upsert }));
    render(<CategoryPrefs userId="me" categories={['한식']} />);
    const input = screen.getByLabelText('한식');
    fireEvent.change(input, { target: { value: '1.5' } });
    fireEvent.blur(input);
    expect(from).toHaveBeenCalledWith('category_prefs');
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'me', category: '한식', weight: 1.5 },
      { onConflict: 'user_id,category' },
    );
  });

  it('저장된 weight가 있으면 초기값으로 표시합니다', () => {
    render(<CategoryPrefs userId="me" categories={['한식']} currentWeights={{ 한식: 2.5 }} />);
    expect(screen.getByLabelText('한식')).toHaveValue(2.5);
  });

  it('저장된 weight가 없으면 기본값 1을 표시합니다', () => {
    render(<CategoryPrefs userId="me" categories={['한식']} />);
    expect(screen.getByLabelText('한식')).toHaveValue(1);
  });

  it('값 변경 없이 blur해도 저장된 weight가 그대로 유지됩니다', () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    from.mockImplementation(() => ({ upsert }));
    render(<CategoryPrefs userId="me" categories={['한식']} currentWeights={{ 한식: 2.5 }} />);
    const input = screen.getByLabelText('한식');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'me', category: '한식', weight: 2.5 },
      { onConflict: 'user_id,category' },
    );
  });
});
