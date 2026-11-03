-- 장소 데이터 출처를 Google Places에서 카카오 로컬 API로 전환한다.
-- 설계 근거: docs/superpowers/specs/2026-11-02-kakao-map-migration-design.md
--
-- ⚠️ 이 마이그레이션은 되돌릴 수 없는 삭제를 포함한다.
-- restaurants.place_id는 Google place id이고 카카오 장소 식별자는 완전히 다른 체계다.
-- ratings.place_id와 saved_places.place_id가 restaurants(place_id)를 참조하므로,
-- restaurants 행을 지우면 cascade로 사용자 별점·영구 제외·스누즈 기록과 저장한 맛집·메모가
-- 함께 삭제된다. restaurants 자체는 fetched_at 기준 15분 TTL 캐시라 데이터 가치가 없지만
-- 참조 테이블의 손실은 복구할 수 없다.

delete from public.restaurants;

-- 카카오 로컬 API 응답에는 평점·리뷰 수·가격 등급·사진이 없다. 네 컬럼은 채울 값이 사라졌다.
alter table public.restaurants
  drop column google_rating,
  drop column google_ratings_total,
  drop column price_level,
  drop column photo_name;

-- 카카오맵 장소 상세 페이지 URL. 사진·메뉴·리뷰를 이 링크가 대신하므로, 캐시 적중 시에도
-- 링크가 살아 있어야 한다. 장소 식별자로 URL을 조립하면 카카오가 보장하지 않는 형식을
-- 추측하게 되므로 API가 돌려주는 값을 그대로 보관한다.
-- 기존 행은 위에서 전부 삭제했으므로 null 허용으로 두고 신규 행에만 값이 들어간다.
alter table public.restaurants
  add column place_url text null;

comment on column public.restaurants.category is
  '카카오 category_name("음식점 > 한식 > 육류,고기")의 2단계 값. 안정적 저장 키이며 category_prefs.category와 짝을 이룬다.';
comment on column public.restaurants.category_label is
  '카카오 category_name의 마지막 단계. 화면 표시용이며 저장 키로 쓰지 않는다.';
comment on column public.restaurants.address is
  '카카오 road_address_name(없으면 address_name). 사람이 읽는 주소이며 표시·확인용이다. 좌표(lat/lng)와 함께 보관한다.';
comment on column public.restaurants.place_url is
  '카카오 place_url. 장소 상세 페이지이며 사진·메뉴·리뷰를 여기서 본다.';
