-- 국내는 카카오, 해외는 Google로 장소를 받도록 restaurants를 확장한다.
-- 설계 근거: docs/superpowers/specs/2026-11-03-dual-provider-map-design.md
--
-- 0012가 드롭한 컬럼 일부를 되살린다. 삭제는 없다 — 기존 행은 기본값 'kakao'를 받고
-- Google 전용 컬럼은 null로 남는다. place_id에 접두사를 붙이지 않는 이유는 ratings와
-- saved_places가 이 값을 외래 키로 참조해 일괄 변경에 on update cascade가 필요하기 때문이다.
-- 카카오 id는 숫자 문자열, Google place id는 ChIJ로 시작해 형식이 겹치지 않으므로
-- provider 컬럼만으로 충분히 구분된다.

alter table public.restaurants
  add column provider text not null default 'kakao'
    check (provider in ('kakao', 'google')),
  -- 아래 셋은 Google 결과에만 값이 있다. 카카오 로컬 API에는 평점·리뷰·가격대가 없다.
  add column google_rating numeric(2,1) null
    check (google_rating between 0 and 5),
  add column google_ratings_total integer null
    check (google_ratings_total >= 0),
  add column price_level text null;

-- 캐시 조회가 provider + fetched_at으로 걸러지므로 함께 인덱싱한다.
create index restaurants_provider_fetched_at_idx
  on public.restaurants (provider, fetched_at desc);

comment on column public.restaurants.provider is
  '이 장소를 받은 제공자. 좌표가 국내면 kakao, 해외면 google이다. 캐시 조회를 provider별로 분리하는 기준이다.';
comment on column public.restaurants.category is
  '한국어 음식 종류("한식"). category_prefs.category와 짝을 이루는 저장 키다. 카카오는 category_name의 2단계, Google은 primaryType을 같은 값으로 매핑해 넣는다.';
comment on column public.restaurants.google_rating is
  'Google 평균 평점. 카카오 로컬 API에는 평점이 없어 국내 행은 null이다.';
comment on column public.restaurants.google_ratings_total is
  'Google 리뷰 수. 국내 행은 null이다. 평점 신뢰도 보정에 쓰인다.';
comment on column public.restaurants.price_level is
  'Google priceLevel 열거형. 4단계 등급이며 실제 가격이 아니다. 국내 행은 null이다.';
