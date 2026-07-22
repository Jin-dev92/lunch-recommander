'use client';
import { supabase } from '../lib/supabaseClient';
import { snoozedUntilOneWeekFrom } from '../lib/snooze';

export default function RatingControls({ placeId, userId }: { placeId: string; userId: string }) {
  async function save(score: number) {
    await supabase.from('ratings').upsert({ user_id: userId, place_id: placeId, score }, { onConflict: 'user_id,place_id' });
  }

  async function snooze() {
    const { data } = await supabase.from('ratings').select('score').eq('user_id', userId).eq('place_id', placeId).maybeSingle();
    await supabase.from('ratings').upsert(
      { user_id: userId, place_id: placeId, score: data?.score ?? 3, snoozed_until: snoozedUntilOneWeekFrom(new Date()) },
      { onConflict: 'user_id,place_id' }
    );
  }

  return (
    <section aria-label="개인 평점">
      {[0, 1, 2, 3, 4, 5].map((score) => (
        <button key={score} onClick={() => save(score)}>{score}점</button>
      ))}
      <button onClick={snooze}>1주간 그만 보기</button>
    </section>
  );
}
