'use client';
import { FormEvent } from 'react';
import Spinner from '../../components/Spinner';
import { ROUTES } from '../../lib/constants';
import { useUpdatePassword } from '../../lib/hooks/mutations';
import { useInviteSession } from '../../lib/hooks/queries';
import { errorMessage } from '../../lib/messages';
import styles from '../login/login.module.css';

export default function SetPasswordPage() {
  const inviteSession = useInviteSession();
  const passwordMutation = useUpdatePassword();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password'));
    passwordMutation.mutate(
      { password },
      {
        onSuccess: () => {
          // 초대 링크로 이미 실사용자 세션이 서 있으므로 재로그인 없이 바로 메인으로 보낸다.
          location.assign(ROUTES.HOME);
        },
      },
    );
  }

  if (inviteSession.isPending) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p>초대 정보를 확인하는 중입니다.</p>
        </div>
      </div>
    );
  }

  if (inviteSession.isError) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p className={styles.error} role="alert">
            초대 정보를 확인하지 못했습니다. 다시 시도해 주세요.
          </p>
        </div>
      </div>
    );
  }

  if (!inviteSession.data) {
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
            disabled={passwordMutation.isPending || passwordMutation.isSuccess}
            aria-busy={passwordMutation.isPending}
          >
            {passwordMutation.isPending ? (
              <>
                <Spinner />
                설정 중…
              </>
            ) : (
              '비밀번호 설정'
            )}
          </button>
          {passwordMutation.isSuccess && (
            <p role="status">비밀번호를 설정했습니다. 잠시 후 이동합니다.</p>
          )}
          {passwordMutation.error && (
            <p className={styles.error} role="alert">
              {errorMessage(passwordMutation.error)}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
