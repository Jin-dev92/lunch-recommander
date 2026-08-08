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
