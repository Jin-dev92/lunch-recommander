begin;
select plan(7);
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');

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
-- auth.uid()는 request.jwt.claim.sub를 읽으므로, 소유권 검사를 통과시켜
-- 익명성 조건(not is_anonymous_user())만 단독으로 걸리도록 함께 맞춰준다.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-000000000003","is_anonymous":true}';
select throws_ok(
  $$ insert into public.folders (name, owner_id)
     values ('x', '00000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'folders: 익명 사용자는 삽입 불가'
);

-- 익명 사용자는 saved_places도 삽입 불가(001 폴더 대상, 소유권과 무관하게 익명성으로 차단).
select throws_ok(
  $$ insert into public.saved_places (folder_id, place_id, name, lat, lng, created_by)
     values ('11111111-1111-1111-1111-111111111111', 'p3', '익명 침입', 37.5, 127.0,
             '00000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'saved_places: 익명 사용자는 삽입 불가'
);

select * from finish();
rollback;
