# 맛집 지도 Phase 1 (폴더·저장·지도 / 그룹 폐기) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 사용자가 맛집을 폴더로 나눠 저장하고 지도(핀)+목록으로 보는 기능을 만들고, 안 쓰는 그룹/초대코드 로직을 폐기한다. (공유는 Phase 2)

**Architecture:** Supabase 테이블 + RLS로 폴더·저장맛집을 개인 소유로 관리한다(공유 없음). 프론트는 기존 데이터 레이어 패턴(api/hooks/types 4파일 세트)과 React Query를 따른다. 새 라우트 `/places`는 로그인 필수다. 지도·저장 흐름은 기존 Google Maps SDK 로딩과 추천 데이터를 재활용한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase(Postgres+RLS, pgTAP), React Query, React Hook Form, Vitest, Google Maps JS SDK.

## Global Constraints

- `.ts` / `.tsx`만 생성한다. `.js` / `.jsx` 신규 금지.
- 컴포넌트에서 `supabase`를 직접 호출하지 않는다. `lib/api/*`만 Supabase에 접근하고, 컴포넌트는 훅을 소비한다.
- 식별자는 `lib/constants.ts`, 사용자 노출 문구는 `lib/messages.ts`에 모은다. 매직 스트링 금지.
- 서버 상태는 React Query, 폼 상태는 React Hook Form. `enum` 금지(`as const`+유니온).
- Supabase 응답은 `lib/api/unwrap.ts`의 `unwrap`(읽기)·`assertNoError`(쓰기)로 처리한다.
- 익명 사용자는 맛집 지도 도메인 전체에서 차단한다(기존 `public.is_anonymous_user()` 재활용).
- 검증 명령: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`(env 필요), `npx supabase db reset && npx supabase test db`.
- `deno test`는 리포 루트가 아니라 `supabase/functions/`에서 실행한다(node_modules 오염 방지). 이 Phase엔 Edge Function 변경이 없다.
- 새 마이그레이션 번호는 `0010`부터다(현재 `0009`까지 존재).

---

### Task 1: 마이그레이션 0010 — 그룹/초대코드 로직 폐기, ratings RLS 교체

**Files:**

- Create: `supabase/migrations/0010_remove_groups.sql`
- Modify: `supabase/tests/0002_rls.test.sql` (그룹 관련 pgTAP 단언 제거, ratings 본인전용 단언 추가)

**Interfaces:**

- Consumes: 기존 `public.ratings` 테이블, `public.is_anonymous_user()`.
- Produces: `groups`·`group_members` 테이블과 `create_group`·`join_group_by_code`·`shares_group_with` 함수가 사라진 DB. `ratings_select`가 본인 행만 노출.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/0010_remove_groups.sql`:

```sql
-- 그룹/초대코드 로직 폐기. 맛집 지도(폴더 공유)에서 초대코드 개념을 새로 구현하므로 옛 구조를 걷어낸다.
-- ratings_select가 shares_group_with에 의존하므로, 먼저 본인 전용으로 교체한 뒤 함수를 지운다.
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings for select to authenticated
  using (user_id = auth.uid());

-- 그룹 관련 정책·함수·테이블 제거. group_members/groups는 cascade로 정책도 함께 사라진다.
drop function if exists public.create_group(text);
drop function if exists public.join_group_by_code(text);
drop function if exists public.shares_group_with(uuid);
drop table if exists public.group_members;
drop table if exists public.groups;
```

- [ ] **Step 2: pgTAP에서 그룹 단언 제거, ratings 본인전용 단언 추가**

이 저장소의 pgTAP은 supabase test 헬퍼(`tests.create_supabase_user` 등)를 쓰지 않고 **원시 패턴**
(`set local role authenticated; set local request.jwt.claim.sub = '<uuid>';`)을 쓴다. `auth.uid()`는
그 `request.jwt.claim.sub`를 읽는다. 이 패턴을 그대로 따른다.

먼저 `supabase/tests/0002_rls.test.sql`에서 `create_group`·`join_group_by_code`·`shares_group_with`·
`my_group_ids`·`groups`·`group_members`·`t_group`을 참조하는 `select ...` 단언·셋업 줄을 모두 삭제하고,
상단의 `select plan(N)` 개수를 남은 단언 수에 맞춘다.

그다음 이미 restaurants·ratings 셋업이 있는 블록(기존 파일에 존재)에서, 사용자 `...002`가 남긴 평점이
사용자 `...001`에게 보이지 않는지 단언을 추가한다:

```sql
-- 그룹 폐기 후 ratings_select는 본인 전용. ...002의 평점이 ...001에게 안 보여야 한다.
-- (restaurants 'p1' 행과 두 사용자 셋업은 기존 ratings 테스트 블록을 재사용한다.)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into public.ratings (user_id, place_id, score)
  values ('00000000-0000-0000-0000-000000000002', 'p1', 5)
  on conflict do nothing;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is_empty(
  $$ select 1 from public.ratings where user_id = '00000000-0000-0000-0000-000000000002' $$,
  'ratings: 다른 사용자의 평점은 조회되지 않는다'
);
```

> 실행자 주의: 위 insert는 restaurants에 `p1` 행이 있어야 FK를 통과한다. 기존 ratings 블록이 이미
> `p1`을 만들어 두었는지 확인하고, 없으면 그 블록의 restaurants insert를 재사용한다. `select plan(N)`을
> 최종 단언 수에 맞추는 것을 잊지 않는다.

- [ ] **Step 3: DB 리셋 + pgTAP 실행 (실패 없이 통과 확인)**

Run: `npx supabase db reset && npx supabase test db`
Expected: 모든 pgTAP 파일 통과. 그룹 관련 단언이 사라지고 ratings 본인전용 단언이 통과한다.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0010_remove_groups.sql supabase/tests/0002_rls.test.sql
git commit -m "feat: 그룹/초대코드 로직 폐기 및 ratings RLS 본인전용 교체"
```

---

### Task 2: 마이그레이션 0011 — folders·saved_places 테이블과 개인전용 RLS

**Files:**

- Create: `supabase/migrations/0011_folders_saved_places.sql`
- Create: `supabase/tests/0011_folders_saved_places.test.sql`

**Interfaces:**

- Consumes: `public.is_anonymous_user()`, `auth.users`.
- Produces: `public.folders(id, name, owner_id, created_at)`, `public.saved_places(id, folder_id, place_id, name, lat, lng, address, memo, created_by, created_at)`, 소유자 전용 RLS.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/0011_folders_saved_places.sql`:

```sql
-- 맛집 폴더와 저장 맛집. Phase 1은 개인 소유만(공유는 Phase 2). 익명 사용자는 전부 차단한다.
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index folders_owner_idx on public.folders(owner_id);

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  place_id text not null,
  name text not null check (length(trim(name)) between 1 and 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text null,
  memo text null check (memo is null or length(memo) <= 500),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (folder_id, place_id)
);
create index saved_places_folder_idx on public.saved_places(folder_id);

alter table public.folders enable row level security;
alter table public.saved_places enable row level security;
grant select, insert, update, delete on public.folders to authenticated;
grant select, insert, update, delete on public.saved_places to authenticated;

-- 폴더: 소유자 전용. 익명은 is_anonymous_user()로 차단.
create policy folders_select on public.folders for select to authenticated
  using (owner_id = auth.uid());
create policy folders_insert on public.folders for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_anonymous_user());
create policy folders_update on public.folders for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy folders_delete on public.folders for delete to authenticated
  using (owner_id = auth.uid());

-- 저장 맛집: 그 폴더의 소유자만. Phase 2에서 멤버까지 넓힌다.
create policy saved_places_select on public.saved_places for select to authenticated
  using (exists (select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid()));
create policy saved_places_insert on public.saved_places for insert to authenticated
  with check (
    created_by = auth.uid()
    and not public.is_anonymous_user()
    and exists (select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid())
  );
create policy saved_places_update on public.saved_places for update to authenticated
  using (exists (select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid()));
create policy saved_places_delete on public.saved_places for delete to authenticated
  using (exists (select 1 from public.folders f where f.id = folder_id and f.owner_id = auth.uid()));
```

- [ ] **Step 2: pgTAP 테스트 작성**

`supabase/tests/0011_folders_saved_places.test.sql` — 저장소 규약대로 원시 JWT 패턴을 쓴다. 두 사용자
UUID를 상수로 둔다: `...001`(소유자), `...002`(타인).

```sql
begin;
select plan(6);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- 001이 폴더를 만들고, 자기 폴더를 본다
insert into public.folders (id, name, owner_id)
  values ('11111111-1111-1111-1111-111111111111', '내 맛집', '00000000-0000-0000-0000-000000000001');
select isnt_empty(
  $$ select 1 from public.folders where owner_id = '00000000-0000-0000-0000-000000000001' $$,
  'folders: 소유자는 자기 폴더를 본다'
);

-- 001 폴더에 맛집을 담고, 본다
insert into public.saved_places (folder_id, place_id, name, lat, lng, created_by)
  values ('11111111-1111-1111-1111-111111111111', 'p1', '가게', 37.5, 127.0,
          '00000000-0000-0000-0000-000000000001');
select isnt_empty(
  $$ select 1 from public.saved_places where place_id = 'p1' $$,
  'saved_places: 소유자는 담은 맛집을 본다'
);

-- 002로 전환하면 001의 폴더/맛집이 보이지 않는다
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select is_empty($$ select 1 from public.folders $$, 'folders: 남의 폴더는 안 보인다');
select is_empty($$ select 1 from public.saved_places $$, 'saved_places: 남의 맛집은 안 보인다');

-- 002는 001 폴더에 맛집을 넣을 수 없다(with check 위반). folder_id를 명시해도 RLS가 막는다.
select throws_ok(
  $$ insert into public.saved_places (folder_id, place_id, name, lat, lng, created_by)
     values ('11111111-1111-1111-1111-111111111111', 'p2', '침입', 37.5, 127.0,
             '00000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'saved_places: 남의 폴더엔 삽입 불가'
);

-- 익명(is_anonymous=true) 사용자는 폴더를 만들 수 없다. auth.jwt()가 JSON을 읽으므로 claims로 설정한다.
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-000000000003","is_anonymous":true}';
select throws_ok(
  $$ insert into public.folders (name, owner_id)
     values ('x', '00000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'folders: 익명 사용자는 삽입 불가'
);

select * from finish();
rollback;
```

> 실행자 주의: `is_anonymous_user()`는 `auth.jwt()->>'is_anonymous'`를 읽는데, 이는 개별 클레임
> `request.jwt.claim.sub`가 아니라 JSON 블롭 `request.jwt.claims`에서 온다. 그래서 익명 케이스만
> `request.jwt.claims`(JSON)로 설정한다. `supabase test db`로 실제 통과를 확인하고, 오류코드가 다르면
> `throws_ok`의 `'42501'`을 실제 코드로 맞춘다.

- [ ] **Step 3: DB 리셋 + pgTAP 실행**

Run: `npx supabase db reset && npx supabase test db`
Expected: 새 테스트 파일 통과.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0011_folders_saved_places.sql supabase/tests/0011_folders_saved_places.test.sql
git commit -m "feat: folders·saved_places 테이블과 개인전용 RLS 추가"
```

---

### Task 3: 추천에서 groupAverage 제거 (개인+Google로 단순화)

**Files:**

- Modify: `lib/recommend.ts` (Candidate·EXPONENTS·scoreCandidate)
- Modify: `lib/mergeCandidates.ts`
- Modify: `lib/recommend.test.ts`, `lib/mergeCandidates.test.ts`

**Interfaces:**

- Consumes: 기존 `Candidate`, `mergeCandidates` 시그니처.
- Produces: `Candidate`에서 `groupAverage` 제거. `mergeCandidates`는 그룹 평균을 계산하지 않는다. `scoreCandidate`는 group 항을 뺀다.

- [ ] **Step 1: 테스트를 먼저 고쳐 실패시킨다**

`lib/mergeCandidates.test.ts`의 후보 기대값에서 `groupAverage`를 제거하고, "다른 그룹원의 0점은 그룹 평균에서 제외" 케이스를 삭제한다. `lib/recommend.test.ts`의 `scoreCandidate`/`Candidate` 픽스처에서 `groupAverage` 필드를 제거한다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/mergeCandidates.test.ts lib/recommend.test.ts`
Expected: 타입/단언 실패(아직 groupAverage가 코드에 남아 있음).

- [ ] **Step 3: 구현에서 groupAverage 제거**

`lib/recommend.ts`:

- `Candidate` 타입에서 `groupAverage: number | null;` 줄 삭제.
- `EXPONENTS`에서 `group: 1,` 삭제.
- `scoreCandidate`에서 `const group = ...` 줄과 곱셈의 `group ** EXPONENTS.group *` 항 삭제.

`lib/mergeCandidates.ts`:

- `const group = rows.filter(...)` 줄 삭제.
- 반환 객체에서 `groupAverage: ...` 줄 삭제.
- `mine`(personalRating·snoozedUntil)만 남긴다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/mergeCandidates.test.ts lib/recommend.test.ts && npm run typecheck`
Expected: PASS, 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add lib/recommend.ts lib/mergeCandidates.ts lib/recommend.test.ts lib/mergeCandidates.test.ts
git commit -m "refactor: 추천에서 그룹 평균 제거(개인+Google로 단순화)"
```

---

### Task 4: 프론트에서 GroupManager와 그룹 API/훅/타입/상수 제거

**Files:**

- Delete: `components/GroupManager.tsx`, `components/GroupManager.module.css`, `components/GroupManager.test.tsx`
- Delete: `lib/api/groups.ts`, `lib/hooks/mutations/useGroupsMutations.ts`, `lib/types/api/groups.types.ts`
- Modify: `app/page.tsx` (헤더에서 GroupManager 제거)
- Modify: `lib/api/index.ts`, `lib/hooks/mutations/index.ts`, `lib/types/api/index.ts` (배럴에서 groups export 제거)
- Modify: `lib/constants.ts`(RPC/그룹 관련 상수 있으면 제거), `lib/messages.ts`(그룹 전용 문구 있으면 제거)

**Interfaces:**

- Consumes: 없음(제거 작업).
- Produces: 빌드·타입체크에서 groups 참조가 완전히 사라진 상태.

- [ ] **Step 1: 파일 삭제 및 배럴/사용처 정리**

```bash
git rm components/GroupManager.tsx components/GroupManager.module.css components/GroupManager.test.tsx \
       lib/api/groups.ts lib/hooks/mutations/useGroupsMutations.ts lib/types/api/groups.types.ts
```

- `lib/api/index.ts`에서 `export * from './groups';` 삭제.
- `lib/hooks/mutations/index.ts`에서 `export * from './useGroupsMutations';` 삭제.
- `lib/types/api/index.ts`에서 `export type * from './groups.types';` 삭제.
- `app/page.tsx`: `import GroupManager` 줄과 `<GroupManager />` 렌더를 제거한다(헤더는 로그인 시 로그아웃 버튼만 남기거나 이후 Task 7에서 "내 맛집 지도" 링크를 넣는다).
- `lib/constants.ts`·`lib/messages.ts`에 그룹 전용 식별자·문구가 있으면 제거한다. `grep -rn "group\|GROUP\|초대\|그룹" lib app components --include=*.ts --include=*.tsx | grep -v test`로 잔여 참조를 확인한다.

- [ ] **Step 2: 잔여 참조 없음 확인**

Run: `npm run typecheck`
Expected: 오류 0(groups 참조가 남아 있으면 여기서 드러난다 → 마저 제거).

- [ ] **Step 3: 테스트·빌드 확인**

Run: `npm test && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_GOOGLE_MAPS_KEY=dummy npm run build`
Expected: 전체 통과. app/page 테스트에 그룹 관련 단언이 있으면 함께 제거한다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "refactor: GroupManager와 그룹 API/훅/타입 제거"
```

---

### Task 5: folders 데이터 레이어 (타입·API·훅)

**Files:**

- Create: `lib/types/api/folders.types.ts`
- Create: `lib/api/folders.ts`
- Create: `lib/hooks/queries/useFoldersQueries.ts`
- Create: `lib/hooks/mutations/useFoldersMutations.ts`
- Modify: `lib/types/api/index.ts`, `lib/api/index.ts`, `lib/hooks/queries/index.ts`, `lib/hooks/mutations/index.ts` (배럴 추가)
- Modify: `lib/constants.ts` (`TABLE.FOLDERS` 추가)
- Create: `lib/api/folders.test.ts` (또는 훅 테스트는 컴포넌트 테스트에서 커버)

**Interfaces:**

- Consumes: `supabase`, `unwrap`/`assertNoError`, `getCurrentUser`.
- Produces:
  - 타입 `Folder = { id: string; name: string; ownerId: string; createdAt: string }`
  - `listFolders(): Promise<Folder[]>`
  - `createFolder(name: string): Promise<Folder>`
  - `renameFolder(id: string, name: string): Promise<void>`
  - `deleteFolder(id: string): Promise<void>`
  - 훅 `useFolders()`, `useCreateFolder()`, `useRenameFolder()`, `useDeleteFolder()`
  - `folderQueryKeys = { all: ['folders'], list: () => ['folders','list'] }`

- [ ] **Step 1: 타입 정의**

`lib/types/api/folders.types.ts`:

```ts
// @see public.folders (supabase/migrations/0011)
export type Folder = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
};
export type CreateFolderRequest = { name: string };
export type RenameFolderRequest = { id: string; name: string };
```

`lib/types/api/index.ts`에 `export type * from './folders.types';` 추가.

- [ ] **Step 2: 상수 추가**

`lib/constants.ts`의 `TABLE`에 `FOLDERS: 'folders',` 추가(맛집 테이블은 Task 6에서 `SAVED_PLACES` 추가).

- [ ] **Step 3: API 함수 작성 (DB row snake_case → 도메인 camelCase 매핑)**

`lib/api/folders.ts`:

```ts
import { TABLE } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type { Folder } from '../types/api';
import { assertNoError, unwrap } from './unwrap';

type FolderRow = { id: string; name: string; owner_id: string; created_at: string };
const toFolder = (r: FolderRow): Folder => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  createdAt: r.created_at,
});

export async function listFolders(): Promise<Folder[]> {
  const rows = unwrap<FolderRow[]>(
    await supabase.from(TABLE.FOLDERS).select('id,name,owner_id,created_at').order('created_at'),
  );
  return (rows ?? []).map(toFolder);
}

export async function createFolder(name: string): Promise<Folder> {
  const { data } = await supabase.auth.getUser();
  const ownerId = data.user?.id;
  if (!ownerId) throw new Error(MESSAGES.LOGIN_REQUIRED);
  const row = unwrap<FolderRow>(
    await supabase
      .from(TABLE.FOLDERS)
      .insert({ name, owner_id: ownerId })
      .select('id,name,owner_id,created_at')
      .single(),
  );
  if (!row) throw new Error(MESSAGES.FOLDER_SAVE_FAILED);
  return toFolder(row);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  assertNoError(await supabase.from(TABLE.FOLDERS).update({ name }).eq('id', id));
}

export async function deleteFolder(id: string): Promise<void> {
  assertNoError(await supabase.from(TABLE.FOLDERS).delete().eq('id', id));
}
```

`lib/messages.ts`에 `FOLDER_SAVE_FAILED: '폴더 저장에 실패했습니다.'`를 추가하고, `lib/api/index.ts`에 `export * from './folders';` 추가.

- [ ] **Step 4: 쿼리/뮤테이션 훅 작성**

`lib/hooks/queries/useFoldersQueries.ts`:

```ts
'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { listFolders } from '../../api';
import type { Folder } from '../../types/api';

export const folderQueryKeys = {
  all: ['folders'] as const,
  list: () => ['folders', 'list'] as const,
};

export const useFolders = (options?: Partial<UseQueryOptions<Folder[]>>) =>
  useQuery<Folder[]>({
    queryKey: folderQueryKeys.list(),
    queryFn: listFolders,
    ...options,
  });
```

`lib/hooks/mutations/useFoldersMutations.ts`:

```ts
'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { createFolder, deleteFolder, renameFolder } from '../../api';
import { folderQueryKeys } from '../queries';
import type { CreateFolderRequest, Folder, RenameFolderRequest } from '../../types/api';

export const useCreateFolder = (
  options?: UseMutationOptions<Folder, Error, CreateFolderRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: CreateFolderRequest) => createFolder(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: folderQueryKeys.all }),
    ...options,
  });
};

export const useRenameFolder = (options?: UseMutationOptions<void, Error, RenameFolderRequest>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: RenameFolderRequest) => renameFolder(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: folderQueryKeys.all }),
    ...options,
  });
};

export const useDeleteFolder = (options?: UseMutationOptions<void, Error, string>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: folderQueryKeys.all }),
    ...options,
  });
};
```

`lib/hooks/queries/index.ts`·`lib/hooks/mutations/index.ts` 배럴에 각각 추가.

- [ ] **Step 5: API 함수 테스트**

`lib/api/folders.test.ts` (supabaseClient 모킹, 매핑·에러 승격 검증). 대표 케이스:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn(), auth: { getUser: vi.fn() } } }));
import { supabase } from '../supabaseClient';
import { listFolders } from './folders';

const from = supabase.from as ReturnType<typeof vi.fn>;
beforeEach(() => from.mockReset());

describe('listFolders', () => {
  it('row를 도메인 형태로 매핑한다', async () => {
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'f1', name: '내 맛집', owner_id: 'me', created_at: 't' }],
          error: null,
        }),
      }),
    });
    expect(await listFolders()).toEqual([
      { id: 'f1', name: '내 맛집', ownerId: 'me', createdAt: 't' },
    ]);
  });
});
```

- [ ] **Step 6: 검증·커밋**

Run: `npx vitest run lib/api/folders.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add lib/types/api/folders.types.ts lib/api/folders.ts lib/hooks/queries/useFoldersQueries.ts lib/hooks/mutations/useFoldersMutations.ts lib/api/folders.test.ts lib/constants.ts lib/messages.ts lib/types/api/index.ts lib/api/index.ts lib/hooks/queries/index.ts lib/hooks/mutations/index.ts
git commit -m "feat: folders 데이터 레이어(타입·API·훅) 추가"
```

---

### Task 6: saved_places 데이터 레이어 (타입·API·훅)

**Files:**

- Create: `lib/types/api/savedPlaces.types.ts`
- Create: `lib/api/savedPlaces.ts`
- Create: `lib/hooks/queries/useSavedPlacesQueries.ts`
- Create: `lib/hooks/mutations/useSavedPlacesMutations.ts`
- Create: `lib/api/savedPlaces.test.ts`
- Modify: 각 배럴 index, `lib/constants.ts`(`TABLE.SAVED_PLACES`, `ON_CONFLICT.SAVED_PLACES`)

**Interfaces:**

- Consumes: `supabase`, `unwrap`/`assertNoError`, `getCurrentUser`, `folderQueryKeys`.
- Produces:
  - `SavedPlace = { id; folderId; placeId; name; lat; lng; address: string|null; memo: string|null; createdAt }`
  - `AddSavedPlaceRequest = { folderId; placeId; name; lat; lng; address: string|null; memo?: string|null }`
  - `listSavedPlaces(folderId): Promise<SavedPlace[]>`
  - `addSavedPlace(req): Promise<void>`
  - `updateSavedPlaceMemo(id, memo): Promise<void>`
  - `deleteSavedPlace(id): Promise<void>`
  - 훅 `useSavedPlaces(folderId)`, `useAddSavedPlace()`, `useUpdateSavedPlaceMemo()`, `useDeleteSavedPlace()`
  - `savedPlaceQueryKeys = { all:['savedPlaces'], byFolder:(folderId)=>['savedPlaces', folderId] }`

- [ ] **Step 1: 타입**

`lib/types/api/savedPlaces.types.ts`:

```ts
// @see public.saved_places (supabase/migrations/0011)
export type SavedPlace = {
  id: string;
  folderId: string;
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  memo: string | null;
  createdAt: string;
};
export type AddSavedPlaceRequest = {
  folderId: string;
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  memo?: string | null;
};
export type UpdateSavedPlaceMemoRequest = { id: string; memo: string | null };
```

배럴 추가.

- [ ] **Step 2: 상수**

`lib/constants.ts`의 `TABLE`에 `SAVED_PLACES: 'saved_places',`, `ON_CONFLICT`에 `SAVED_PLACES: 'folder_id,place_id',` 추가.

- [ ] **Step 3: API 함수**

`lib/api/savedPlaces.ts`:

```ts
import { ON_CONFLICT, TABLE } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type { AddSavedPlaceRequest, SavedPlace } from '../types/api';
import { assertNoError, unwrap } from './unwrap';

type SavedPlaceRow = {
  id: string;
  folder_id: string;
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  memo: string | null;
  created_at: string;
};
const COLS = 'id,folder_id,place_id,name,lat,lng,address,memo,created_at';
const toSavedPlace = (r: SavedPlaceRow): SavedPlace => ({
  id: r.id,
  folderId: r.folder_id,
  placeId: r.place_id,
  name: r.name,
  lat: r.lat,
  lng: r.lng,
  address: r.address,
  memo: r.memo,
  createdAt: r.created_at,
});

export async function listSavedPlaces(folderId: string): Promise<SavedPlace[]> {
  const rows = unwrap<SavedPlaceRow[]>(
    await supabase
      .from(TABLE.SAVED_PLACES)
      .select(COLS)
      .eq('folder_id', folderId)
      .order('created_at'),
  );
  return (rows ?? []).map(toSavedPlace);
}

export async function addSavedPlace(req: AddSavedPlaceRequest): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const createdBy = data.user?.id;
  if (!createdBy) throw new Error(MESSAGES.LOGIN_REQUIRED);
  // 같은 폴더에 같은 가게가 이미 있으면 조용히 성공 처리(중복 저장 방지, 사용자에겐 저장됨으로 보인다).
  assertNoError(
    await supabase.from(TABLE.SAVED_PLACES).upsert(
      {
        folder_id: req.folderId,
        place_id: req.placeId,
        name: req.name,
        lat: req.lat,
        lng: req.lng,
        address: req.address,
        memo: req.memo ?? null,
        created_by: createdBy,
      },
      { onConflict: ON_CONFLICT.SAVED_PLACES, ignoreDuplicates: true },
    ),
  );
}

export async function updateSavedPlaceMemo(id: string, memo: string | null): Promise<void> {
  assertNoError(await supabase.from(TABLE.SAVED_PLACES).update({ memo }).eq('id', id));
}

export async function deleteSavedPlace(id: string): Promise<void> {
  assertNoError(await supabase.from(TABLE.SAVED_PLACES).delete().eq('id', id));
}
```

배럴에 `export * from './savedPlaces';`.

- [ ] **Step 4: 훅**

`lib/hooks/queries/useSavedPlacesQueries.ts`:

```ts
'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { listSavedPlaces } from '../../api';
import type { SavedPlace } from '../../types/api';

export const savedPlaceQueryKeys = {
  all: ['savedPlaces'] as const,
  byFolder: (folderId: string | null) => ['savedPlaces', folderId] as const,
};

export const useSavedPlaces = (
  folderId: string | null,
  options?: Partial<UseQueryOptions<SavedPlace[]>>,
) =>
  useQuery<SavedPlace[]>({
    queryKey: savedPlaceQueryKeys.byFolder(folderId),
    queryFn: () => listSavedPlaces(folderId!),
    enabled: Boolean(folderId),
    ...options,
  });
```

`lib/hooks/mutations/useSavedPlacesMutations.ts`:

```ts
'use client';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { addSavedPlace, deleteSavedPlace, updateSavedPlaceMemo } from '../../api';
import { savedPlaceQueryKeys } from '../queries';
import type { AddSavedPlaceRequest, UpdateSavedPlaceMemoRequest } from '../../types/api';

export const useAddSavedPlace = (
  options?: UseMutationOptions<void, Error, AddSavedPlaceRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AddSavedPlaceRequest) => addSavedPlace(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedPlaceQueryKeys.all }),
    ...options,
  });
};

export const useUpdateSavedPlaceMemo = (
  options?: UseMutationOptions<void, Error, UpdateSavedPlaceMemoRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memo }: UpdateSavedPlaceMemoRequest) => updateSavedPlaceMemo(id, memo),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedPlaceQueryKeys.all }),
    ...options,
  });
};

export const useDeleteSavedPlace = (options?: UseMutationOptions<void, Error, string>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedPlace(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedPlaceQueryKeys.all }),
    ...options,
  });
};
```

배럴 추가.

- [ ] **Step 5: API 테스트**

`lib/api/savedPlaces.test.ts`: `listSavedPlaces` 매핑, `addSavedPlace`가 `upsert`에 `onConflict:'folder_id,place_id'`+`ignoreDuplicates:true`로 호출되는지, 로그인 없으면 던지는지 검증(supabaseClient 모킹).

- [ ] **Step 6: 검증·커밋**

Run: `npx vitest run lib/api/savedPlaces.test.ts && npm run typecheck && npm run lint`

```bash
git add lib/types/api/savedPlaces.types.ts lib/api/savedPlaces.ts lib/hooks/queries/useSavedPlacesQueries.ts lib/hooks/mutations/useSavedPlacesMutations.ts lib/api/savedPlaces.test.ts lib/constants.ts lib/types/api/index.ts lib/api/index.ts lib/hooks/queries/index.ts lib/hooks/mutations/index.ts
git commit -m "feat: saved_places 데이터 레이어(타입·API·훅) 추가"
```

---

### Task 7: `/places` 라우트 + 로그인 게이트 + 폴더 관리 UI

**Files:**

- Create: `app/places/page.tsx`
- Create: `app/places/page.module.css` (Codex 레인에서 스타일)
- Create: `components/FolderList.tsx` (+ `.module.css`)
- Create: `app/places/page.test.tsx`, `components/FolderList.test.tsx`
- Modify: `app/page.tsx` (헤더에 "내 맛집 지도" 링크, 로그인 시), `lib/constants.ts`(`ROUTES.PLACES = '/places'`)

**Interfaces:**

- Consumes: `useAuth`(로그인 여부), `useFolders`/`useCreateFolder`/`useRenameFolder`/`useDeleteFolder`.
- Produces: 로그인 사용자에게 폴더 목록·생성·이름변경·삭제 UI와 선택된 폴더 상태를 제공하는 페이지. 선택된 폴더 id를 Task 8의 지도에 넘긴다.

- [ ] **Step 1: 라우트 상수·헤더 링크**

`lib/constants.ts`의 `ROUTES`에 `PLACES: '/places',` 추가. `app/page.tsx` 헤더에서 로그인 상태일 때 `<Link href={ROUTES.PLACES}>내 맛집 지도</Link>`를 노출한다(비로그인은 안 보임). `app/page.test.tsx`에 "로그인 시 내 맛집 지도 링크 노출" 단언 추가.

- [ ] **Step 2: 로그인 게이트 페이지 스캐폴드 (실패 테스트 먼저)**

`app/places/page.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));
// 지도 컴포넌트는 SDK를 타므로 모킹(Task 8에서 실제 구현)
vi.mock('../../components/SavedPlacesMap', () => ({ default: () => null }));
import { useAuth } from '../../lib/hooks/useAuth';
import { renderWithQuery } from '../../tests/renderWithQuery';
import PlacesPage from './page';

const auth = useAuth as ReturnType<typeof vi.fn>;
beforeEach(() => auth.mockReset());

describe('맛집 지도 페이지', () => {
  it('로그인하지 않았으면 로그인 유도를 보여준다', () => {
    auth.mockReturnValue({ ready: true, isLoggedIn: false });
    renderWithQuery(<PlacesPage />);
    expect(screen.getByRole('link', { name: /로그인/ })).toHaveAttribute('href', '/login');
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run app/places/page.test.tsx`
Expected: FAIL(모듈 없음).

- [ ] **Step 4: 페이지 구현 (로직)**

`app/places/page.tsx` — `'use client'`. `useAuth()`로 `isLoggedIn` 확인. 비로그인이면 로그인 링크(`ROUTES.LOGIN`)만 보여준다. 로그인이면 `<FolderList onSelect={setSelectedFolderId} selectedId={...} />`와 `<SavedPlacesMap folderId={selectedFolderId} canEdit={true} />`(Task 8)를 렌더한다. 선택 폴더 id를 `useState`로 들고, 폴더 목록 로딩 후 첫 폴더를 기본 선택한다.

`components/FolderList.tsx` — `useFolders()`로 목록 표시, `useCreateFolder`(입력+버튼), 각 폴더에 선택/이름변경/삭제. 삭제는 되돌릴 수 없으므로 네이티브 `<dialog>` 확인(기존 RatingControls 제외 확인 패턴 재사용). 문구는 `lib/messages.ts`.

- [ ] **Step 5: 통과 확인 + 폴더 CRUD 테스트**

`components/FolderList.test.tsx`: 목록 렌더, 생성 시 mutation 호출, 삭제 확인 대화 흐름(확인 전 미삭제/취소/확인). supabase는 모킹.

Run: `npx vitest run app/places/page.test.tsx components/FolderList.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: 스타일링 (Codex 레인)**

`app/places/page.module.css`·`components/FolderList.module.css`를 기존 토큰(`app/globals.css`)과 로그인/모달 패턴에 맞춰 채운다. CLAUDE.md FE 디자인 레인 정책에 따라 Codex(GPT-5.6)에 위임하고 결과를 재검증한다. 마크업·문자열·역할은 바꾸지 않는다.

- [ ] **Step 7: 검증·커밋**

Run: `npm test && npm run lint && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_GOOGLE_MAPS_KEY=dummy npm run build`

```bash
git add -A
git commit -m "feat: /places 라우트와 폴더 관리 UI 추가"
```

---

### Task 8: 저장 맛집 지도(핀)+목록 + 상세(메모 수정·삭제)

**Files:**

- Create: `components/SavedPlacesMap.tsx` (+ `.module.css`)
- Create: `components/SavedPlacesMap.test.tsx`
- (재사용) `components/Map.tsx`의 SDK 로딩 유틸(`waitForMapsSdk`)을 `lib/googleMaps.ts`로 추출해 공유하는 것을 권장. 추출 시 `components/Map.tsx`도 그 유틸을 import하도록 수정.

**Interfaces:**

- Consumes: `useSavedPlaces(folderId)`, `useUpdateSavedPlaceMemo`, `useDeleteSavedPlace`, Google Maps SDK, `googleMapsPlaceUrl`(기존 `lib/constants.ts`).
- Produces: 선택 폴더의 저장 맛집을 지도 핀 + 목록으로 표시하고, 항목 선택 시 상세(이름·주소·메모·지도링크)와 editor 액션(메모 수정·삭제)을 제공하는 컴포넌트. props: `{ folderId: string | null; canEdit: boolean }`.

- [ ] **Step 1: SDK 로더 공유 유틸 추출 (선택이지만 권장)**

`components/Map.tsx`의 `waitForMapsSdk`와 스크립트 상수를 `lib/googleMaps.ts`로 옮기고, `Map.tsx`와 `SavedPlacesMap.tsx`가 함께 쓴다. 추출 후 `npx vitest run components/Map.test.tsx`로 기존 지도 테스트가 여전히 통과하는지 확인한다.

- [ ] **Step 2: 실패 테스트 먼저**

`components/SavedPlacesMap.test.tsx`: `useSavedPlaces`를 모킹해 두 개의 저장 맛집을 돌려주고, 목록에 이름 두 개가 뜨는지, 항목 클릭 시 상세(주소·메모·지도 링크)가 뜨는지, `canEdit=false`면 메모 수정/삭제 버튼이 없는지 검증. Google 지도 SDK는 `components/Map.test.tsx`의 모킹 방식(전역 `google.maps.importLibrary` + Map/Marker 목)을 그대로 따른다.

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run components/SavedPlacesMap.test.tsx`
Expected: FAIL(모듈 없음).

- [ ] **Step 4: 구현 (로직)**

`components/SavedPlacesMap.tsx` — `'use client'`. `useSavedPlaces(folderId)`로 맛집을 받아 각 좌표에 `google.maps.Marker`를 찍는다(폴더 바뀌면 이전 마커 제거 후 다시 그림). 목록 항목/핀 클릭 시 선택 상태로 상세를 연다. 상세: 이름(h3), 주소(`displayAddress`), 메모, "메뉴·리뷰 자세히 보기"(`googleMapsPlaceUrl`). `canEdit`이면 메모 편집(textarea + 저장, `useUpdateSavedPlaceMemo`)과 삭제(확인 `<dialog>` + `useDeleteSavedPlace`)를 노출한다. 문구·라벨은 `lib/messages.ts`. 지도 로드 실패·빈 폴더 상태 메시지 포함.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run components/SavedPlacesMap.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: 스타일링 (Codex 레인)**

`components/SavedPlacesMap.module.css`를 기존 지도/카드 토큰에 맞춰 채운다(지도 높이·목록·상세 카드). Codex 레인 위임 후 재검증. 마크업·역할·문자열 유지.

- [ ] **Step 7: 검증·커밋**

Run: `npm test && npm run lint && (env) npm run build`

```bash
git add -A
git commit -m "feat: 저장 맛집 지도(핀)+목록+상세(메모·삭제) 추가"
```

---

### Task 9: 저장 진입점 ① — 추천 카드의 "폴더에 저장"

**Files:**

- Create: `components/SaveToFolderButton.tsx` (+ `.module.css`)
- Create: `components/SaveToFolderButton.test.tsx`
- Modify: `components/Recommend.tsx` (결과 카드에 버튼 배치, 로그인 사용자에게만)

**Interfaces:**

- Consumes: `useFolders`, `useAddSavedPlace`, `useAuth`(로그인 여부).
- Produces: 추천 결과(가게)를 폴더에 저장하는 버튼/모달. 저장 시 추천 결과의 `placeId,name,lat,lng,address`를 스냅샷해 `addSavedPlace`로 넣는다.

- [ ] **Step 1: 실패 테스트 먼저**

`components/SaveToFolderButton.test.tsx`: 폴더 목록을 모킹하고, 버튼 클릭 → 폴더 선택 → 저장 시 `useAddSavedPlace`의 mutate가 스냅샷(placeId/name/lat/lng/address/folderId)으로 호출되는지 검증. 폴더가 없으면 "폴더를 먼저 만드세요" 유도.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run components/SaveToFolderButton.test.tsx`
Expected: FAIL.

- [ ] **Step 3: 구현**

`components/SaveToFolderButton.tsx` — props: `{ place: { placeId; name; lat; lng; address: string|null } }`. 네이티브 `<dialog>`로 폴더 선택(라디오/목록) + 저장. `useAddSavedPlace().mutate({ folderId, ...place })`. 성공 시 "저장했어요" 상태. 폴더 0개면 안내(폴더 관리로 링크). 문구는 `lib/messages.ts`.

`components/Recommend.tsx` — 결과 카드(`styles.result`) 안, `canRate`가 true인(로그인) 경우에만 `<SaveToFolderButton place={{ placeId: result.placeId, name: result.name, lat: result.lat, lng: result.lng, address: result.address }} />`를 배치한다. `Result` 타입에 `lat`·`lng`가 없으면(현재 `Candidate`에는 distanceMeters만 있음) `mergeCandidates` 후보에 `lat`·`lng`를 통과시키도록 `NearbyRestaurant`에서 이미 오는 값을 `Result`에 포함한다. (nearby 응답에 lat/lng가 있으므로 mergeCandidates 반환 타입과 `Result`에 `lat: number; lng: number`를 더한다.)

> 실행자 주의: 추천 후보의 좌표가 `Result`까지 전달되는지 확인한다. `NearbyRestaurant`에는 `lat`,`lng`가 있으나 `mergeCandidates` 반환 타입/`Result`에 누락돼 있으면 추가한다(스냅샷에 필수).

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run components/SaveToFolderButton.test.tsx components/Recommend.test.tsx && npm run typecheck`
Expected: PASS. Recommend 테스트에 저장 버튼 관련 회귀가 있으면 로그인/비로그인 분기에 맞춰 조정.

- [ ] **Step 5: 스타일링 (Codex 레인) + 검증·커밋**

Run: `npm test && npm run lint && (env) npm run build`

```bash
git add -A
git commit -m "feat: 추천 카드에서 폴더에 저장 추가"
```

---

### Task 10: 저장 진입점 ② — 맛집 지도에서 장소 검색해 추가

**Files:**

- Modify: `components/SavedPlacesMap.tsx` (검색 입력 + 결과를 현재 폴더에 추가)
- Modify: `components/SavedPlacesMap.test.tsx`
- (재사용) 기존 `geocode` Edge Function과 `useGeocode` 훅. geocode는 좌표만 주므로, 이름/주소가 필요하면 입력한 텍스트를 name으로 쓰고 address는 입력값 또는 null로 둔다.

**Interfaces:**

- Consumes: `useGeocode`(기존), `useAddSavedPlace`.
- Produces: 검색어로 좌표를 얻어 현재 폴더에 맛집으로 추가하는 흐름.

- [ ] **Step 1: 실패 테스트 먼저**

`SavedPlacesMap.test.tsx`에 케이스 추가: `canEdit=true`에서 검색 입력에 텍스트를 넣고 검색 → `useGeocode`가 좌표를 돌려주면 → 그 좌표로 `useAddSavedPlace`가 호출되는지 검증. `placeId`는 좌표 기반 합성 키(예: `manual:{lat},{lng}`)로 둔다(Google placeId가 없으므로).

- [ ] **Step 2: 실패 확인 → 구현**

`SavedPlacesMap.tsx`에 검색 폼 추가(`canEdit`일 때만). 제출 시 `useGeocode().mutate(query, { onSuccess: (coords) => addSavedPlace({ folderId, placeId: 'manual:'+coords.lat+','+coords.lng, name: query, lat: coords.lat, lng: coords.lng, address: null }) })`. 성공 시 목록·지도 갱신(무효화). 실패 문구는 서버 메시지(`errorMessage`).

> 실행자 주의: 좌표 기반 `place_id`(`manual:...`)는 폴더 내 유니크(folder_id,place_id)와 충돌하지 않도록 소수점 자리수를 고정(예: 6자리)해 같은 지점 재추가 시 중복 방지가 동작하게 한다.

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run components/SavedPlacesMap.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: 스타일링(Codex 레인) + 검증·커밋**

Run: `npm test && npm run lint && (env) npm run build`

```bash
git add -A
git commit -m "feat: 맛집 지도에서 장소 검색으로 추가"
```

---

## 배포 (Phase 1 완료 후)

1. 마이그레이션 적용: `npx supabase db push` (0010, 0011)
2. Edge Function 변경 없음(배포 불필요).
3. 프론트는 머지 시 Vercel 자동 배포.
4. DB 검증: 배포 전 로컬에서 `npx supabase db reset && npx supabase test db` 통과 확인.

## 근거 스펙

- [맛집 지도(저장·폴더·공유) 설계](../specs/2026-08-08-saved-places-map-design.md)

## Phase 2 (별도 계획)

초대코드 발급(`create_folder_invite`)·참여(`join_folder_by_code`)·`folder_members`/`folder_invites` 테이블·뷰어/에디터 RLS 확장·공유 UI는 Phase 1이 머지된 뒤 별도 계획으로 작성한다. Phase 1의 folders/saved_places RLS를 "소유자 전용"에서 "소유자 or 멤버(권한별)"로 넓히는 것이 핵심 변경이다.

```

```
