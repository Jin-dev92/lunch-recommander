begin;
select plan(16);
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'restaurants', 'restaurants exists');
select has_table('public', 'ratings', 'ratings exists');
select has_table('public', 'category_prefs', 'category_prefs exists');
select has_table('public', 'api_usage', 'api_usage exists');
select has_column('public', 'ratings', 'snoozed_until', 'ratings snooze exists');
select col_type_is('public', 'ratings', 'snoozed_until', 'timestamp with time zone', 'snooze is timestamptz');
select col_is_pk('public', 'ratings', array['user_id', 'place_id'], 'ratings pk is (user_id, place_id)');
select col_is_pk('public', 'category_prefs', array['user_id', 'category'], 'category_prefs pk is (user_id, category)');
select has_column('public', 'ratings', 'score', 'ratings score exists');
select col_type_is('public', 'ratings', 'score', 'smallint', 'score is smallint');

-- fixtures for score range check(FK 부모 행 필요)
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
insert into public.restaurants (place_id, name, category, lat, lng)
  values ('test-place-1', 'Test Restaurant', 'korean', 37.5, 127.0);

select lives_ok(
  $$insert into public.ratings (user_id, place_id, score) values ('00000000-0000-0000-0000-000000000001', 'test-place-1', 0)$$,
  'score 0 is accepted'
);
delete from public.ratings where user_id = '00000000-0000-0000-0000-000000000001' and place_id = 'test-place-1';
select lives_ok(
  $$insert into public.ratings (user_id, place_id, score) values ('00000000-0000-0000-0000-000000000001', 'test-place-1', 1)$$,
  'score 1 is accepted'
);
delete from public.ratings where user_id = '00000000-0000-0000-0000-000000000001' and place_id = 'test-place-1';
select lives_ok(
  $$insert into public.ratings (user_id, place_id, score) values ('00000000-0000-0000-0000-000000000001', 'test-place-1', 5)$$,
  'score 5 is accepted'
);
delete from public.ratings where user_id = '00000000-0000-0000-0000-000000000001' and place_id = 'test-place-1';
select throws_ok(
  $$insert into public.ratings (user_id, place_id, score) values ('00000000-0000-0000-0000-000000000001', 'test-place-1', 6)$$,
  '23514',
  null,
  'score 6 is rejected'
);
select throws_ok(
  $$insert into public.ratings (user_id, place_id, score) values ('00000000-0000-0000-0000-000000000001', 'test-place-1', -1)$$,
  '23514',
  null,
  'score -1 is rejected'
);

select * from finish();
rollback;
