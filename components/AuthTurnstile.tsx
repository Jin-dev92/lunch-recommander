'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

export type AuthTurnstileHandle = {
  reset(): void;
};

type AuthTurnstileProps = {
  onTokenChange(token: string): void;
  /**
   * 위젯이 오류를 보고했을 때. 토큰만 비우면 소비 컴포넌트가 실패를 알 수 없어
   * 화면이 영영 로딩 상태로 남는다.
   */
  onFail?(): void;
};

const AuthTurnstile = forwardRef<AuthTurnstileHandle, AuthTurnstileProps>(function AuthTurnstile(
  { onTokenChange, onFail },
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
      // 만료는 정상 흐름이다(위젯이 스스로 다시 푼다). 오류만 실패로 올린다.
      onExpire={() => onTokenChange('')}
      onError={() => {
        onTokenChange('');
        onFail?.();
      }}
      options={{ size: 'flexible', theme: 'auto', appearance: 'interaction-only' }}
    />
  );
});

export default AuthTurnstile;
