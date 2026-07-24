'use client';
import { FormEvent, useEffect, useState } from 'react';
import { ROUTES, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_SECONDS } from '../../lib/constants';
import { supabase } from '../../lib/supabaseClient';
import styles from '../login/login.module.css';

export default function SetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setHasSession(Boolean(data.session));
      } catch {
        setSessionError('초대 정보를 확인하지 못했습니다. 다시 시도해 주세요.');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    const password = String(new FormData(e.currentTarget).get('password'));
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(error.message);
      else {
        setMessage('비밀번호를 설정했습니다. 잠시 후 이동합니다.');
        setSuccess(true);
        // 초대 링크로 이미 세션이 서 있으므로 다시 로그인시키지 않는다. 미들웨어가 확인하는
        // 마커 쿠키만 심어 주고 메인으로 보낸다(로그인 화면과 동일한 방식).
        document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
        location.assign(ROUTES.HOME);
      }
    } catch {
      setError('비밀번호 설정 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p>초대 정보를 확인하는 중입니다.</p>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p className={styles.error} role="alert">
            {sessionError}
          </p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p className={styles.error} role="alert">
            유효한 초대 링크로 접속해 주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>비밀번호 설정</h1>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field} htmlFor="password">
            새 비밀번호
            <input
              className={styles.input}
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button
            className={styles.button}
            type="submit"
            disabled={loading || success}
            aria-busy={loading}
          >
            {loading ? '설정 중…' : '비밀번호 설정'}
          </button>
          {message && <p role="status">{message}</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
