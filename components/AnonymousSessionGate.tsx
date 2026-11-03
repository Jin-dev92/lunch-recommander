'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ensureSession, getCurrentUser } from '../lib/api';
import { errorMessage, MESSAGES } from '../lib/messages';
import { supabase } from '../lib/supabaseClient';
import AuthTurnstile, { type AuthTurnstileHandle } from './AuthTurnstile';
import Spinner from './Spinner';
import styles from './AnonymousSessionGate.module.css';

/**
 * Turnstile이 토큰도 오류도 주지 않고 멈추는 경우가 있다. 사이트 키가 현재 도메인을 허용하지
 * 않으면 위젯이 렌더되지 않고 콜백도 오지 않아, 화면에는 스피너만 영영 도는 상태가 된다.
 * 이 시간이 지나면 실패로 보고 사용자가 상황을 알 수 있게 한다.
 */
const CAPTCHA_TIMEOUT_MS = 15000;

export default function AnonymousSessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const turnstileRef = useRef<AuthTurnstileHandle>(null);
  const [ready, setReady] = useState(pathname === '/login');
  const [checkedPathname, setCheckedPathname] = useState(pathname);
  const [checking, setChecking] = useState(pathname !== '/login');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // 다시 시도를 누르면 값이 바뀌어 아래 타임아웃 effect가 새로 걸린다.
  const [captchaAttempt, setCaptchaAttempt] = useState(0);

  useEffect(() => {
    if (pathname === '/login') {
      setReady(true);
      setChecking(false);
      setCheckedPathname(pathname);
      return;
    }

    let active = true;
    setChecking(true);
    getCurrentUser()
      .then((user) => {
        if (!active) return;
        setReady(Boolean(user));
        setCheckedPathname(pathname);
        setChecking(false);
      })
      .catch((cause) => {
        if (!active) return;
        setError(errorMessage(cause));
        setChecking(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setReady(Boolean(session));
      setCheckedPathname(pathname);
      if (!session) setCreating(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname]);

  // 세션 확인이 끝났고 아직 통과하지 못한 동안에만 감시한다. 세션 생성 중(creating)이거나
  // 이미 실패를 띄운 뒤에는 걸지 않는다.
  useEffect(() => {
    if (checking || ready || creating || error) return;
    const timer = window.setTimeout(() => setError(MESSAGES.CAPTCHA_TIMEOUT), CAPTCHA_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [checking, ready, creating, error, captchaAttempt]);

  async function createAnonymousSession(token: string) {
    if (!token || creating) return;
    setCreating(true);
    setError('');
    try {
      await ensureSession(token);
      setReady(true);
      setCheckedPathname(pathname);
    } catch (cause) {
      setError(errorMessage(cause));
      turnstileRef.current?.reset();
    } finally {
      setCreating(false);
    }
  }

  if (pathname === '/login' || (ready && checkedPathname === pathname)) return children;

  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-busy={!error}>
        <h1 className={styles.title}>{MESSAGES.APP_NAME}</h1>
        <p className={styles.description}>안전한 이용을 위해 잠시만 기다려 주세요.</p>
        {/* 실패를 띄운 뒤에도 스피너를 같이 보여주면 아직 진행 중인 것처럼 읽힌다. */}
        {!error && (
          <p className={styles.status} role="status">
            <Spinner />
            보안 확인 중…
          </p>
        )}
        {!checking && (
          <AuthTurnstile
            ref={turnstileRef}
            onTokenChange={createAnonymousSession}
            onFail={() => setError(MESSAGES.CAPTCHA_FAILED)}
          />
        )}
        {error && (
          <>
            <p className={styles.error} role="alert">
              {error}
            </p>
            <button
              className={styles.button}
              type="button"
              onClick={() => {
                setError('');
                setCaptchaAttempt((attempt) => attempt + 1);
                turnstileRef.current?.reset();
              }}
            >
              다시 시도
            </button>
          </>
        )}
      </section>
    </main>
  );
}
