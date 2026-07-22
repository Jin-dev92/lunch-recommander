alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.restaurants enable row level security;
alter table public.ratings enable row level security;
alter table public.category_prefs enable row level security;
alter table public.api_usage enable row level security;

grant select, insert, update, delete on
  public.profiles, public.groups, public.group_members,
  public.restaurants, public.ratings, public.category_prefs
  to authenticated;

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

-- group_members_select cannot check membership via a plain self-join subquery on
-- group_members (its own table): Postgres re-applies this same policy while
-- evaluating the subquery, causing "infinite recursion detected in policy for
-- relation group_members". Wrapping the lookup in a security definer function
-- (owned by a role that bypasses RLS) breaks the recursion, same pattern as
-- shares_group_with above.
create function public.my_group_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select group_id from public.group_members where user_id = auth.uid();
$$;
revoke all on function public.my_group_ids() from public;
grant execute on function public.my_group_ids() to authenticated;

create policy group_members_select on public.group_members for select to authenticated using (
  group_id in (select public.my_group_ids())
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
