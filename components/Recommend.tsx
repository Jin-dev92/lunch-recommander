'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { filterCandidates, pickWeightedRandom, scoreCandidate, type Candidate } from '../lib/recommend';
import { mergeCandidates } from '../lib/mergeCandidates';

type Location = { lat:number; lng:number; radius:500|1000 };
type Result = Candidate & { name:string; weight:number };

export default function Recommend({ location }: { location: Location | null }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  async function run() {
    if (!location) return;
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setError('로그인이 필요합니다.');
    const nearby = await supabase.functions.invoke('nearby', { body: location });
    if (nearby.error) return setError(nearby.error.message);
    const [ratings, prefs] = await Promise.all([
      supabase.from('ratings').select('user_id,place_id,score,snoozed_until'),
      supabase.from('category_prefs').select('category,weight'),
    ]);
    const merged = mergeCandidates(nearby.data.restaurants, ratings.data ?? [], prefs.data ?? [], user.id);
    // filterCandidates는 Task 4의 Candidate 타입으로 반환하므로 이름 필드를 다시 붙여둔다
    const filtered = filterCandidates(merged.candidates, new Date()) as (Candidate & { name:string })[];
    const candidates = filtered.map((candidate) => ({
      ...candidate,
      weight: scoreCandidate(candidate, { categoryWeights: merged.categoryWeights, maxDistanceMeters: location.radius }),
    }));
    const picked = pickWeightedRandom(candidates, Math.random);
    if (!picked) return setError('추천할 음식점이 없습니다.');
    setResult(picked);
  }

  return (
    <section>
      <button onClick={run} disabled={!location}>한 곳 추천</button>
      {result && (
        <article>
          <h2>{result.name}</h2>
          <p>{result.category} · {Math.round(result.distanceMeters)}m</p>
        </article>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
