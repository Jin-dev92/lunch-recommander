'use client';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { ROUTES } from '../../lib/constants';
import { useRequestSignup, useSignIn } from '../../lib/hooks/mutations';
import { errorMessage } from '../../lib/messages';
import type { SignInRequest, SignupRequest } from '../../lib/types/api';
import styles from './login.module.css';
import Spinner from '../../components/Spinner';

export default function LoginPage() {
  const signInForm = useForm<SignInRequest>();
  const signupForm = useForm<SignupRequest>();
  const signIn = useSignIn();
  const requestSignup = useRequestSignup();
  // 네이티브 <dialog>를 쓰면 백드롭·포커스 트랩·Esc 닫기를 브라우저가 처리한다.
  const dialog = useRef<HTMLDialogElement>(null);

  // 화면 이동은 UI 후처리이므로 mutation hook이 아니라 소비 컴포넌트가 맡는다.
  // 로그인 성공 시 supabase-js가 실사용자 세션을 세우므로, 홈으로 보내면 로그인 상태로 뜬다.
  const submit = signInForm.handleSubmit((values) =>
    signIn.mutate(values, {
      onSuccess: () => location.assign(ROUTES.HOME),
    }),
  );

  const submitSignupRequest = signupForm.handleSubmit((values) => requestSignup.mutate(values));

  // 다시 열었을 때 이전 결과가 남아 있지 않도록 입력과 요청 상태를 함께 비운다.
  function openSignup() {
    signupForm.reset();
    requestSignup.reset();
    dialog.current?.showModal();
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
            {signIn.isPending ? (
              <>
                <Spinner />
                로그인 중…
              </>
            ) : (
              '로그인'
            )}
          </button>
          {signIn.isError && (
            <p className={styles.error} role="alert">
              {errorMessage(signIn.error)}
            </p>
          )}
        </form>

        <p className={styles.altText}>아직 계정이 없으신가요?</p>
        <button className={styles.secondaryButton} type="button" onClick={openSignup}>
          회원가입 요청
        </button>
      </div>

      <dialog className={styles.dialog} ref={dialog} aria-labelledby="signup-title">
        <h2 className={styles.dialogTitle} id="signup-title">
          회원가입 요청
        </h2>
        <p className={styles.dialogDescription}>
          이메일 주소를 남기면 관리자 승인 후 가입 안내를 보내드립니다.
        </p>
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
            {requestSignup.isPending ? (
              <>
                <Spinner />
                요청 중…
              </>
            ) : (
              '요청 보내기'
            )}
          </button>
          {requestSignup.isSuccess && (
            <p className={styles.notice} role="status">
              {requestSignup.data}
            </p>
          )}
          {requestSignup.isError && (
            <p className={styles.error} role="alert">
              {errorMessage(requestSignup.error)}
            </p>
          )}
        </form>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => dialog.current?.close()}
        >
          닫기
        </button>
      </dialog>
    </div>
  );
}
