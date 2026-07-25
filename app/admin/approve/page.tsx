'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Spinner from '../../../components/Spinner';
import { useDecideSignupApproval } from '../../../lib/hooks/mutations';
import { useSignupApproval } from '../../../lib/hooks/queries';
import { errorMessage } from '../../../lib/messages';
import type { SignupApprovalAction } from '../../../lib/types/api';
import styles from '../../login/login.module.css';

function ApproveInner() {
  const token = useSearchParams().get('token') ?? '';
  const approval = useSignupApproval(token);
  const decision = useDecideSignupApproval();

  function decide(action: SignupApprovalAction) {
    decision.mutate({ token, action });
  }

  const message = decision.data?.alreadyRegistered
    ? '이미 가입된 사용자입니다.'
    : decision.isSuccess
      ? decision.variables.action === 'approve'
        ? '승인 완료'
        : '거절 완료'
      : '';
  const error = decision.error ?? approval.error;

  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-labelledby="approve-title">
        <h1 className={styles.title} id="approve-title">
          회원가입 요청 검토
        </h1>
        {approval.isPending && (
          <p className={styles.loadingStatus} role="status">
            <Spinner />
            요청 정보를 확인하고 있습니다…
          </p>
        )}
        {approval.data && (
          <div className={styles.form}>
            <p>
              요청 이메일: <strong>{approval.data.email}</strong>
            </p>
            <p>
              상태: <strong>{approval.data.status}</strong>
            </p>
            {!decision.isSuccess && (
              <>
                {decision.isPending && (
                  <p className={styles.loadingStatus} role="status">
                    <Spinner />
                    처리 중…
                  </p>
                )}
                <button
                  className={styles.button}
                  type="button"
                  disabled={decision.isPending}
                  aria-busy={decision.isPending}
                  onClick={() => decide('approve')}
                >
                  승인
                </button>
                <button
                  className={styles.button}
                  type="button"
                  disabled={decision.isPending}
                  aria-busy={decision.isPending}
                  onClick={() => decide('reject')}
                >
                  거절
                </button>
              </>
            )}
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <p className={styles.error} role="alert">
            {errorMessage(error)}
          </p>
        )}
      </section>
    </main>
  );
}

export default function ApprovePage() {
  return (
    <Suspense fallback={null}>
      <ApproveInner />
    </Suspense>
  );
}
