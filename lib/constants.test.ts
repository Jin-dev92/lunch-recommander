import { describe, expect, it } from 'vitest';
import { FOOD_CATEGORY, FOOD_CATEGORY_OPTIONS, kakaoMapSearchUrl } from './constants';

describe('kakaoMapSearchUrl', () => {
  it('장소명을 카카오맵 검색 URL로 만듭니다', () => {
    expect(kakaoMapSearchUrl('판교역')).toBe(
      'https://map.kakao.com/?q=%ED%8C%90%EA%B5%90%EC%97%AD',
    );
  });

  it('공백과 & 같은 문자를 인코딩해 쿼리를 깨뜨리지 않습니다', () => {
    expect(kakaoMapSearchUrl('김밥 & 라면')).toBe(
      'https://map.kakao.com/?q=%EA%B9%80%EB%B0%A5%20%26%20%EB%9D%BC%EB%A9%B4',
    );
  });
});

describe('FOOD_CATEGORY_OPTIONS', () => {
  it('기본값 전체를 첫 항목으로 노출합니다', () => {
    expect(FOOD_CATEGORY_OPTIONS[0]).toBe(FOOD_CATEGORY.ALL);
  });

  it('중복 없이 모든 카테고리를 담습니다', () => {
    expect(new Set(FOOD_CATEGORY_OPTIONS).size).toBe(FOOD_CATEGORY_OPTIONS.length);
  });
});
