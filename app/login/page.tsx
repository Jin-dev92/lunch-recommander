'use client';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import AuthTurnstile, { type AuthTurnstileHandle } from '../../components/AuthTurnstile';
import Spinner from '../../components/Spinner';
import { ROUTES } from '../../lib/constants';
import { useSignIn, useSignUp } from '../../lib/hooks/mutations';
import { errorMessage } from '../../lib/messages';
import styles from './login.module.css';

type SignInFormValues = {
  email: string;
  password: string;
};

type SignupFormValues = {
  email: string;
  password: string;
  passwordConfirm: string;
};

export default function LoginPage() {
  const signInForm = useForm<SignInFormValues>();
  const signupForm = useForm<SignupFormValues>();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const [signInCaptchaToken, setSignInCaptchaToken] = useState('');
  const [signupCaptchaToken, setSignupCaptchaToken] = useState('');
  const [signupOpen, setSignupOpen] = useState(false);
  const signInCaptcha = useRef<AuthTurnstileHandle>(null);
  const signupCaptcha = useRef<AuthTurnstileHandle>(null);
  // 네이티브 <dialog>를 쓰면 백드롭·포커스 트랩·Esc 닫기를 브라우저가 처리한다.
  const dialog = useRef<HTMLDialogElement>(null);

  // 화면 이동은 UI 후처리이므로 mutation hook이 아니라 소비 컴포넌트가 맡는다.
  // 로그인 성공 시 supabase-js가 실사용자 세션을 세우므로, 홈으로 보내면 로그인 상태로 뜬다.
  const submit = signInForm.handleSubmit((values) => {
    if (!signInCaptchaToken) return;
    signIn.mutate(
      { ...values, captchaToken: signInCaptchaToken },
      {
        onSuccess: () => location.assign(ROUTES.HOME),
        onSettled: () => signInCaptcha.current?.reset(),
      },
    );
  });

  const submitSignup = signupForm.handleSubmit((values) => {
    if (!signupCaptchaToken) return;
    signUp.mutate(
      {
        email: values.email,
        password: values.password,
        captchaToken: signupCaptchaToken,
        emailRedirectTo: `${location.origin}${ROUTES.HOME}`,
      },
      {
        onSettled: () => signupCaptcha.current?.reset(),
      },
    );
  });

  // 다시 열었을 때 이전 결과가 남아 있지 않도록 입력과 요청 상태를 함께 비운다.
  function openSignup() {
    signupForm.reset();
    signUp.reset();
    setSignupCaptchaToken('');
    signupCaptcha.current?.reset();
    setSignupOpen(true);
    dialog.current?.showModal();
  }

  function closeSignup() {
    dialog.current?.close();
    setSignupOpen(false);
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
          <div className={styles.captcha}>
            <AuthTurnstile ref={signInCaptcha} onTokenChange={setSignInCaptchaToken} />
          </div>
          <button
            className={styles.button}
            type="submit"
            disabled={signIn.isPending || !signInCaptchaToken}
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
          회원가입
        </button>
      </div>

      <dialog
        className={styles.dialog}
        ref={dialog}
        aria-labelledby="signup-title"
        onClose={() => setSignupOpen(false)}
      >
        <h2 className={styles.dialogTitle} id="signup-title">
          회원가입
        </h2>
        <p className={styles.dialogDescription}>
          이메일과 비밀번호를 입력한 뒤 전송된 인증 링크를 확인해 주세요.
        </p>
        <form className={styles.form} onSubmit={submitSignup}>
          <label className={styles.field} htmlFor="signup-email">
            회원가입 이메일
            <input
              className={styles.input}
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              {...signupForm.register('email', { required: true })}
            />
          </label>
          <label className={styles.field} htmlFor="signup-password">
            회원가입 비밀번호
            <input
              className={styles.input}
              id="signup-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              {...signupForm.register('password', { required: true, minLength: 8 })}
            />
          </label>
          <label className={styles.field} htmlFor="signup-password-confirm">
            비밀번호 확인
            <input
              className={styles.input}
              id="signup-password-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              {...signupForm.register('passwordConfirm', {
                required: true,
                validate: (value) =>
                  value === signupForm.getValues('password') || '비밀번호가 일치하지 않습니다.',
              })}
            />
          </label>
          {signupForm.formState.errors.passwordConfirm?.message && (
            <p className={styles.error} role="alert">
              {signupForm.formState.errors.passwordConfirm.message}
            </p>
          )}
          {signupOpen && (
            <div className={styles.captcha}>
              <AuthTurnstile ref={signupCaptcha} onTokenChange={setSignupCaptchaToken} />
            </div>
          )}
          <button
            className={styles.button}
            type="submit"
            disabled={signUp.isPending || !signupCaptchaToken}
            aria-busy={signUp.isPending}
          >
            {signUp.isPending ? (
              <>
                <Spinner />
                가입 중…
              </>
            ) : (
              '가입하기'
            )}
          </button>
          {signUp.isSuccess && (
            <p className={styles.notice} role="status">
              {signUp.data}
            </p>
          )}
          {signUp.isError && (
            <p className={styles.error} role="alert">
              {errorMessage(signUp.error)}
            </p>
          )}
        </form>
        <button className={styles.secondaryButton} type="button" onClick={closeSignup}>
          닫기
        </button>
      </dialog>
    </div>
  );
}
