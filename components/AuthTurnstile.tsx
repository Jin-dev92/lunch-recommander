'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

export type AuthTurnstileHandle = {
  reset(): void;
};

type AuthTurnstileProps = {
  onTokenChange(token: string): void;
};

const AuthTurnstile = forwardRef<AuthTurnstileHandle, AuthTurnstileProps>(function AuthTurnstile(
  { onTokenChange },
  ref,
) {
  const turnstileRef = useRef<TurnstileInstance>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useImperativeHandle(ref, () => ({
    reset() {
      turnstileRef.current?.reset();
      onTokenChange('');
    },
  }));

  if (!siteKey) {
    return <p role="alert">CAPTCHA 설정을 확인해 주세요.</p>;
  }

  return (
    <Turnstile
      ref={turnstileRef}
      siteKey={siteKey}
      onSuccess={onTokenChange}
      onExpire={() => onTokenChange('')}
      onError={() => onTokenChange('')}
      options={{ size: 'flexible', theme: 'auto', appearance: 'interaction-only' }}
    />
  );
});

export default AuthTurnstile;
