import { createRef, forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reset = vi.fn();

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: forwardRef<
    { reset(): void },
    {
      onSuccess(token: string): void;
      onExpire(): void;
      onError(): void;
    }
  >(function TurnstileDouble({ onSuccess, onExpire, onError }, ref) {
    useImperativeHandle(ref, () => ({ reset }));
    return (
      <>
        <button onClick={() => onSuccess('captcha-token')}>CAPTCHA 성공</button>
        <button onClick={onExpire}>CAPTCHA 만료</button>
        <button onClick={onError}>CAPTCHA 오류</button>
      </>
    );
  }),
}));

import AuthTurnstile, { type AuthTurnstileHandle } from './AuthTurnstile';

describe('AuthTurnstile', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    reset.mockReset();
  });

  it('검증 성공 토큰을 부모에게 전달합니다', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key';
    const onTokenChange = vi.fn();
    render(<AuthTurnstile onTokenChange={onTokenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'CAPTCHA 성공' }));

    expect(onTokenChange).toHaveBeenCalledWith('captcha-token');
  });

  it('만료와 오류 시 토큰을 비웁니다', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key';
    const onTokenChange = vi.fn();
    render(<AuthTurnstile onTokenChange={onTokenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'CAPTCHA 만료' }));
    fireEvent.click(screen.getByRole('button', { name: 'CAPTCHA 오류' }));

    expect(onTokenChange).toHaveBeenNthCalledWith(1, '');
    expect(onTokenChange).toHaveBeenNthCalledWith(2, '');
  });

  it('reset하면 위젯과 부모 토큰을 초기화합니다', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key';
    const onTokenChange = vi.fn();
    const ref = createRef<AuthTurnstileHandle>();
    render(<AuthTurnstile ref={ref} onTokenChange={onTokenChange} />);

    ref.current?.reset();

    expect(reset).toHaveBeenCalledOnce();
    expect(onTokenChange).toHaveBeenCalledWith('');
  });

  it('site key가 없으면 설정 오류를 표시합니다', () => {
    render(<AuthTurnstile onTokenChange={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('CAPTCHA 설정을 확인해 주세요.');
  });
});
