'use client';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      document.cookie = 'sb-session=; path=/; max-age=0';
      location.assign('/login');
    }
  }
  return (
    <main>
      <h1>점심 추천</h1>
      <button onClick={logout}>로그아웃</button>
    </main>
  );
}
