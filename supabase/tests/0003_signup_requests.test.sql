begin;
select plan(16);

select has_table('public', 'signup_requests', 'signup_requests exists');
select col_is_pk('public', 'signup_requests', 'id', 'id is primary key');
select col_type_is('public', 'signup_requests', 'email', 'text', 'email is text');
select col_not_null('public', 'signup_requests', 'email', 'email is required');
select col_type_is('public', 'signup_requests', 'request_ip', 'inet', 'request_ip is inet');
select col_not_null('public', 'signup_requests', 'request_ip', 'request_ip is required');
select col_is_unique('public', 'signup_requests', 'token', 'token is unique');
select col_not_null('public', 'signup_requests', 'expires_at', 'expires_at is required');
select col_has_default('public', 'signup_requests', 'status', 'status has a default');
select col_has_default('public', 'signup_requests', 'created_at', 'created_at has a default');
select is(
  (select relrowsecurity from pg_class where oid = 'public.signup_requests'::regclass),
  true,
  'RLS is enabled'
);
select throws_ok(
  $$insert into public.signup_requests(email, request_ip, token, status, expires_at)
    values ('bad@example.com', '127.0.0.1', 'bad-status-token', 'unknown', now() + interval '3 days')$$,
  '23514', null, 'unknown status is rejected'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.signup_requests$$,
  '42501', null, 'anon cannot select signup requests'
);
select throws_ok(
  $$insert into public.signup_requests(email, request_ip, token, expires_at)
    values ('anon@example.com', '127.0.0.1', 'anon-token', now() + interval '3 days')$$,
  '42501', null, 'anon cannot insert signup requests'
);

reset role;
set local role authenticated;
select throws_ok(
  $$select count(*) from public.signup_requests$$,
  '42501', null, 'authenticated cannot select signup requests'
);
select throws_ok(
  $$update public.signup_requests set status = 'approved'$$,
  '42501', null, 'authenticated cannot update signup requests'
);

select * from finish();
rollback;
