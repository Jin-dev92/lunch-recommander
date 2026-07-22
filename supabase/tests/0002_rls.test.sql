begin;
select plan(28);
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.restaurants(place_id,name,category,lat,lng) values ('p1','식당','한식',37,127);
insert into public.ratings(user_id,place_id,score) values ('00000000-0000-0000-0000-000000000002','p1',5);

-- holds the group_id/invite_code returned by create_group so later assertions can reuse it
create temporary table t_group(group_id uuid, invite_code text);
grant select, insert on t_group to authenticated;

-- SECURITY DEFINER RPCs must never be executable by PUBLIC or anon, only by
-- authenticated. If this regresses, unauthenticated clients could probe
-- RLS-protected data (group membership, ratings) through these functions.
select function_privs_are('public', 'my_group_ids', array[]::name[], 'public', array[]::name[], 'my_group_ids: PUBLIC has no execute');
select function_privs_are('public', 'my_group_ids', array[]::name[], 'anon', array[]::name[], 'my_group_ids: anon has no execute');
select function_privs_are('public', 'my_group_ids', array[]::name[], 'authenticated', array['EXECUTE'], 'my_group_ids: authenticated can execute');

select function_privs_are('public', 'shares_group_with', array['uuid'], 'public', array[]::name[], 'shares_group_with: PUBLIC has no execute');
select function_privs_are('public', 'shares_group_with', array['uuid'], 'anon', array[]::name[], 'shares_group_with: anon has no execute');
select function_privs_are('public', 'shares_group_with', array['uuid'], 'authenticated', array['EXECUTE'], 'shares_group_with: authenticated can execute');

select function_privs_are('public', 'join_group_by_code', array['text'], 'public', array[]::name[], 'join_group_by_code: PUBLIC has no execute');
select function_privs_are('public', 'join_group_by_code', array['text'], 'anon', array[]::name[], 'join_group_by_code: anon has no execute');
select function_privs_are('public', 'join_group_by_code', array['text'], 'authenticated', array['EXECUTE'], 'join_group_by_code: authenticated can execute');

select function_privs_are('public', 'create_group', array['text'], 'public', array[]::name[], 'create_group: PUBLIC has no execute');
select function_privs_are('public', 'create_group', array['text'], 'anon', array[]::name[], 'create_group: anon has no execute');
select function_privs_are('public', 'create_group', array['text'], 'authenticated', array['EXECUTE'], 'create_group: authenticated can execute');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.ratings), 0, 'unshared rating hidden');
select throws_ok(
  $$insert into public.group_members(group_id,user_id,role) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','member')$$,
  '42501', null, 'direct membership insert denied'
);
-- groups must only ever be created via create_group() (atomically creates
-- the group + admin membership); a direct client insert would produce an
-- orphan group with no admin, so authenticated has no INSERT grant at all.
select throws_ok(
  $$insert into public.groups(name, invite_code, created_by) values ('우회그룹','BYPASSCODE01','00000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'direct group insert denied'
);
select has_function('public', 'join_group_by_code', array['text'], 'join RPC exists');
select has_function('public', 'create_group', array['text'], 'create_group RPC exists');
select has_function('public', 'shares_group_with', array['uuid'], 'shares_group_with helper exists');

-- u1 creates a group; create_group must insert the group and the creator's admin membership atomically
select lives_ok(
  $$insert into t_group select * from public.create_group('테스트그룹')$$,
  'create_group succeeds for authenticated user'
);
select is(
  (select role from public.group_members where user_id = '00000000-0000-0000-0000-000000000001'),
  'admin', 'creator becomes group admin atomically'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select public.join_group_by_code('ZZZZZZZZZZZZ')$$,
  '22023', null, 'invalid invite code rejected'
);
select lives_ok(
  $$select public.join_group_by_code((select invite_code from t_group limit 1))$$,
  'valid invite code joins group'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.ratings), 1, 'group-mate rating visible after joining group');
select is((select count(*)::integer from public.group_members), 2, 'group_members select scoped to own group');
select throws_ok(
  $$select count(*) from public.api_usage$$,
  '42501', null, 'api_usage select blocked for authenticated'
);
select throws_ok(
  $$insert into public.api_usage(user_id, ip, window_start) values ('00000000-0000-0000-0000-000000000001','127.0.0.1','2026-01-01')$$,
  '42501', null, 'api_usage insert blocked for authenticated'
);

reset role;
insert into public.profiles(id, display_name) values
  ('00000000-0000-0000-0000-000000000001','u1'),
  ('00000000-0000-0000-0000-000000000002','u2'),
  ('00000000-0000-0000-0000-000000000003','u3');
insert into public.ratings(user_id,place_id,score) values ('00000000-0000-0000-0000-000000000003','p1',1);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is((select count(*)::integer from public.ratings), 1, 'user outside every shared group sees only own rating');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.profiles), 2, 'profiles scoped to self + group-sharing users');

select * from finish();
rollback;
