'use client';
import { FormEvent, useEffect, useState } from 'react';
import { ROUTES } from '../../lib/constants';
import { supabase } from '../../lib/supabaseClient';
import styles from '../login/login.module.css';
import Spinner from '../../components/Spinner';

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
        // 로그인이 optional이라 방문자에겐 익명 세션이 있을 수 있다. 익명 세션은 초대가 아니므로
        // 실사용자 세션(초대 링크가 세운다)일 때만 비밀번호 설정을 허용한다.
        const { data } = await supabase.auth.getSession();
        setHasSession(Boolean(data.session) && !data.session?.user.is_anonymous);
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
        // 초대 링크로 이미 실사용자 세션이 서 있으므로 다시 로그인시키지 않고 홈으로 보낸다.
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
            {loading ? (
              <>
                <Spinner />
                설정 중…
              </>
            ) : (
              '비밀번호 설정'
            )}
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
