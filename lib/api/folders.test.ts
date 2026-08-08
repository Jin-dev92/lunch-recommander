import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn(), auth: { getUser: vi.fn() } } }));
import { supabase } from '../supabaseClient';
import { createFolder, deleteFolder, listFolders, renameFolder } from './folders';

const from = supabase.from as ReturnType<typeof vi.fn>;
const getUser = supabase.auth.getUser as ReturnType<typeof vi.fn>;
beforeEach(() => {
  from.mockReset();
  getUser.mockReset();
});

describe('listFolders', () => {
  it('row를 도메인 형태로 매핑한다', async () => {
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'f1', name: '내 맛집', owner_id: 'me', created_at: 't' }],
          error: null,
        }),
      }),
    });
    expect(await listFolders()).toEqual([
      { id: 'f1', name: '내 맛집', ownerId: 'me', createdAt: 't' },
    ]);
  });
});

describe('createFolder', () => {
  it('로그인하지 않은 사용자는 에러를 던진다', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(createFolder('새 폴더')).rejects.toThrow('로그인이 필요합니다.');
    expect(from).not.toHaveBeenCalled();
  });

  it('생성된 row를 도메인 형태로 매핑한다', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'f1', name: '새 폴더', owner_id: 'me', created_at: 't' },
          error: null,
        }),
      }),
    });
    from.mockReturnValue({ insert });
    expect(await createFolder('새 폴더')).toEqual({
      id: 'f1',
      name: '새 폴더',
      ownerId: 'me',
      createdAt: 't',
    });
    expect(insert).toHaveBeenCalledWith({ name: '새 폴더', owner_id: 'me' });
  });
});

describe('renameFolder', () => {
  it('에러 응답을 예외로 승격한다', async () => {
    from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: '실패' } }),
      }),
    });
    await expect(renameFolder('f1', '새 이름')).rejects.toThrow('실패');
  });
});

describe('deleteFolder', () => {
  it('정상 응답은 조용히 성공한다', async () => {
    from.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    await expect(deleteFolder('f1')).resolves.toBeUndefined();
  });
});
