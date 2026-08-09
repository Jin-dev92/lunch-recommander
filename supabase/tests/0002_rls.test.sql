begin;
select plan(5);
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.restaurants(place_id,name,category,lat,lng) values ('p1','식당','한식',37,127);
insert into public.ratings(user_id,place_id,score) values ('00000000-0000-0000-0000-000000000002','p1',5);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select count(*) from public.api_usage$$,
  '42501', null, 'api_usage select blocked for authenticated'
);
select throws_ok(
  $$insert into public.api_usage(user_id, ip, window_start) values ('00000000-0000-0000-0000-000000000001','127.0.0.1','2026-01-01')$$,
  '42501', null, 'api_usage insert blocked for authenticated'
);

-- 그룹 폐기 후 ratings_select는 본인 전용. ...002의 평점이 ...001에게 안 보여야 한다.
-- (restaurants 'p1' 행과 두 사용자 셋업은 위 블록을 재사용한다.)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into public.ratings (user_id, place_id, score)
  values ('00000000-0000-0000-0000-000000000002', 'p1', 5)
  on conflict do nothing;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is_empty(
  $$ select 1 from public.ratings where user_id = '00000000-0000-0000-0000-000000000002' $$,
  'ratings: 다른 사용자의 평점은 조회되지 않는다'
);

reset role;
insert into public.profiles(id, display_name) values
  ('00000000-0000-0000-0000-000000000001','u1'),
  ('00000000-0000-0000-0000-000000000002','u2'),
  ('00000000-0000-0000-0000-000000000003','u3');
insert into public.ratings(user_id,place_id,score) values ('00000000-0000-0000-0000-000000000003','p1',1);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is((select count(*)::integer from public.ratings), 1, 'ratings: 그룹 없이도 본인 평점만 조회된다');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.profiles), 1, 'profiles: 본인 프로필만 조회된다');

select * from finish();
rollback;
