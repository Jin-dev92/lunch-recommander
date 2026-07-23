'use client';
import { useForm } from 'react-hook-form';
import { ROUTES, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE_SECONDS } from '../../lib/constants';
import { useRequestSignup, useSignIn } from '../../lib/hooks/mutations';
import { errorMessage } from '../../lib/messages';
import type { SignInRequest, SignupRequest } from '../../lib/types/api';
import styles from './login.module.css';

export default function LoginPage() {
  const signInForm = useForm<SignInRequest>();
  const signupForm = useForm<SignupRequest>();
  const signIn = useSignIn();
  const requestSignup = useRequestSignup();

  // 쿠키 심기·화면 이동은 UI 후처리이므로 mutation hook이 아니라 소비 컴포넌트가 맡는다.
  const submit = signInForm.handleSubmit((values) =>
    signIn.mutate(values, {
      onSuccess: () => {
        document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
        location.assign(ROUTES.HOME);
      },
    }),
  );

  const submitSignupRequest = signupForm.handleSubmit((values) => requestSignup.mutate(values));

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
              type="email"
              autoComplete="email"
              required
              {...signInForm.register('email', { required: true })}
            />
          </label>
          <label className={styles.field} htmlFor="password">
            비밀번호
            <input
              className={styles.input}
              id="password"
              type="password"
              autoComplete="current-password"
              required
              {...signInForm.register('password', { required: true })}
            />
          </label>
          <button
            className={styles.button}
            type="submit"
            disabled={signIn.isPending}
            aria-busy={signIn.isPending}
          >
            {signIn.isPending ? '로그인 중…' : '로그인'}
          </button>
          {signIn.isError && (
            <p className={styles.error} role="alert">
              {errorMessage(signIn.error)}
            </p>
          )}
        </form>
        <hr className={styles.divider} />
        <h2 className={styles.sectionTitle}>회원가입 요청</h2>
        <form className={styles.form} onSubmit={submitSignupRequest}>
          <label className={styles.field} htmlFor="signup-email">
            회원가입 요청 이메일
            <input
              className={styles.input}
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              {...signupForm.register('email', { required: true })}
            />
          </label>
          <button
            className={styles.button}
            type="submit"
            disabled={requestSignup.isPending}
            aria-busy={requestSignup.isPending}
          >
            {requestSignup.isPending ? '요청 중…' : '회원가입 요청'}
          </button>
          {requestSignup.isSuccess && <p role="status">{requestSignup.data}</p>}
          {requestSignup.isError && (
            <p className={styles.error} role="alert">
              {errorMessage(requestSignup.error)}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
