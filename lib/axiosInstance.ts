import axios from 'axios';
import { supabase } from './supabaseClient';

// Supabase Edge Functions 전용 HTTP 클라이언트.
// DB 질의와 인증은 supabase-js SDK가 담당하고(RLS·토큰 갱신을 SDK가 처리한다),
// 우리가 직접 만든 HTTP 엔드포인트인 Edge Function 호출만 이 인스턴스를 지난다.
export const axiosInstance = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`,
  headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
});

// Edge Function은 Authorization 헤더의 JWT로 사용자를 식별한다(nearby/index.ts).
// 토큰은 세션 갱신마다 바뀌므로 캐싱하지 않고 요청 직전에 매번 읽는다.
axiosInstance.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session) config.headers.Authorization = `Bearer ${data.session.access_token}`;
  return config;
});

// Edge Function은 실패 시 { error: '문구' }를 돌려준다(401/429/400/502).
// 화면이 곧바로 쓸 수 있도록 그 문구를 Error.message로 승격시킨다.
axiosInstance.interceptors.response.use(undefined, (error: unknown) => {
  const message = axios.isAxiosError<{ error?: string }>(error)
    ? error.response?.data?.error
    : undefined;
  return Promise.reject(message ? new Error(message) : error);
});
