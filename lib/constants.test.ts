import { describe, expect, it } from 'vitest';
import { displayAddress } from './constants';

describe('displayAddress', () => {
  it('한국 주소는 맨 앞 국가명("대한민국")을 뗍니다', () => {
    expect(displayAddress('대한민국 서울특별시 성북구 동소문로 20길 37')).toBe(
      '서울특별시 성북구 동소문로 20길 37',
    );
  });

  it('일본 주소도 맨 앞 국가명을 뗍니다', () => {
    expect(displayAddress('日本 東京都 渋谷区')).toBe('東京都 渋谷区');
  });

  it('쉼표가 있는 서구식 주소는 국가가 맨 뒤라 그대로 둡니다', () => {
    expect(displayAddress('123 Main St, Springfield, IL 62704, USA')).toBe(
      '123 Main St, Springfield, IL 62704, USA',
    );
  });

  it('국가명이 없으면(짧은 첫 어절 아님) 그대로 둡니다', () => {
    // 첫 어절이 5자를 넘으면 국가명으로 보지 않는다.
    expect(displayAddress('서울특별시 성북구 동소문로')).toBe('서울특별시 성북구 동소문로');
  });

  it('null·빈 값은 빈 문자열로 처리합니다', () => {
    expect(displayAddress(null)).toBe('');
    expect(displayAddress('   ')).toBe('');
  });
});
