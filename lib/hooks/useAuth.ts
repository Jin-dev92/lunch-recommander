'use client';
import { useEffect, useState } from 'react';
import { getCurrentUser, type CurrentUser } from '../api';
import { supabase } from '../supabaseClient';

type AuthState = {
  /** 첫 세션 확인이 끝났는지. 끝나기 전에는 로그인 여부를 단정하지 않는다. */
  ready: boolean;
  /** 실제 계정으로 로그인한 상태(익명 세션은 false). 평가 가능 여부의 기준이다. */
  isLoggedIn: boolean;
};

/**
 * 현재 사용자와 이후 세션 변화를 반영한다. 익명 세션 발급은 CAPTCHA 토큰을 가진
 * AnonymousSessionGate가 담당하고, 익명 사용자는 "로그인 안 함"으로 취급한다.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUser().then((current) => {
      if (!active) return;
      setUser(current);
      setReady(true);
    });

    // 로그인·로그아웃 시 헤더와 평가 UI가 즉시 갱신되도록 세션 변화를 구독한다.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(
        session?.user
          ? { id: session.user.id, isAnonymous: Boolean(session.user.is_anonymous) }
          : null,
      );
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { ready, isLoggedIn: user !== null && !user.isAnonymous };
}
