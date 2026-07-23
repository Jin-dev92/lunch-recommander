'use client';
import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './login.module.css';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>점심 추천</h1>
        <p className={styles.subtitle}>오늘 뭐 먹을지, 로그인하고 추천받아 보세요</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field} htmlFor="email">
            이메일
            <input className={styles.input} id="email" name="email" type="email" autoComplete="email" required />
          </label>
          <label className={styles.field} htmlFor="password">
            비밀번호
            <input className={styles.input} id="password" name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className={styles.button} type="submit" disabled={loading} aria-busy={loading}>
            {loading ? '로그인 중…' : '로그인'}
          </button>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
      </div>
    </div>
  );
}
