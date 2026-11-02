import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedPlace } from '../lib/types/api';
import type { MapCanvasProps } from './map/types';

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

// 지도 SDK 연결은 캔버스 쪽 테스트(components/map/*.test.tsx)가 검증한다.
// 여기서는 넘기는 마커·중심과 캔버스 콜백에 대한 반응만 본다.
let canvasProps: MapCanvasProps | null = null;
vi.mock('./map/MapCanvas', () => ({
  default: function MockMapCanvas(props: MapCanvasProps) {
    canvasProps = props;
    return <div data-testid="map-canvas" aria-hidden={props.ariaHidden} />;
  },
}));

import SavedPlacesMap from './SavedPlacesMap';

function renderPlacesMap(ui: ReactElement) {
  return render(ui);
}

beforeEach(() => {
  canvasProps = null;
  useSavedPlaces.mockReset();
  updateMemoMutate.mockReset();
  deleteMutate.mockReset();
  geocodeMutate.mockReset();
  addSavedPlaceMutate.mockReset();
});

const places: SavedPlace[] = [
  {
    id: 's1',
    folderId: 'f1',
    placeId: 'p1',
    name: '한식당',
    lat: 37.5,
    lng: 127.0,
    address: '서울 성북구 동소문로 20길 37',
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
    expect(screen.getByText('서울 성북구 동소문로 20길 37')).toBeInTheDocument();
    expect(screen.getByText('점심 맛집')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '메뉴·사진·리뷰 자세히 보기' })).toHaveAttribute(
      'href',
      'https://map.kakao.com/?q=%ED%95%9C%EC%8B%9D%EB%8B%B9',
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

    // 현재 지도 중심을 함께 보내 서버가 국내/해외 지오코딩 provider를 고르게 한다.
    expect(geocodeMutate).toHaveBeenCalledWith(
      { address: '판교역', near: { lat: 37.5, lng: 127.0 } },
      expect.anything(),
    );
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

  it('지도 로드에 실패하면 에러 메시지를 보여줍니다', async () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);

    canvasProps!.onError!();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('지도를 불러오지 못했습니다'),
    );
  });

  it('저장 맛집을 마커로 넘기고 첫 항목을 지도 중심으로 삼습니다', () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);

    expect(canvasProps!.center).toEqual({ lat: 37.5, lng: 127.0 });
    expect(canvasProps!.markers).toEqual([
      expect.objectContaining({ id: 's1', lat: 37.5, lng: 127.0, title: '한식당' }),
      expect.objectContaining({ id: 's2', lat: 37.6, lng: 127.1, title: '카페' }),
    ]);
    // 핀은 보조 시각화라 끌 수 없다(실제 상호작용은 목록이 담당한다).
    expect(canvasProps!.markers.every((marker) => !marker.draggable)).toBe(true);
  });

  it('핀을 누르면 그 항목의 상세가 열립니다', async () => {
    useSavedPlaces.mockReturnValue({ data: places, isLoading: false, isError: false });
    renderPlacesMap(<SavedPlacesMap folderId="f1" canEdit={true} />);

    canvasProps!.onMarkerClick!('s2');

    await waitFor(() => expect(screen.getByRole('heading', { name: '카페' })).toBeInTheDocument());
  });
});
