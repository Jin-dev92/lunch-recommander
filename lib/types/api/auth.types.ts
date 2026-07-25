// @see supabase-js Auth: signInWithPassword / signOut / getUser
// @see Edge Function 스펙: POST /functions/v1/signup-request (supabase/functions/signup-request/index.ts)

export type SignInRequest = {
  email: string;
  password: string;
};

export type SignupRequest = {
  email: string;
};

export type UpdatePasswordRequest = {
  password: string;
};

/**
 * 신규·중복·기존가입 어떤 경우든 동일한 문구를 돌려준다.
 * 응답이 갈리면 가입 여부를 알아낼 수 있기 때문이다(계정 존재 여부 열거 공격).
 */
export type SignupRequestResponse = {
  message: string;
};
