'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

export default function GroupsPage() {
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name'));
    setInvite('');
    setMessage('');
    setError('');
    const { data, error: createError } = await supabase.rpc('create_group', { group_name: name });
    if (createError) {
      setError(createError.message);
    } else {
      setInvite(data[0].invite_code);
    }
  }

  async function join(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).trim();
    setMessage('');
    setError('');
    const { error: joinError } = await supabase.rpc('join_group_by_code', { code });
    if (joinError) {
      setError(joinError.message);
    } else {
      setMessage('그룹에 가입했습니다.');
    }
  }

  return (
    <main>
      <Link href="/">추천 화면으로</Link>
      <form onSubmit={create}>
        <label>
          그룹 이름
          <input name="name" required />
        </label>
        <button>그룹 생성</button>
      </form>
      {invite && <output>초대코드: {invite}</output>}
      <form onSubmit={join}>
        <label>
          초대코드
          <input name="code" required />
        </label>
        <button>그룹 가입</button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
