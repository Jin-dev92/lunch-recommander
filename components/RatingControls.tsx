'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { snoozedUntilOneWeekFrom } from '../lib/snooze';

export default function RatingControls({ placeId, userId }: { placeId: string; userId: string }) {
  const [error, setError] = useState('');

  async function save(score: number) {
    setError('');
    const { error: saveError } = await supabase
      .from('ratings')
      .upsert({ user_id: userId, place_id: placeId, score }, { onConflict: 'user_id,place_id' });
    if (saveError) setError('평점 저장에 실패했습니다.');
  }

  async function snooze() {
    setError('');
    const { data, error: lookupError } = await supabase
      .from('ratings')
      .select('score')
      .eq('user_id', userId)
      .eq('place_id', placeId)
      .maybeSingle();
    if (lookupError) return setError('스누즈 처리에 실패했습니다.');
    const { error: saveError } = await supabase.from('ratings').upsert(
      { user_id: userId, place_id: placeId, score: data?.score ?? 3, snoozed_until: snoozedUntilOneWeekFrom(new Date()) },
      { onConflict: 'user_id,place_id' }
    );
    if (saveError) setError('스누즈 처리에 실패했습니다.');
  }

  return (
    <section aria-label="개인 평점">
      {[0, 1, 2, 3, 4, 5].map((score) => (
        <button key={score} onClick={() => save(score)}>{score}점</button>
      ))}
      <button onClick={snooze}>1주간 그만 보기</button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
