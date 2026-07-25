// @see supabase-js Auth: signInAnonymously / signInWithPassword / signUp / signOut / getUser

export type SignInRequest = {
  email: string;
  password: string;
  captchaToken: string;
};

export type SignupRequest = {
  email: string;
  password: string;
  captchaToken: string;
  emailRedirectTo: string;
};
