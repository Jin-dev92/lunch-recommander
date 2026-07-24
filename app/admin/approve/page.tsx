'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import styles from '../../login/login.module.css';
import Spinner from '../../../components/Spinner';

type SignupRequest = {
  email: string;
  status: string;
};

function ApproveInner() {
  const token = useSearchParams().get('token') ?? '';
  const [request, setRequest] = useState<SignupRequest | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.functions.invoke<SignupRequest>('approve-signup', {
        body: { token, action: 'info' },
      });
      if (error) setError(error.message);
      else setRequest(data);
      setLoading(false);
    })();
  }, [token]);

  async function decide(action: 'approve' | 'reject') {
    setSubmitting(true);
    setError('');
    setMessage('');

    const { data, error } = await supabase.functions.invoke<{ alreadyRegistered?: boolean }>(
      'approve-signup',
      { body: { token, action } },
    );
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    setMessage(
      data?.alreadyRegistered
        ? '이미 가입된 사용자입니다.'
        : action === 'approve'
          ? '승인 완료'
          : '거절 완료',
    );
    setDone(true);
    setSubmitting(false);
  }

  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-labelledby="approve-title">
        <h1 className={styles.title} id="approve-title">
          회원가입 요청 검토
        </h1>
        {loading && (
          <p className={styles.loadingStatus} role="status">
            <Spinner />
            요청 정보를 확인하고 있습니다…
          </p>
        )}
        {request && (
          <div className={styles.form}>
            <p>
              요청 이메일: <strong>{request.email}</strong>
            </p>
            <p>
              상태: <strong>{request.status}</strong>
            </p>
            {!done && (
              <>
                {submitting && (
                  <p className={styles.loadingStatus} role="status">
                    <Spinner />
                    처리 중…
                  </p>
                )}
                <button
                  className={styles.button}
                  type="button"
                  disabled={submitting}
                  aria-busy={submitting}
                  onClick={() => void decide('approve')}
                >
                  승인
                </button>
                <button
                  className={styles.button}
                  type="button"
                  disabled={submitting}
                  aria-busy={submitting}
                  onClick={() => void decide('reject')}
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
            {error}
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
