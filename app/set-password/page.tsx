'use client';
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from '../login/login.module.css';

export default function SetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setReady(true);
    });
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    const password = String(new FormData(e.currentTarget).get('password'));
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setMessage('비밀번호를 설정했습니다. 이제 로그인할 수 있습니다.');
    setLoading(false);
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
          <button className={styles.button} type="submit" disabled={loading} aria-busy={loading}>
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
