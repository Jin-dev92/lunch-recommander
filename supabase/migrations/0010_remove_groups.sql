-- 그룹/초대코드 로직 폐기. 맛집 지도(폴더 공유)에서 초대코드 개념을 새로 구현하므로 옛 구조를 걷어낸다.
-- ratings_select가 shares_group_with에 의존하므로, 먼저 본인 전용으로 교체한 뒤 함수를 지운다.
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings for select to authenticated
  using (user_id = auth.uid());

-- profiles_select도 shares_group_with(id)에 의존한다(0002_rls.sql). 이걸 먼저 본인 전용으로
-- 바꿔두지 않으면 아래 shares_group_with drop이 의존성 에러로 실패한다. 프론트에 다른 사용자의
-- 프로필을 조회하는 코드가 없으므로 본인 전용으로 좁혀도 회귀가 없다.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid());

-- 그룹 관련 정책·함수·테이블 제거. group_members/groups는 cascade로 정책도 함께 사라진다.
drop function if exists public.create_group(text);
drop function if exists public.join_group_by_code(text);
drop function if exists public.shares_group_with(uuid);
-- groups와 group_members는 서로 순환 의존한다(groups 정책이 group_members를 참조하고,
-- group_members에는 groups를 향한 FK가 있다). 어느 쪽을 먼저 지워도 plain drop으로는
-- 풀리지 않으므로 cascade로 정책·제약을 함께 정리한다.
drop table if exists public.groups cascade;
drop table if exists public.group_members cascade;
drop function if exists public.my_group_ids();
