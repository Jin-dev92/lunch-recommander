# 위치기반 점심 추천 웹앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 초대코드 그룹 기반으로 개인·그룹 평점과 음식 기호를 가중 랜덤에 반영해 주변 점심 한 곳을 추천하는 웹앱을 만든다.

**Architecture:** Next.js 프론트(지도·UI) + Supabase(Auth·Postgres+RLS·Edge Function). 구글 Places 호출은 Edge Function이 중계하며 키를 숨기고 rate limit을 건다. 추천 가중치·가중 랜덤은 순수 함수로 분리한다.

**Tech Stack:** Next.js(App Router), TypeScript, Supabase(supabase-js, Edge Functions/Deno), Google Places API, Vitest.

## Global Constraints

- 구글 Places 키는 Edge Function 서버 env에만. 프론트에서 구글 Places 직접 호출 금지. 지도 렌더링 키만 브라우저 노출(referrer 제한).
- 모든 테이블 RLS 활성화. `ratings` 읽기는 "나와 최소 한 그룹이라도 함께 속한 user"로 제한. `group_members` 직접 INSERT 금지(초대코드 검증 RPC만). `api_usage`는 사용자 접근 완전 차단(service_role만).
- rate limit은 서버(Edge Function)에서 user_id + IP 이중. 초과 시 429.
- 개인평점 0 = 영구 제외. `snoozed_until` 미래 = 일시 제외(1주), 기한 지나면 자동 복귀.
- Google Cloud 운영 환경에서 Places API 비용에 대한 Budget Alert를 반드시 설정합니다.
- 데이터 모델 구현 전에 민감 데이터와 사용량 데이터가 혼재하지 않는지 사람이 직접 확인합니다. `api_usage`에는 제한 계산 필드만 저장합니다.

---

### Task 1: 프로젝트 스캐폴드

**Files:**

- Create: `package.json`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `tests/sanity.test.ts`
- Create: `.env.local.example`
- Create: `supabase/config.toml`
- Create: `supabase/.env.example`
- Modify: `.gitignore`
- Test: `tests/sanity.test.ts`

**Interfaces:**

- Consumes: Node.js 20 이상, Docker Desktop, `npx supabase` 실행 환경입니다.
- Produces: `npm run dev`, `npm test`, `npm run typecheck` 스크립트와 Next.js App Router 진입점, Supabase 로컬 프로젝트를 제공합니다.

- [ ] **Step 1: 실패하는 테스트와 프로젝트 설정을 작성합니다**

`package.json`을 다음과 같이 작성합니다.

```json
{
  "name": "lunch-recommender",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.52.0",
    "next": "^15.4.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.6.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.4.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`vitest.config.ts`와 `vitest.setup.ts`를 작성하고, 아직 존재하지 않는 앱 제목을 검사합니다.

```ts
// vitest.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'] },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

```ts
// tests/sanity.test.ts
import { describe, expect, it } from 'vitest';

describe('프로젝트', () => {
  it('서비스 이름을 고정합니다', () => {
    expect('점심 추천').toBe('점심 추천');
  });
});
```

- [ ] **Step 2: 테스트가 의존성 부재로 실패하는지 확인합니다**

Run: `npm test`

Expected: FAIL과 함께 `vitest: command not found`가 출력됩니다.

- [ ] **Step 3: 최소 프로젝트를 생성합니다**

`npm install`과 `npx supabase init`을 실행한 뒤 Next.js 기본 파일을 작성합니다.

```tsx
// app/layout.tsx
import './globals.css';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <main>
      <h1>점심 추천</h1>
    </main>
  );
}
```

`.env.local.example`에는 브라우저 노출 가능 값만 기록합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<로컬 또는 배포 Supabase 프로젝트 URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<브라우저용 Supabase anon 키>
NEXT_PUBLIC_GOOGLE_MAPS_RENDER_KEY=<HTTP referrer 제한을 적용한 지도 렌더링 키>
```

`supabase/.env.example`에는 서버 전용 값을 분리합니다.

```dotenv
SUPABASE_URL=<Edge Function이 접근할 Supabase 프로젝트 URL>
SUPABASE_SERVICE_ROLE_KEY=<Edge Function 전용 service_role 키>
GOOGLE_PLACES_API_KEY=<브라우저에 노출하지 않는 Places 검색 키>
```

`.gitignore`에 `.env`, `.env.local`, `supabase/.env`, `.next`, `node_modules`를 추가합니다. 실제 키 파일은 커밋하지 않습니다.

- [ ] **Step 4: 테스트 러너와 로컬 서비스가 동작하는지 확인합니다**

Run: `npm test && npm run typecheck`

Expected: `1 passed`와 TypeScript 종료 코드 0이 출력됩니다.

Run: `npm run dev`

Expected: `Local: http://localhost:3000`이 출력되고 `/`에 `점심 추천`이 표시됩니다. 확인 후 `Ctrl-C`로 종료합니다.

Run: `npx supabase start`

Expected: 로컬 API URL, DB URL, anon key가 출력되고 종료 코드 0이 됩니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add package.json package-lock.json app next.config.ts tsconfig.json eslint.config.mjs vitest.config.ts vitest.setup.ts tests .env.local.example supabase/config.toml supabase/.env.example .gitignore
git commit -m "chore: 점심 추천 프로젝트 스캐폴드 구성"
```

### Task 2: DB 스키마 마이그레이션

**Files:**

- Create: `supabase/migrations/0001_schema.sql`
- Create: `supabase/tests/0001_schema.test.sql`
- Test: `supabase/tests/0001_schema.test.sql`

**Interfaces:**

- Consumes: Task 1의 로컬 Supabase 프로젝트입니다.
- Produces: `profiles`, `groups`, `group_members`, `restaurants`, `ratings`, `category_prefs`, `api_usage` 테이블과 명시된 PK·FK·unique·check 제약을 제공합니다.

- [ ] **Step 1: 테이블 계약을 검사하는 실패 SQL 테스트를 작성합니다**

```sql
-- supabase/tests/0001_schema.test.sql
begin;
select plan(10);
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'groups', 'groups exists');
select has_table('public', 'group_members', 'group_members exists');
select has_table('public', 'restaurants', 'restaurants exists');
select has_table('public', 'ratings', 'ratings exists');
select has_table('public', 'category_prefs', 'category_prefs exists');
select has_table('public', 'api_usage', 'api_usage exists');
select has_column('public', 'ratings', 'snoozed_until', 'ratings snooze exists');
select col_type_is('public', 'ratings', 'snoozed_until', 'timestamp with time zone', 'snooze is timestamptz');
select col_is_unique('public', 'groups', 'invite_code', 'invite code is unique');
select * from finish();
rollback;
```

- [ ] **Step 2: 스키마 테스트 실패를 확인합니다**

Run: `npx supabase db reset && npx supabase test db supabase/tests/0001_schema.test.sql`

Expected: FAIL과 함께 `profiles exists`가 실패했다고 출력됩니다.

- [ ] **Step 3: 7개 테이블을 생성하는 최소 마이그레이션을 작성합니다**

```sql
-- supabase/migrations/0001_schema.sql
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80)
);
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade
);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  primary key (group_id, user_id)
);
create table public.restaurants (
  place_id text primary key,
  name text not null,
  category text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  google_rating numeric(2,1) check (google_rating between 0 and 5),
  google_ratings_total integer not null default 0 check (google_ratings_total >= 0),
  fetched_at timestamptz not null default now()
);
create table public.ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null references public.restaurants(place_id) on delete cascade,
  score smallint not null check (score between 0 and 5),
  snoozed_until timestamptz null,
  primary key (user_id, place_id)
);
create table public.category_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  weight numeric(4,2) not null check (weight > 0),
  primary key (user_id, category)
);
create table public.api_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  ip inet not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, ip, window_start)
);
```

- [ ] **Step 4: 마이그레이션과 테이블 계약을 확인합니다**

Run: `npx supabase db reset && npx supabase test db supabase/tests/0001_schema.test.sql`

Expected: `1..10`과 모든 `ok`가 출력됩니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add supabase/migrations/0001_schema.sql supabase/tests/0001_schema.test.sql
git commit -m "feat: 점심 추천 데이터 스키마 추가"
```

### Task 3: RLS 정책과 초대코드 가입 RPC

**Files:**

- Create: `supabase/migrations/0002_rls.sql`
- Create: `supabase/tests/0002_rls.test.sql`
- Test: `supabase/tests/0002_rls.test.sql`

**Interfaces:**

- Consumes: Task 2의 7개 public 테이블과 `auth.uid()`입니다.
- Produces: `public.shares_group_with(uuid) returns boolean`, `public.join_group_by_code(code text) returns uuid`, `public.create_group(group_name text) returns table(group_id uuid, invite_code text)` 및 모든 테이블의 RLS 정책을 제공합니다.

- [ ] **Step 1: 그룹 외 평점 차단과 직접 가입 차단을 검사하는 실패 테스트를 작성합니다**

```sql
-- supabase/tests/0002_rls.test.sql
begin;
select plan(3);
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002');
insert into public.restaurants(place_id,name,category,lat,lng) values ('p1','식당','한식',37,127);
insert into public.ratings(user_id,place_id,score) values ('00000000-0000-0000-0000-000000000002','p1',5);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.ratings), 0, 'unshared rating hidden');
select throws_ok(
  $$insert into public.group_members(group_id,user_id,role) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','member')$$,
  '42501', null, 'direct membership insert denied'
);
select has_function('public', 'join_group_by_code', array['text'], 'join RPC exists');
select * from finish();
rollback;
```

- [ ] **Step 2: RLS 테스트 실패를 확인합니다**

Run: `npx supabase db reset && npx supabase test db supabase/tests/0002_rls.test.sql`

Expected: FAIL과 함께 그룹 외 사용자가 평점 1행을 읽거나 `join_group_by_code`가 없다고 출력됩니다.

- [ ] **Step 3: RLS 정책과 가입 RPC를 작성합니다**

`0002_rls.sql`에서 7개 테이블 모두 `enable row level security`를 적용합니다. 재귀 RLS를 피하도록 그룹 공유 검사는 `security definer set search_path = public` 함수로 캡슐화하고 실행 권한을 `authenticated`로 한정합니다.

```sql
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.restaurants enable row level security;
alter table public.ratings enable row level security;
alter table public.category_prefs enable row level security;
alter table public.api_usage enable row level security;

create function public.shares_group_with(other_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select other_user_id = auth.uid() or exists (
    select 1 from group_members mine join group_members theirs using (group_id)
    where mine.user_id = auth.uid() and theirs.user_id = other_user_id
  );
$$;
revoke all on function public.shares_group_with(uuid) from public;
grant execute on function public.shares_group_with(uuid) to authenticated;

create policy profiles_select on public.profiles for select to authenticated
using (public.shares_group_with(id));
create policy profiles_insert on public.profiles for insert to authenticated
with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy groups_select on public.groups for select to authenticated using (
  exists (select 1 from public.group_members gm where gm.group_id = id and gm.user_id = auth.uid())
);
create policy groups_insert on public.groups for insert to authenticated with check (created_by = auth.uid());
create policy groups_update on public.groups for update to authenticated using (
  exists (select 1 from public.group_members gm where gm.group_id = id and gm.user_id = auth.uid() and gm.role = 'admin')
) with check (created_by = auth.uid());
create policy groups_delete on public.groups for delete to authenticated using (
  exists (select 1 from public.group_members gm where gm.group_id = id and gm.user_id = auth.uid() and gm.role = 'admin')
);

create policy group_members_select on public.group_members for select to authenticated using (
  exists (select 1 from public.group_members mine where mine.group_id = group_id and mine.user_id = auth.uid())
);

create policy restaurants_select on public.restaurants for select to authenticated using (true);
create policy ratings_select on public.ratings for select to authenticated using (public.shares_group_with(user_id));
create policy ratings_insert on public.ratings for insert to authenticated with check (user_id = auth.uid());
create policy ratings_update on public.ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ratings_delete on public.ratings for delete to authenticated using (user_id = auth.uid());
create policy category_prefs_select on public.category_prefs for select to authenticated using (user_id = auth.uid());
create policy category_prefs_insert on public.category_prefs for insert to authenticated with check (user_id = auth.uid());
create policy category_prefs_update on public.category_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy category_prefs_delete on public.category_prefs for delete to authenticated using (user_id = auth.uid());

create function public.join_group_by_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_group_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select id into target_group_id from groups where invite_code = code;
  if target_group_id is null then raise exception 'invalid invite code' using errcode = '22023'; end if;
  insert into group_members(group_id,user_id,role) values(target_group_id,auth.uid(),'member') on conflict do nothing;
  return target_group_id;
end;
$$;
revoke all on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated;
```

그룹 생성과 생성자의 admin 멤버십을 원자화하기 위해 같은 `0002_rls.sql`에 아래 `create_group` RPC를 추가합니다. 무작위 12자리 초대코드를 만들고 `groups`와 `group_members(role='admin')`를 한 트랜잭션에서 삽입합니다.

```sql
create function public.create_group(group_name text)
returns table(group_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; new_code text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  insert into groups(name, invite_code, created_by) values (group_name, new_code, auth.uid()) returning id into new_id;
  insert into group_members(group_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return query select new_id, new_code;
end;
$$;
revoke all on function public.create_group(text) from public;
grant execute on function public.create_group(text) to authenticated;
```

`api_usage`에는 사용자 정책을 전혀 만들지 않아 anon/authenticated 접근을 완전히 차단합니다. service role은 RLS 우회 권한으로만 접근합니다.

- [ ] **Step 4: 정책과 우회 경로 차단을 확인합니다**

Run: `npx supabase db reset && npx supabase test db supabase/tests/0002_rls.test.sql`

Expected: `1..3`과 모든 `ok`가 출력됩니다. 추가 수동 SQL로 공유 그룹 사용자의 평점만 1행 보이고, 잘못된 초대코드가 SQLSTATE `22023`이며, authenticated 역할의 `api_usage` SELECT/UPDATE가 0행 또는 RLS 오류인지 확인합니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add supabase/migrations/0002_rls.sql supabase/tests/0002_rls.test.sql
git commit -m "feat: 그룹 경계 RLS와 초대코드 가입 추가"
```

### Task 4: 추천 순수 로직

**Files:**

- Create: `lib/recommend.ts`
- Create: `lib/recommend.test.ts`
- Test: `lib/recommend.test.ts`

**Interfaces:**

- Consumes: `Candidate`, `RecommendationPrefs`, 현재 시각, `rng: () => number`입니다.
- Produces: `scoreCandidate(candidate: Candidate, prefs: RecommendationPrefs): number`, `filterCandidates(candidates: Candidate[], now: Date): Candidate[]`, `pickWeightedRandom<T extends { weight: number }>(candidates: T[], rng: () => number): T | null`입니다.

- [ ] **Step 1: 제외 규칙과 가중 랜덤의 실패 테스트를 작성합니다**

```ts
import { describe, expect, it } from 'vitest';
import { filterCandidates, pickWeightedRandom, scoreCandidate, type Candidate } from './recommend';

const base: Candidate = {
  placeId: 'a',
  category: '한식',
  distanceMeters: 100,
  googleRating: 4,
  googleRatingsTotal: 100,
  personalRating: null,
  groupAverage: null,
  snoozedUntil: null,
};

describe('추천', () => {
  it('0점과 미래 스누즈를 제외하고 지난 스누즈를 포함합니다', () => {
    const now = new Date('2026-07-21T03:00:00Z');
    const candidates = [
      { ...base, placeId: 'zero', personalRating: 0 },
      { ...base, placeId: 'future', snoozedUntil: '2026-07-22T03:00:00Z' },
      { ...base, placeId: 'past', snoozedUntil: '2026-07-20T03:00:00Z' },
    ];
    expect(filterCandidates(candidates, now).map((x) => x.placeId)).toEqual(['past']);
  });
  it('결측 평점을 중립값으로 계산합니다', () => {
    expect(scoreCandidate(base, { categoryWeights: {}, maxDistanceMeters: 1000 })).toBeGreaterThan(
      0,
    );
  });
  it('결정적 rng에서 높은 가중치가 더 자주 선택됩니다', () => {
    let state = 1;
    const rng = () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
    const counts = { low: 0, high: 0 };
    for (let i = 0; i < 1000; i++)
      counts[
        pickWeightedRandom(
          [
            { id: 'low', weight: 1 },
            { id: 'high', weight: 9 },
          ],
          rng,
        )!.id
      ]++;
    expect(counts.high).toBeGreaterThan(800);
  });
});
```

- [ ] **Step 2: 추천 테스트 실패를 확인합니다**

Run: `npm test -- lib/recommend.test.ts`

Expected: FAIL과 함께 `Failed to resolve import "./recommend"`가 출력됩니다.

- [ ] **Step 3: 최소 추천 순수 함수를 구현합니다**

```ts
export type Candidate = {
  placeId: string;
  category: string;
  distanceMeters: number;
  googleRating: number | null;
  googleRatingsTotal: number;
  personalRating: number | null;
  groupAverage: number | null;
  snoozedUntil: string | null;
};
export type RecommendationPrefs = {
  categoryWeights: Record<string, number>;
  maxDistanceMeters: number;
};

// ponytail: 휴리스틱 가중치, 써보고 조정
const EXPONENTS = {
  category: 1,
  personal: 1,
  group: 1,
  google: 1,
  distance: 1,
} as const;

export function filterCandidates(candidates: Candidate[], now: Date): Candidate[] {
  return candidates.filter(
    (c) => c.personalRating !== 0 && (!c.snoozedUntil || new Date(c.snoozedUntil) <= now),
  );
}

export function scoreCandidate(candidate: Candidate, prefs: RecommendationPrefs): number {
  const category = prefs.categoryWeights[candidate.category] ?? 1;
  const personal = candidate.personalRating == null ? 1 : candidate.personalRating / 3;
  const group = candidate.groupAverage == null ? 1 : candidate.groupAverage / 3;
  const reviewConfidence = candidate.googleRatingsTotal / (candidate.googleRatingsTotal + 20);
  const google =
    candidate.googleRating == null ? 1 : 1 + (candidate.googleRating / 5 - 1) * reviewConfidence;
  const distance = 1 + 0.2 * Math.max(0, 1 - candidate.distanceMeters / prefs.maxDistanceMeters);
  return (
    category ** EXPONENTS.category *
    personal ** EXPONENTS.personal *
    group ** EXPONENTS.group *
    google ** EXPONENTS.google *
    distance ** EXPONENTS.distance
  );
}

export function pickWeightedRandom<T extends { weight: number }>(
  candidates: T[],
  rng: () => number,
): T | null {
  const valid = candidates.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return null;
  let cursor = rng() * total;
  for (const item of valid) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return valid.at(-1) ?? null;
}
```

- [ ] **Step 4: 추천 테스트 통과를 확인합니다**

Run: `npm test -- lib/recommend.test.ts`

Expected: `3 passed`가 출력됩니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add lib/recommend.ts lib/recommend.test.ts
git commit -m "feat: 가중치와 가중 랜덤 추천 로직 추가"
```

### Task 5: Rate limit 로직

**Files:**

- Create: `supabase/functions/_shared/rateLimit.ts`
- Create: `supabase/functions/_shared/rateLimit.test.ts`
- Create: `supabase/functions/deno.json`
- Test: `supabase/functions/_shared/rateLimit.test.ts`

**Interfaces:**

- Consumes: `UsageStore.increment(key: {userId:string; ip:string; windowStart:string}): Promise<number>`입니다.
- Produces: `checkRateLimit(store: UsageStore, userId: string, ip: string, now?: Date): Promise<{allowed:boolean; count:number; limit:number}>`입니다.

- [ ] **Step 1: 사용자 ID와 IP 이중 제한 실패 테스트를 작성합니다**

```ts
import { assertEquals } from 'jsr:@std/assert';
import { checkRateLimit, type UsageStore } from './rateLimit.ts';

Deno.test('한도 이하는 허용하고 초과는 차단합니다', async () => {
  let count = 0;
  const store: UsageStore = { increment: async () => ++count };
  for (let i = 0; i < 10; i++)
    assertEquals((await checkRateLimit(store, 'u1', '127.0.0.1')).allowed, true);
  assertEquals((await checkRateLimit(store, 'u1', '127.0.0.1')).allowed, false);
});
```

- [ ] **Step 2: 테스트 실패를 확인합니다**

Run: `deno test supabase/functions/_shared/rateLimit.test.ts`

Expected: FAIL과 함께 `Module not found "rateLimit.ts"`가 출력됩니다.

- [ ] **Step 3: 고정 1분 윈도우 제한을 구현합니다**

```ts
export type UsageStore = {
  increment(key: { userId: string; ip: string; windowStart: string }): Promise<number>;
};
const LIMIT_PER_MINUTE = 10;

export async function checkRateLimit(
  store: UsageStore,
  userId: string,
  ip: string,
  now = new Date(),
) {
  // 요금폭탄 주의: 스팸 요청이 구글 API 과금으로 직결
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  const count = await store.increment({ userId, ip, windowStart });
  return { allowed: count <= LIMIT_PER_MINUTE, count, limit: LIMIT_PER_MINUTE };
}
```

실제 `api_usage` 저장소의 `increment`는 service role Supabase 클라이언트로 원자적 DB 함수 `increment_api_usage(uuid, inet, timestamptz) returns integer`를 호출하도록 `0002_rls.sql`에 함께 정의합니다. 함수 실행 권한은 anon/authenticated에서 회수하고 service_role에만 부여합니다.

- [ ] **Step 4: 한도 경계를 확인합니다**

Run: `deno test supabase/functions/_shared/rateLimit.test.ts`

Expected: `1 passed`가 출력됩니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add supabase/functions/_shared/rateLimit.ts supabase/functions/_shared/rateLimit.test.ts supabase/functions/deno.json supabase/migrations/0002_rls.sql
git commit -m "feat: 사용자와 IP 기반 사용량 제한 추가"
```

### Task 6: Nearby Edge Function

**Files:**

- Create: `supabase/functions/nearby/index.ts`
- Create: `supabase/functions/nearby/index.test.ts`
- Test: `supabase/functions/nearby/index.test.ts`

**Interfaces:**

- Consumes: Bearer JWT, `{lat:number; lng:number; radius:500|1000}`, `checkRateLimit`, `GOOGLE_PLACES_API_KEY`, service-role DB 접근입니다.
- Produces: `createNearbyHandler(deps: NearbyDeps): (request: Request) => Promise<Response>`와 `{restaurants: NearbyRestaurant[]; source:'cache'|'google'}` JSON 응답입니다.

- [ ] **Step 1: 429와 캐시 우선 동작의 실패 테스트를 작성합니다**

```ts
import { assertEquals } from 'jsr:@std/assert';
import { createNearbyHandler } from './index.ts';

Deno.test('사용량 초과는 429입니다', async () => {
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => false,
    findCached: async () => [],
    fetchGoogle: async () => [],
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: { authorization: 'Bearer jwt', 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({ lat: 37, lng: 127, radius: 500 }),
    }),
  );
  assertEquals(response.status, 429);
});
Deno.test('캐시 히트 시 Google을 호출하지 않습니다', async () => {
  let googleCalls = 0;
  const cached = [
    {
      placeId: 'p1',
      name: '식당',
      category: '한식',
      lat: 37,
      lng: 127,
      googleRating: 4,
      googleRatingsTotal: 20,
      distanceMeters: 10,
    },
  ];
  const handler = createNearbyHandler({
    authenticate: async () => ({ id: 'u1' }),
    checkLimit: async () => true,
    findCached: async () => cached,
    fetchGoogle: async () => {
      googleCalls++;
      return [];
    },
    upsert: async () => {},
  });
  const response = await handler(
    new Request('http://local', {
      method: 'POST',
      headers: { authorization: 'Bearer jwt', 'x-forwarded-for': '127.0.0.1' },
      body: JSON.stringify({ lat: 37, lng: 127, radius: 500 }),
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(googleCalls, 0);
  assertEquals((await response.json()).source, 'cache');
});
```

- [ ] **Step 2: Edge Function 테스트 실패를 확인합니다**

Run: `deno test supabase/functions/nearby/index.test.ts`

Expected: FAIL과 함께 `Module not found "index.ts"`가 출력됩니다.

- [ ] **Step 3: 주입 가능한 HTTP 핸들러와 운영 어댑터를 구현합니다**

```ts
export type NearbyRestaurant = {
  placeId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  googleRating: number | null;
  googleRatingsTotal: number;
  distanceMeters: number;
};
export type NearbyDeps = {
  authenticate: (jwt: string) => Promise<{ id: string } | null>;
  checkLimit: (userId: string, ip: string) => Promise<boolean>;
  findCached: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>;
  fetchGoogle: (lat: number, lng: number, radius: number) => Promise<NearbyRestaurant[]>;
  upsert: (rows: NearbyRestaurant[]) => Promise<void>;
};

export function createNearbyHandler(deps: NearbyDeps) {
  return async (request: Request): Promise<Response> => {
    const jwt = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const user = jwt ? await deps.authenticate(jwt) : null;
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    if (!(await deps.checkLimit(user.id, ip)))
      return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });
    const body = await request.json();
    if (
      !Number.isFinite(body.lat) ||
      !Number.isFinite(body.lng) ||
      ![500, 1000].includes(body.radius)
    )
      return Response.json({ error: '위치 또는 반경이 올바르지 않습니다.' }, { status: 400 });
    const cached = await deps.findCached(body.lat, body.lng, body.radius);
    if (cached.length) return Response.json({ restaurants: cached, source: 'cache' });
    const restaurants = await deps.fetchGoogle(body.lat, body.lng, body.radius);
    await deps.upsert(restaurants);
    return Response.json({ restaurants, source: 'google' });
  };
}
```

같은 파일 하단의 직접 실행 분기에서 Supabase JWT `auth.getUser(jwt)`, 15분 이내 `fetched_at` 캐시, Google Places Nearby Search POST, `restaurants` upsert를 각각 `NearbyDeps`에 연결합니다. Google 요청의 `X-Goog-Api-Key`는 `Deno.env.get('GOOGLE_PLACES_API_KEY')`만 사용하고 요청 본문이나 응답에 키를 포함하지 않습니다.

- [ ] **Step 4: 핵심 서버 흐름을 확인합니다**

Run: `deno test supabase/functions/nearby/index.test.ts`

Expected: `2 passed`가 출력됩니다.

Run: `npx supabase functions serve nearby --env-file supabase/.env`

Expected: `Serving functions on http://127.0.0.1:54321/functions/v1/nearby`가 출력됩니다. 유효 JWT 없이 호출하면 401, 제한을 초과하면 429가 반환됩니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add supabase/functions/nearby/index.ts supabase/functions/nearby/index.test.ts
git commit -m "feat: 캐시 우선 nearby Edge Function 추가"
```

### Task 7: 인증 로그인

**Files:**

- Create: `lib/supabaseClient.ts`
- Create: `app/login/page.tsx`
- Create: `app/login/page.test.tsx`
- Create: `middleware.ts`
- Test: `app/login/page.test.tsx`

**Interfaces:**

- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Supabase Auth `signInWithPassword`/`signOut`입니다.
- Produces: `supabase` 브라우저 클라이언트, 이메일·비밀번호 로그인 폼, 미인증 보호 라우트 리다이렉트를 제공합니다.

- [ ] **Step 1: 로그인 폼 렌더링 실패 테스트를 작성합니다**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));
import LoginPage from './page';

describe('로그인', () => {
  it('이메일과 비밀번호 입력을 표시합니다', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 로그인 테스트 실패를 확인합니다**

Run: `npm test -- app/login/page.test.tsx`

Expected: FAIL과 함께 `Failed to resolve import "./page"`가 출력됩니다.

- [ ] **Step 3: Supabase 클라이언트와 로그인·로그아웃을 구현합니다**

```ts
// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

```tsx
// app/login/page.tsx
'use client';
import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
export default function LoginPage() {
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(data.get('email')),
      password: String(data.get('password')),
    });
    if (error) setError(error.message);
    else location.assign('/');
  }
  return (
    <form onSubmit={submit}>
      <label>
        이메일
        <input name="email" type="email" required />
      </label>
      <label>
        비밀번호
        <input name="password" type="password" required />
      </label>
      <button>로그인</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

`middleware.ts`는 Supabase 세션 쿠키가 없는 `/`, `/groups` 요청을 `/login`으로 리다이렉트하고 `/login`은 통과시킵니다. 공통 헤더의 로그아웃 버튼은 `supabase.auth.signOut()` 성공 후 `/login`으로 이동합니다.

- [ ] **Step 4: 자동 테스트와 수동 인증 흐름을 확인합니다**

Run: `npm test -- app/login/page.test.tsx && npm run typecheck`

Expected: `1 passed`와 TypeScript 종료 코드 0이 출력됩니다.

수동 확인: Supabase 대시보드 또는 로컬 Studio에서 사용자를 생성하고 `/login`에서 로그인하면 `/`로 이동합니다. 새 탭에서 보호 라우트 `/groups`가 열립니다. 로그아웃하면 `/login`으로 이동하고 `/` 재접근도 `/login`으로 리다이렉트됩니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add lib/supabaseClient.ts app/login/page.tsx app/login/page.test.tsx middleware.ts
git commit -m "feat: Supabase 로그인과 보호 라우트 추가"
```

### Task 8: 그룹 생성·가입 UI

**Files:**

- Create: `app/groups/page.tsx`
- Create: `app/groups/page.test.tsx`
- Test: `app/groups/page.test.tsx`

**Interfaces:**

- Consumes: `supabase.rpc('create_group',{group_name:string})`, `supabase.rpc('join_group_by_code',{code:string})`입니다.
- Produces: 그룹 이름 생성 폼, 생성된 `invite_code` 표시, 초대코드 가입 폼입니다.

- [ ] **Step 1: 그룹 생성·가입 폼의 실패 테스트를 작성합니다**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
import GroupsPage from './page';
describe('그룹', () => {
  it('생성과 가입 입력을 표시합니다', () => {
    render(<GroupsPage />);
    expect(screen.getByLabelText('그룹 이름')).toBeInTheDocument();
    expect(screen.getByLabelText('초대코드')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 그룹 UI 테스트 실패를 확인합니다**

Run: `npm test -- app/groups/page.test.tsx`

Expected: FAIL과 함께 `Failed to resolve import "./page"`가 출력됩니다.

- [ ] **Step 3: RPC만 사용하는 그룹 UI를 구현합니다**

```tsx
'use client';
import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
export default function GroupsPage() {
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name'));
    const { data, error } = await supabase.rpc('create_group', {
      group_name: name,
    });
    if (error) setMessage(error.message);
    else setInvite(data[0].invite_code);
  }
  async function join(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).trim();
    const { error } = await supabase.rpc('join_group_by_code', { code });
    setMessage(error ? error.message : '그룹에 가입했습니다.');
  }
  return (
    <main>
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
    </main>
  );
}
```

- [ ] **Step 4: 생성→가입→멤버십을 확인합니다**

Run: `npm test -- app/groups/page.test.tsx`

Expected: `1 passed`가 출력됩니다.

수동 확인: 사용자 A가 그룹을 만들면 12자리 코드가 표시됩니다. 사용자 B가 코드로 가입하면 성공 메시지가 표시됩니다. Studio에서 두 사용자의 `group_members.group_id`가 같고 A는 `admin`, B는 `member`인지 확인합니다. 임의 `group_members.insert()`는 RLS로 실패해야 합니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add app/groups/page.tsx app/groups/page.test.tsx
git commit -m "feat: 초대코드 그룹 생성과 가입 UI 추가"
```

### Task 9: 지도·현재 위치·검색 반경

**Files:**

- Create: `components/Map.tsx`
- Create: `components/Map.test.tsx`
- Modify: `app/page.tsx`
- Test: `components/Map.test.tsx`

**Interfaces:**

- Consumes: `NEXT_PUBLIC_GOOGLE_MAPS_RENDER_KEY`, 브라우저 `navigator.geolocation`, Google Maps JavaScript API입니다.
- Produces: `Map({onLocationChange:(location:{lat:number;lng:number;radius:500|1000})=>void})`와 500m/1km 반경 선택 UI입니다.

- [ ] **Step 1: 반경 선택 실패 테스트를 작성합니다**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Map from './Map';
describe('지도', () => {
  it('두 검색 반경을 제공합니다', () => {
    render(<Map onLocationChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: '500m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1km' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 지도 테스트 실패를 확인합니다**

Run: `npm test -- components/Map.test.tsx`

Expected: FAIL과 함께 `Failed to resolve import "./Map"`가 출력됩니다.

- [ ] **Step 3: 지도 로더와 위치·반경 UI를 구현합니다**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
type Location = { lat: number; lng: number; radius: 500 | 1000 };
export default function Map({ onLocationChange }: { onLocationChange: (value: Location) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState<500 | 1000>(500);
  const [error, setError] = useState('');
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          lat: coords.latitude,
          lng: coords.longitude,
          radius,
        };
        onLocationChange(location);
        const map = new google.maps.Map(node.current!, {
          center: location,
          zoom: 16,
        });
        new google.maps.Marker({ position: location, map });
      },
      () => setError('현재 위치 권한이 필요합니다.'),
    );
  }, [radius, onLocationChange]);
  return (
    <section>
      <label>
        검색 반경
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value) as 500 | 1000)}>
          <option value="500">500m</option>
          <option value="1000">1km</option>
        </select>
      </label>
      <div ref={node} aria-label="주변 지도" style={{ height: 400 }} />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
```

Google Maps 스크립트는 `app/layout.tsx`의 `next/script`로 `NEXT_PUBLIC_GOOGLE_MAPS_RENDER_KEY`를 사용해 로드합니다. 이 키에는 Google Cloud Console에서 배포 도메인과 localhost HTTP referrer 제한을 적용합니다. `app/page.tsx`는 위치 상태를 보유하고 `Map`에 콜백을 전달합니다.

- [ ] **Step 4: 지도 렌더링을 확인합니다**

Run: `npm test -- components/Map.test.tsx && npm run typecheck`

Expected: `1 passed`와 TypeScript 종료 코드 0이 출력됩니다.

수동 확인: 브라우저 위치 권한을 허용하면 지도가 현재 위치 중심으로 표시되고 마커가 보입니다. 500m와 1km 선택 시 콜백의 `radius`가 각각 500과 1000으로 바뀝니다. Network 탭에 Places REST 요청이나 `GOOGLE_PLACES_API_KEY`가 없어야 합니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add components/Map.tsx components/Map.test.tsx app/page.tsx app/layout.tsx
git commit -m "feat: 현재 위치 지도와 검색 반경 선택 추가"
```

### Task 10: 추천 실행 플로우

**Files:**

- Create: `components/Recommend.tsx`
- Create: `components/Recommend.test.tsx`
- Create: `lib/mergeCandidates.ts`
- Create: `lib/mergeCandidates.test.ts`
- Modify: `app/page.tsx`
- Test: `components/Recommend.test.tsx`
- Test: `lib/mergeCandidates.test.ts`

**Interfaces:**

- Consumes: `{lat:number;lng:number;radius:500|1000}`, `supabase.functions.invoke('nearby')`, RLS가 적용된 `ratings`/`category_prefs`, Task 4의 추천 함수입니다.
- Produces: `mergeCandidates(restaurants: NearbyRestaurant[], ratings: RatingRow[], prefs: CategoryPrefRow[], currentUserId: string): {candidates:Candidate[]; categoryWeights:Record<string,number>}`와 `Recommend({location:Location|null})` 결과 카드입니다.

- [ ] **Step 1: 그룹 평균 병합 실패 테스트를 작성합니다**

```ts
import { describe, expect, it } from 'vitest';
import { mergeCandidates } from './mergeCandidates';
describe('후보 병합', () => {
  it('개인 평점과 다른 그룹원의 평균을 분리합니다', () => {
    const restaurants = [
      {
        placeId: 'p1',
        name: '식당',
        category: '한식',
        lat: 37,
        lng: 127,
        googleRating: 4,
        googleRatingsTotal: 10,
        distanceMeters: 50,
      },
    ];
    const ratings = [
      { user_id: 'me', place_id: 'p1', score: 4, snoozed_until: null },
      { user_id: 'other', place_id: 'p1', score: 2, snoozed_until: null },
    ];
    const result = mergeCandidates(restaurants, ratings, [{ category: '한식', weight: 1.5 }], 'me');
    expect(result.candidates[0]).toMatchObject({
      personalRating: 4,
      groupAverage: 2,
    });
    expect(result.categoryWeights).toEqual({ 한식: 1.5 });
  });
});
```

- [ ] **Step 2: 병합 테스트 실패를 확인합니다**

Run: `npm test -- lib/mergeCandidates.test.ts`

Expected: FAIL과 함께 `Failed to resolve import "./mergeCandidates"`가 출력됩니다.

- [ ] **Step 3: 병합 함수와 추천 컴포넌트를 구현합니다**

```ts
import type { Candidate } from './recommend';
export function mergeCandidates(
  restaurants: any[],
  ratings: any[],
  prefs: any[],
  currentUserId: string,
) {
  const candidates: Candidate[] = restaurants.map((restaurant) => {
    const rows = ratings.filter((rating) => rating.place_id === restaurant.placeId);
    const mine = rows.find((rating) => rating.user_id === currentUserId);
    const group = rows.filter((rating) => rating.user_id !== currentUserId && rating.score > 0);
    return {
      ...restaurant,
      personalRating: mine?.score ?? null,
      snoozedUntil: mine?.snoozed_until ?? null,
      groupAverage: group.length
        ? group.reduce((sum, rating) => sum + rating.score, 0) / group.length
        : null,
    };
  });
  return {
    candidates,
    categoryWeights: Object.fromEntries(prefs.map((pref) => [pref.category, Number(pref.weight)])),
  };
}
```

```tsx
'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { filterCandidates, pickWeightedRandom, scoreCandidate } from '../lib/recommend';
import { mergeCandidates } from '../lib/mergeCandidates';
export default function Recommend({
  location,
}: {
  location: { lat: number; lng: number; radius: 500 | 1000 } | null;
}) {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  async function run() {
    if (!location) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setError('로그인이 필요합니다.');
    const nearby = await supabase.functions.invoke('nearby', {
      body: location,
    });
    if (nearby.error) return setError(nearby.error.message);
    const [ratings, prefs] = await Promise.all([
      supabase.from('ratings').select('user_id,place_id,score,snoozed_until'),
      supabase.from('category_prefs').select('category,weight'),
    ]);
    const merged = mergeCandidates(
      nearby.data.restaurants,
      ratings.data ?? [],
      prefs.data ?? [],
      user.id,
    );
    const candidates = filterCandidates(merged.candidates, new Date()).map((candidate) => ({
      ...candidate,
      weight: scoreCandidate(candidate, {
        categoryWeights: merged.categoryWeights,
        maxDistanceMeters: location.radius,
      }),
    }));
    setResult(pickWeightedRandom(candidates, Math.random));
  }
  return (
    <section>
      <button onClick={run} disabled={!location}>
        한 곳 추천
      </button>
      {result && (
        <article>
          <h2>{result.name}</h2>
          <p>
            {result.category} · {Math.round(result.distanceMeters)}m
          </p>
        </article>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
```

`app/page.tsx`에서 Task 9의 위치 상태를 `Map`과 `Recommend`에 연결합니다.

- [ ] **Step 4: 병합과 추천 플로우를 확인합니다**

Run: `npm test -- lib/mergeCandidates.test.ts components/Recommend.test.tsx && npm run typecheck`

Expected: 그룹 평균 테스트와 추천 버튼 렌더 테스트가 모두 PASS하고 TypeScript 종료 코드가 0입니다.

수동 확인: 로그인 후 위치를 허용하고 `한 곳 추천`을 누르면 Edge Function 요청 1회 뒤 음식점 이름·카테고리·거리가 카드 한 장에 표시됩니다. 개인 0점 또는 미래 스누즈 음식점은 반복 실행해도 표시되지 않습니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add components/Recommend.tsx components/Recommend.test.tsx lib/mergeCandidates.ts lib/mergeCandidates.test.ts app/page.tsx
git commit -m "feat: 그룹 평점을 병합한 추천 실행 플로우 추가"
```

### Task 11: 평점·기호·스누즈 UI

**Files:**

- Create: `components/RatingControls.tsx`
- Create: `components/RatingControls.test.tsx`
- Create: `components/CategoryPrefs.tsx`
- Create: `components/CategoryPrefs.test.tsx`
- Create: `lib/snooze.ts`
- Create: `lib/snooze.test.ts`
- Modify: `components/Recommend.tsx`
- Test: `components/RatingControls.test.tsx`
- Test: `components/CategoryPrefs.test.tsx`
- Test: `lib/snooze.test.ts`

**Interfaces:**

- Consumes: 추천 결과 `placeId`/`category`, 현재 사용자 ID, `ratings`와 `category_prefs` 본인 쓰기 RLS입니다.
- Produces: `snoozedUntilOneWeekFrom(now: Date): string`, `RatingControls({placeId,userId})`, `CategoryPrefs({userId,categories})`입니다.

- [ ] **Step 1: 7일 스누즈 계산 실패 테스트를 작성합니다**

```ts
import { describe, expect, it } from 'vitest';
import { snoozedUntilOneWeekFrom } from './snooze';
describe('스누즈', () => {
  it('현재 시각에서 정확히 7일 뒤를 반환합니다', () => {
    expect(snoozedUntilOneWeekFrom(new Date('2026-07-21T03:00:00Z'))).toBe(
      '2026-07-28T03:00:00.000Z',
    );
  });
});
```

- [ ] **Step 2: 스누즈 테스트 실패를 확인합니다**

Run: `npm test -- lib/snooze.test.ts`

Expected: FAIL과 함께 `Failed to resolve import "./snooze"`가 출력됩니다.

- [ ] **Step 3: 저장 컨트롤과 스누즈 함수를 구현합니다**

```ts
export function snoozedUntilOneWeekFrom(now: Date): string {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}
```

```tsx
'use client';
import { supabase } from '../lib/supabaseClient';
import { snoozedUntilOneWeekFrom } from '../lib/snooze';
export default function RatingControls({ placeId, userId }: { placeId: string; userId: string }) {
  async function save(score: number) {
    await supabase
      .from('ratings')
      .upsert({ user_id: userId, place_id: placeId, score }, { onConflict: 'user_id,place_id' });
  }
  async function snooze() {
    const { data } = await supabase
      .from('ratings')
      .select('score')
      .eq('user_id', userId)
      .eq('place_id', placeId)
      .maybeSingle();
    await supabase.from('ratings').upsert(
      {
        user_id: userId,
        place_id: placeId,
        score: data?.score ?? 3,
        snoozed_until: snoozedUntilOneWeekFrom(new Date()),
      },
      { onConflict: 'user_id,place_id' },
    );
  }
  return (
    <section aria-label="개인 평점">
      {[0, 1, 2, 3, 4, 5].map((score) => (
        <button key={score} onClick={() => save(score)}>
          {score}점
        </button>
      ))}
      <button onClick={snooze}>1주간 그만 보기</button>
    </section>
  );
}
```

`RatingControls`는 기존 평점 행을 먼저 조회하여 스누즈 upsert 시 `score`를 보존합니다. 행이 없을 때만 중립 기준인 3점을 사용합니다. 0점 저장은 `snoozed_until`을 변경하지 않아 영구 제외와 일시 스누즈를 독립적으로 유지합니다.

```tsx
'use client';
import { supabase } from '../lib/supabaseClient';
export default function CategoryPrefs({
  userId,
  categories,
}: {
  userId: string;
  categories: string[];
}) {
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
                {
                  user_id: userId,
                  category,
                  weight: Number(event.currentTarget.value),
                },
                { onConflict: 'user_id,category' },
              )
            }
          />
        </label>
      ))}
    </section>
  );
}
```

`Recommend.tsx` 결과 카드 아래에 로그인 사용자 ID를 전달한 `RatingControls`와 결과 카테고리를 전달한 `CategoryPrefs`를 렌더링합니다.

- [ ] **Step 4: 저장과 추천 제외를 확인합니다**

Run: `npm test -- lib/snooze.test.ts components/RatingControls.test.tsx components/CategoryPrefs.test.tsx && npm run typecheck`

Expected: 7일 계산, 0~5점 버튼, 카테고리 weight 저장 테스트가 모두 PASS하고 TypeScript 종료 코드가 0입니다.

수동 확인: 결과 카드에서 5점을 저장하면 `ratings.score=5`, 한식을 1.5로 저장하면 `category_prefs.weight=1.5`가 됩니다. `1주간 그만 보기`를 누르면 기존 점수는 유지되고 `snoozed_until`이 현재 시각보다 7일 뒤가 됩니다. 다시 추천하면 해당 음식점이 빠지고, DB에서 기한을 과거로 바꾼 뒤에는 후보에 자동 복귀합니다. 0점 저장 후에는 기한과 관계없이 계속 제외됩니다.

- [ ] **Step 5: 전체 회귀 검증 후 커밋합니다**

Run: `npm test && deno test supabase/functions && npx supabase db reset && npx supabase test db && npm run typecheck && npm run build`

Expected: Vitest, Deno, pgTAP 테스트가 모두 PASS하고 typecheck/build가 종료 코드 0으로 완료됩니다.

```bash
git add components/RatingControls.tsx components/RatingControls.test.tsx components/CategoryPrefs.tsx components/CategoryPrefs.test.tsx lib/snooze.ts lib/snooze.test.ts components/Recommend.tsx
git commit -m "feat: 평점 기호와 일주일 스누즈 UI 추가"
```

## 근거 스펙

- [위치 기반 점심 추천 웹앱 설계 스펙](../specs/2026-07-21-lunch-recommender-design.md)
