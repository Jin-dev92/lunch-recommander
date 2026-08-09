import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));
import { supabase } from '../lib/supabaseClient';
import { renderWithQuery } from '../tests/renderWithQuery';
import FolderList from './FolderList';

const from = supabase.from as ReturnType<typeof vi.fn>;
const getUser = supabase.auth.getUser as ReturnType<typeof vi.fn>;

type Row = { id: string; name: string; owner_id: string; created_at: string };

function mockFolders(rows: Row[], options: { insert?: Row } = {}) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: options.insert ?? null, error: null }),
    }),
  });
  const deleteFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  from.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }),
    insert,
    delete: deleteFn,
  }));
  return { insert, deleteFn };
}

describe('폴더 목록', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
  });

  it('폴더 목록을 렌더합니다', async () => {
    mockFolders([{ id: 'f1', name: '회사 근처', owner_id: 'me', created_at: 't' }]);
    renderWithQuery(<FolderList selectedId={null} onSelect={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '회사 근처' })).toBeInTheDocument();
  });

  it('폴더를 생성하면 mutation을 호출합니다', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
    const { insert } = mockFolders([], {
      insert: { id: 'f2', name: '새 폴더', owner_id: 'me', created_at: 't' },
    });
    renderWithQuery(<FolderList selectedId={null} onSelect={vi.fn()} />);
    await screen.findByRole('status');

    fireEvent.change(screen.getByPlaceholderText('새 폴더 이름'), {
      target: { value: '새 폴더' },
    });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await vi.waitFor(() =>
      expect(insert).toHaveBeenCalledWith({ name: '새 폴더', owner_id: 'me' }),
    );
  });

  it('삭제는 확인 전에는 실행하지 않고, 취소하면 실행하지 않습니다', async () => {
    const { deleteFn } = mockFolders([
      { id: 'f1', name: '회사 근처', owner_id: 'me', created_at: 't' },
    ]);
    renderWithQuery(<FolderList selectedId={null} onSelect={vi.fn()} />);
    const item = (await screen.findByRole('button', { name: '회사 근처' })).closest('li')!;

    fireEvent.click(within(item).getByRole('button', { name: '삭제' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(deleteFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('삭제를 확인하면 mutation을 호출합니다', async () => {
    const { deleteFn } = mockFolders([
      { id: 'f1', name: '회사 근처', owner_id: 'me', created_at: 't' },
    ]);
    renderWithQuery(<FolderList selectedId={null} onSelect={vi.fn()} />);
    const item = (await screen.findByRole('button', { name: '회사 근처' })).closest('li')!;

    fireEvent.click(within(item).getByRole('button', { name: '삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));

    await vi.waitFor(() => expect(deleteFn).toHaveBeenCalled());
  });
});
