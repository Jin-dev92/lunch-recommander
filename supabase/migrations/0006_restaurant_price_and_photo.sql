-- 추천 카드에 가격대와 썸네일을 보여주기 위해 캐시 테이블에 두 값을 더 보관한다.
--   price_level : Google priceLevel 열거형(PRICE_LEVEL_MODERATE 등). Google이 실제 메뉴 가격은
--                 주지 않고 4단계 등급만 준다. 없는 가게가 많아 null을 허용한다.
--   photo_name  : Google photos[0].name(리소스 이름, places/.../photos/...). 실제 이미지 URL이
--                 아니라 참조값이다. 이미지는 추천된 1곳에 한해 place-photo 함수가 따로 해석한다.
--                 20곳 전부를 해석하면 GetPhotoMedia 호출이 20배로 늘어 요금이 커진다.
alter table public.restaurants
  add column price_level text null,
  add column photo_name text null;

comment on column public.restaurants.price_level is
  'Google priceLevel 열거형. 4단계 등급이며 실제 가격이 아니다. 화면에는 ₩ 기호로 환산해 보여준다.';
comment on column public.restaurants.photo_name is
  'Google 사진 리소스 이름. 실제 이미지는 place-photo 함수가 GetPhotoMedia로 해석한다.';
