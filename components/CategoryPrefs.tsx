'use client';
import { supabase } from '../lib/supabaseClient';

export default function CategoryPrefs({ userId, categories }: { userId: string; categories: string[] }) {
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
            onBlur={(event) =>
              supabase.from('category_prefs').upsert(
                { user_id: userId, category, weight: Number(event.currentTarget.value) },
                { onConflict: 'user_id,category' }
              )
            }
          />
        </label>
      ))}
    </section>
  );
}
