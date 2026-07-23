import { assertEquals, assertNotEquals, assertMatch } from 'jsr:@std/assert';
import { generateApprovalToken } from './token.ts';

Deno.test('32바이트 토큰을 64자리 소문자 hex로 생성합니다', () => {
  const token = generateApprovalToken();
  assertEquals(token.length, 64);
  assertMatch(token, /^[0-9a-f]{64}$/);
});

Deno.test('호출마다 다른 토큰을 생성합니다', () => {
  assertNotEquals(generateApprovalToken(), generateApprovalToken());
});
