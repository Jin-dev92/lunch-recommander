'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from '../../login/login.module.css';

const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/approve-signup`;
const headers = {
  apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  'Content-Type': 'application/json',
};

type SignupRequest = {
  email: string;
  status: string;
};

export default function ApprovePage() {
  const token = useSearchParams().get('token') ?? '';
  const [request, setRequest] = useState<SignupRequest | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${functionUrl}?token=${encodeURIComponent(token)}`, {
          method: 'GET',
          headers,
        });
        const body = await response.json();
        if (!response.ok) setError(body.error);
        else setRequest(body);
      } catch {
        setError('요청 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function decide(action: 'approve' | 'reject') {
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ token, action }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error);
        return;
      }
      if (body.alreadyRegistered) setMessage('이미 가입된 사용자입니다.');
      else setMessage(action === 'approve' ? '승인 완료' : '거절 완료');
    } catch {
      setError('요청을 처리하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-labelledby="approve-title">
        <h1 className={styles.title} id="approve-title">
          회원가입 요청 검토
        </h1>
        {loading && <p className={styles.subtitle}>요청 정보를 확인하고 있습니다…</p>}
        {request && (
          <div className={styles.form}>
            <p>
              요청 이메일: <strong>{request.email}</strong>
            </p>
            <p>
              상태: <strong>{request.status}</strong>
            </p>
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
