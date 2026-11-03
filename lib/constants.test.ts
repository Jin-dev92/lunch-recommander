import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES, kakaoMapSearchUrl } from './constants';

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

describe('ALL_CATEGORIES', () => {
  it('"좁히지 않음" 센티넬로 쓸 문구를 제공합니다', () => {
    // 나머지 선택지는 검색 결과에서 나오므로 상수는 이 하나뿐이다.
    expect(ALL_CATEGORIES).toBe('전체');
  });
});
