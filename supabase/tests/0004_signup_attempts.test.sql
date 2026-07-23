begin;
select plan(12);

select has_table('public', 'signup_attempts', 'signup_attempts exists');
select col_is_pk('public', 'signup_attempts', 'id', 'id is primary key');
select col_type_is('public', 'signup_attempts', 'ip', 'inet', 'ip is inet');
select col_not_null('public', 'signup_attempts', 'ip', 'ip is required');
select col_type_is('public', 'signup_attempts', 'email', 'text', 'email is text');
select col_not_null('public', 'signup_attempts', 'email', 'email is required');
select col_has_default('public', 'signup_attempts', 'created_at', 'created_at has a default');
select is(
  (select relrowsecurity from pg_class where oid = 'public.signup_attempts'::regclass),
  true,
  'RLS is enabled'
);

select lives_ok(
  $$insert into public.signup_attempts(ip, email) values ('127.0.0.1', 'dup@example.com')$$,
  'service_role can insert repeated attempts for the same ip/email'
);
select lives_ok(
  $$insert into public.signup_attempts(ip, email) values ('127.0.0.1', 'dup@example.com')$$,
  'a second attempt for the same ip/email is not blocked by any uniqueness constraint'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.signup_attempts$$,
  '42501', null, 'anon cannot select signup attempts'
);

reset role;
set local role authenticated;
select throws_ok(
  $$insert into public.signup_attempts(ip, email) values ('127.0.0.1', 'anon@example.com')$$,
  '42501', null, 'authenticated cannot insert signup attempts'
);

select * from finish();
rollback;
