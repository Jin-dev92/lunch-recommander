'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function CategoryPrefs({ userId, categories }: { userId: string; categories: string[] }) {
  const [error, setError] = useState('');

  async function save(category: string, weight: number) {
    setError('');
    const { error: saveError } = await supabase
      .from('category_prefs')
      .upsert({ user_id: userId, category, weight }, { onConflict: 'user_id,category' });
    if (saveError) setError('기호 저장에 실패했습니다.');
  }

  return (
    <section aria-label="카테고리 기호">
      {categories.map((category) => (
        <label key={category}>
          {category}
          <input
            type="number"
            min="0.1"
            max="3"
            step="0.1"
            defaultValue="1"
            onBlur={(event) => save(category, Number(event.currentTarget.value))}
          />
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
