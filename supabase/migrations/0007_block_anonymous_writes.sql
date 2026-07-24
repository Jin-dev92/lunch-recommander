-- 로그인을 optional로 만들면서 방문자마다 Supabase 익명 세션을 발급한다. 익명 사용자는
-- authenticated 롤이라 기존 "to authenticated" 쓰기 정책이 그대로 적용된다. 즉 UI에서
-- 평가 버튼을 숨겨도 익명 사용자가 anon 키 + 익명 JWT로 DB에 직접 쓸 수 있다.
-- 그래서 RLS 자체에서 익명 사용자의 쓰기를 막는다(방어의 최종선).

-- 익명 여부는 JWT의 is_anonymous 클레임으로 판단한다. 실사용자는 false, 익명은 true다.
create or replace function public.is_anonymous_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- 평점: 익명 사용자는 남길 수 없다(읽기는 어차피 shares_group_with로 자기 것만 보이므로 그대로 둔다).
drop policy ratings_insert on public.ratings;
create policy ratings_insert on public.ratings for insert to authenticated
  with check (user_id = auth.uid() and not public.is_anonymous_user());
drop policy ratings_update on public.ratings;
create policy ratings_update on public.ratings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not public.is_anonymous_user());

-- 카테고리 기호: 동일하게 익명 쓰기 차단.
drop policy category_prefs_insert on public.category_prefs;
create policy category_prefs_insert on public.category_prefs for insert to authenticated
  with check (user_id = auth.uid() and not public.is_anonymous_user());
drop policy category_prefs_update on public.category_prefs;
create policy category_prefs_update on public.category_prefs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not public.is_anonymous_user());

-- 그룹 함수: auth.uid()는 익명도 값이 있으므로 별도로 익명을 막는다.
create or replace function public.join_group_by_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_group_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if public.is_anonymous_user() then raise exception 'login required' using errcode = '28000'; end if;
  select id into target_group_id from groups where invite_code = code;
  if target_group_id is null then raise exception 'invalid invite code' using errcode = '22023'; end if;
  insert into group_members(group_id,user_id,role) values(target_group_id,auth.uid(),'member') on conflict do nothing;
  return target_group_id;
end;
$$;

create or replace function public.create_group(group_name text)
returns table(group_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; new_code text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if public.is_anonymous_user() then raise exception 'login required' using errcode = '28000'; end if;
  new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12));
  insert into groups(name, invite_code, created_by) values (group_name, new_code, auth.uid()) returning id into new_id;
  insert into group_members(group_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return query select new_id, new_code;
end;
$$;
