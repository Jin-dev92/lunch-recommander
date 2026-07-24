import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// ponytail: vitest globals:false라 RTL 자동 cleanup이 안 붙는다 → 렌더 누적으로 "여러 개 찾음" 에러 방지
afterEach(() => cleanup());

// jsdom 26은 <dialog>의 showModal/close를 구현하지 않는다(open 속성과 UA 스타일은 지원).
// 실제 브라우저는 네이티브 동작(백드롭·포커스 트랩·Esc 닫기)을 쓰고, 테스트에서는 열림/닫힘만
// 재현하면 충분하므로 open 토글로 최소한만 채운다.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
