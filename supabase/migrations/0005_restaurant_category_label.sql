-- 카테고리는 두 값을 나눠 보관한다.
--   category       : Google Places의 primaryType(예: korean_restaurant). 선호 가중치의 저장 키이자
--                    점수 계산의 기준이므로 표기가 바뀌지 않는 안정적인 기계값을 쓴다.
--   category_label : primaryTypeDisplayName(예: 한식당). 화면 표시 전용이며 언어·시점에 따라 바뀔 수 있다.
--
-- 기존 행은 라벨을 모르므로 null을 허용한다. 캐시 TTL(15분)이 지나면 자연히 새 값으로 대체된다.
alter table public.restaurants
  add column category_label text null;

comment on column public.restaurants.category is
  'Google Places primaryType. 안정적 기계값이며 category_prefs.category와 짝을 이룬다.';
comment on column public.restaurants.category_label is
  'Google Places primaryTypeDisplayName. 화면 표시용이며 저장 키로 쓰지 않는다.';
