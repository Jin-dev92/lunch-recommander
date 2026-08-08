import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn(), auth: { getUser: vi.fn() } } }));
import { supabase } from '../supabaseClient';
import { addSavedPlace, listSavedPlaces } from './savedPlaces';

const from = supabase.from as ReturnType<typeof vi.fn>;
const getUser = supabase.auth.getUser as ReturnType<typeof vi.fn>;
beforeEach(() => {
  from.mockReset();
  getUser.mockReset();
});

describe('listSavedPlaces', () => {
  it('row를 도메인 형태로 매핑한다', async () => {
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'sp1',
                folder_id: 'f1',
                place_id: 'p1',
                name: '맛집',
                lat: 37.1,
                lng: 127.1,
                address: '주소',
                memo: null,
                created_at: 't',
              },
            ],
            error: null,
          }),
        }),
      }),
    });
    expect(await listSavedPlaces('f1')).toEqual([
      {
        id: 'sp1',
        folderId: 'f1',
        placeId: 'p1',
        name: '맛집',
        lat: 37.1,
        lng: 127.1,
        address: '주소',
        memo: null,
        createdAt: 't',
      },
    ]);
  });
});

describe('addSavedPlace', () => {
  const req = {
    folderId: 'f1',
    placeId: 'p1',
    name: '맛집',
    lat: 37.1,
    lng: 127.1,
    address: '주소',
  };

  it('로그인하지 않은 사용자는 에러를 던진다', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(addSavedPlace(req)).rejects.toThrow('로그인이 필요합니다.');
    expect(from).not.toHaveBeenCalled();
  });

  it('익명 사용자는 에러를 던진다', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'anon', is_anonymous: true } } });
    await expect(addSavedPlace(req)).rejects.toThrow('로그인이 필요합니다.');
    expect(from).not.toHaveBeenCalled();
  });

  it('폴더+가게 중복 시 조용히 흡수하도록 upsert에 onConflict/ignoreDuplicates를 전달한다', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    await expect(addSavedPlace(req)).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledWith(
      {
        folder_id: 'f1',
        place_id: 'p1',
        name: '맛집',
        lat: 37.1,
        lng: 127.1,
        address: '주소',
        memo: null,
        created_by: 'me',
      },
      { onConflict: 'folder_id,place_id', ignoreDuplicates: true },
    );
  });
});
