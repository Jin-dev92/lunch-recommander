import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedPlace } from '../lib/types/api';

// useSavedPlaces/useUpdateSavedPlaceMemo/useDeleteSavedPlace를 직접 모킹해 지도 SDK 로딩과
// 데이터 로딩을 분리한다. 실제 supabase 호출은 각 훅 자체의 테스트가 이미 커버한다.
const useSavedPlaces = vi.fn();
const updateMemoMutate = vi.fn();
const deleteMutate = vi.fn();
const geocodeMutate = vi.fn();
const addSavedPlaceMutate = vi.fn();
vi.mock('../lib/hooks/queries', () => ({
  useSavedPlaces: (...args: unknown[]) => useSavedPlaces(...args),
}));
vi.mock('../lib/hooks/mutations', () => ({
  useUpdateSavedPlaceMemo: () => ({ mutate: updateMemoMutate, isPending: false, isError: false }),
  useDeleteSavedPlace: () => ({ mutate: deleteMutate, isPending: false, isError: false }),
  useGeocode: () => ({ mutate: geocodeMutate, isPending: false, isError: false, error: null }),
  useAddSavedPlace: () => ({
    mutate: addSavedPlaceMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

// next/script와 전역 google 객체 모킹은 components/Map.test.tsx와 동일한 방식을 따른다.
let scriptShouldFail = false;
vi.mock('next/script', () => ({
  default: function MockScript({
    onReady,
    onError,
  }: {
    onReady?: () => void;
    onError?: () => void;
  }) {
    useEffect(() => {
      if (scriptShouldFail) onError?.();
      else onReady?.();
    }, [onReady, onError]);
    return null;
  },
}));

import SavedPlacesMap from './SavedPlacesMap';

const mapMock = vi.fn();
const markerMock = vi.fn();
const setCenter = vi.fn();
const setMap = vi.fn();

function renderPlacesMap(ui: ReactElement) {
  return render(ui);
}

beforeEach(() => {
  scriptShouldFail = false;
  useSavedPlaces.mockReset();
  updateMemoMutate.mockReset();
  deleteMutate.mockReset();
  geocodeMutate.mockReset();
  addSavedPlaceMutate.mockReset();
  mapMock.mockReset();
  markerMock.mockReset();
  setCenter.mockReset();
  setMap.mockReset();
  mapMock.mockImplementation(() => ({ setCenter }));
  markerMock.mockImplementation(() => ({ addListener: vi.fn(), setMap }));
  (globalThis as unknown as { google: typeof google }).google = {
    maps: {
      importLibrary: vi.fn(async (name: string) => {
        if (name === 'maps') return { Map: mapMock };
        if (name === 'marker') return { Marker: markerMock };
        throw new Error(`요청하지 않은 라이브러리: ${name}`);
      }),
    },
  } as unknown as typeof google;
});

const places: SavedPlace[] = [
  {
    id: 's1',
    folderId: 'f1',
    placeId: 'p1',
    name: '한식당',
    lat: 37.5,
    lng: 127.0,
    address: '대한민국 서울특별시 성북구',
    memo: '점심 맛집',
    createdAt: 't',
  },
  {
    id: 's2',
    folderId: 'f1',
    placeId: 'p2',
    name: '카페',
    lat: 37.6,
    lng: 127.1,
    address: null,
    memo: null,
    createdAt: 't',
  },
];

describe('저장 맛집 지도', () => {
  it('저장 맛집 이름을 목록으로 보여줍니다', () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);
    expect(screen.getByRole('button', { name: '한식당' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카페' })).toBeInTheDocument();
  });

  it('항목을 선택하면 상세(주소·메모·지도 링크)를 보여줍니다', () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);

    fireEvent.click(screen.getByRole('button', { name: '한식당' }));

    expect(screen.getByRole('heading', { name: '한식당' })).toBeInTheDocument();
    expect(screen.getByText('서울특별시 성북구')).toBeInTheDocument();
    expect(screen.getByText('점심 맛집')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '메뉴·리뷰 자세히 보기' })).toHaveAttribute(
      'href',
      expect.stringContaining('query_place_id=p1'),
    );
  });

  it('canEdit=false면 메모 수정·삭제 버튼이 없습니다', () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={false} />);

    fireEvent.click(screen.getByRole('button', { name: '한식당' }));

    expect(screen.getByText('점심 맛집')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('canEdit=true면 메모를 수정하고 저장할 수 있습니다', () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);

    fireEvent.click(screen.getByRole('button', { name: '한식당' }));
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '수정된 메모' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(updateMemoMutate).toHaveBeenCalledWith({ id: 's1', memo: '수정된 메모' });
  });

  it('삭제는 확인 대화상자를 거친 뒤에만 실행됩니다', () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);

    fireEvent.click(screen.getByRole('button', { name: '한식당' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
    expect(deleteMutate).toHaveBeenCalledWith('s1', expect.anything());
  });

  it('폴더가 없으면 안내 문구를 보여줍니다', () => {
    useSavedPlaces.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId={null} canEdit={true} />);
    expect(
      screen.getByText('폴더를 선택하면 저장한 음식점을 지도에서 볼 수 있어요.'),
    ).toBeInTheDocument();
  });

  it('빈 폴더면 안내 문구를 보여줍니다', () => {
    useSavedPlaces.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);
    expect(screen.getByText('이 폴더에 저장한 음식점이 아직 없어요.')).toBeInTheDocument();
  });

  it('검색으로 장소를 찾아 현재 폴더에 추가합니다', () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    geocodeMutate.mockImplementation(
      (_query: string, opts?: { onSuccess?: (coords: { lat: number; lng: number }) => void }) => {
        opts?.onSuccess?.({ lat: 37.123456789, lng: 127.987654321 });
      },
    );
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);

    fireEvent.change(screen.getByLabelText('장소 검색'), { target: { value: '판교역' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(geocodeMutate).toHaveBeenCalledWith('판교역', expect.anything());
    expect(addSavedPlaceMutate).toHaveBeenCalledWith(
      {
        folderId: 'f1',
        placeId: 'manual:37.123457,127.987654',
        name: '판교역',
        lat: 37.123456789,
        lng: 127.987654321,
        address: null,
      },
      expect.anything(),
    );
  });

  it('폴더가 없으면 검색 폼을 보여주지 않습니다', () => {
    useSavedPlaces.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId={null} canEdit={true} />);
    expect(screen.queryByLabelText('장소 검색')).not.toBeInTheDocument();
  });

  it('지도 스크립트 로드에 실패하면 에러 메시지를 보여줍니다', () => {
    scriptShouldFail = true;
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);
    expect(screen.getByRole('alert')).toHaveTextContent('지도를 불러오지 못했습니다');
  });
});
