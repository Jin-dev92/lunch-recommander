'use client';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { geocodeAddress } from '../../api';
import type { GeocodeResponse } from '../../types/api';

/**
 * 주소를 좌표로 변환한다. 검색 결과(좌표)로 지도 위치를 옮기는 후처리는 소비 컴포넌트가
 * onSuccess에서 처리한다. 조회가 아니라 사용자 행동으로 1회 호출하므로 mutation으로 둔다.
 */
export const useGeocode = (options?: UseMutationOptions<GeocodeResponse, Error, string>) =>
  useMutation({
    mutationFn: (address: string) => geocodeAddress(address),
    ...options,
  });
