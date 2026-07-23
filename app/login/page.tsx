'use client';
import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './login.module.css';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const data = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(data.get('email')),
      password: String(data.get('password')),
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      document.cookie = 'sb-session=1; path=/; max-age=604800; samesite=lax';
      location.assign('/');
    }
  }

  async function requestSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRequestLoading(true);
    setRequestMessage('');
    setRequestError('');
    const data = new FormData(e.currentTarget);
    const { data: result, error } = await supabase.functions.invoke('signup-request', {
      body: { email: String(data.get('signup-email')) },
    });
    if (error) setRequestError(error.message);
    else setRequestMessage(result?.message ?? '승인되면 메일로 안내됩니다');
    setRequestLoading(false);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>점심 추천</h1>
        <p className={styles.subtitle}>오늘 뭐 먹을지, 로그인하고 추천받아 보세요</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field} htmlFor="email">
            이메일
            <input
              className={styles.input}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className={styles.field} htmlFor="password">
            비밀번호
            <input
              className={styles.input}
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className={styles.button} type="submit" disabled={loading} aria-busy={loading}>
            {loading ? '로그인 중…' : '로그인'}
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
        <hr className={styles.divider} />
        <h2 className={styles.sectionTitle}>회원가입 요청</h2>
        <form className={styles.form} onSubmit={requestSignup}>
          <label className={styles.field} htmlFor="signup-email">
            회원가입 요청 이메일
            <input
              className={styles.input}
              id="signup-email"
              name="signup-email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <button
            className={styles.button}
            type="submit"
            disabled={requestLoading}
            aria-busy={requestLoading}
          >
            {requestLoading ? '요청 중…' : '회원가입 요청'}
          </button>
          {requestMessage && <p role="status">{requestMessage}</p>}
          {requestError && (
            <p className={styles.error} role="alert">
              {requestError}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
