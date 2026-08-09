import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Folder } from '../lib/types/api';

// useFolders/useAddSavedPlace를 직접 모킹해 다이얼로그 동작만 검증한다.
// 실제 supabase 호출은 각 훅 자체의 테스트가 이미 커버한다.
const useFolders = vi.fn();
const mutate = vi.fn();
vi.mock('../lib/hooks/queries', () => ({
  useFolders: (...args: unknown[]) => useFolders(...args),
}));
vi.mock('../lib/hooks/mutations', () => ({
  useAddSavedPlace: () => ({ mutate, isPending: false, isError: false }),
}));

import SaveToFolderButton from './SaveToFolderButton';

const place = {
  placeId: 'p1',
  name: '한식당',
  lat: 37.5,
  lng: 127.0,
  address: '대한민국 서울특별시 성북구',
};

const folders: Folder[] = [
  { id: 'f1', name: '회사 근처', ownerId: 'me', createdAt: 't' },
  { id: 'f2', name: '주말', ownerId: 'me', createdAt: 't' },
];

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: '폴더에 저장' }));
}

describe('폴더에 저장 버튼', () => {
  beforeEach(() => {
    useFolders.mockReset();
    mutate.mockReset();
  });

  it('폴더를 선택해 저장하면 스냅샷과 함께 mutate를 호출합니다', () => {
    useFolders.mockReturnValue({ data: folders });
    render(<SaveToFolderButton place={place} />);
    openDialog();

    fireEvent.click(screen.getByRole('radio', { name: '주말' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mutate).toHaveBeenCalledWith(
      {
        folderId: 'f2',
        placeId: 'p1',
        name: '한식당',
        lat: 37.5,
        lng: 127.0,
        address: '대한민국 서울특별시 성북구',
      },
      expect.anything(),
    );
  });

  it('저장에 성공하면 저장했어요를 보여줍니다', () => {
    useFolders.mockReturnValue({ data: folders });
    mutate.mockImplementation((_req, options) => options?.onSuccess?.());
    render(<SaveToFolderButton place={place} />);
    openDialog();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(screen.getByText('저장했어요')).toBeInTheDocument();
  });

  it('폴더가 없으면 폴더를 먼저 만들라는 안내와 폴더 관리 링크를 보여줍니다', () => {
    useFolders.mockReturnValue({ data: [] });
    render(<SaveToFolderButton place={place} />);
    openDialog();

    expect(screen.getByText('저장할 폴더가 없어요. 폴더를 먼저 만들어 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '폴더 관리' })).toHaveAttribute('href', '/places');
    expect(mutate).not.toHaveBeenCalled();
  });
});
