'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ensureSession, getCurrentUser } from '../lib/api';
import { errorMessage } from '../lib/messages';
import { supabase } from '../lib/supabaseClient';
import AuthTurnstile, { type AuthTurnstileHandle } from './AuthTurnstile';
import Spinner from './Spinner';
import styles from './AnonymousSessionGate.module.css';

export default function AnonymousSessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const turnstileRef = useRef<AuthTurnstileHandle>(null);
  const [ready, setReady] = useState(pathname === '/login');
  const [checkedPathname, setCheckedPathname] = useState(pathname);
  const [checking, setChecking] = useState(pathname !== '/login');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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
      <section className={styles.card} aria-busy="true">
        <h1 className={styles.title}>점심 추천</h1>
        <p className={styles.description}>안전한 이용을 위해 잠시만 기다려 주세요.</p>
        <p className={styles.status} role="status">
          <Spinner />
          보안 확인 중…
        </p>
        {!checking && <AuthTurnstile ref={turnstileRef} onTokenChange={createAnonymousSession} />}
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
