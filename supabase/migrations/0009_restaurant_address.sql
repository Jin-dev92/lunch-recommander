-- 위경도만으로는 실제 위치를 사람이 알아보기 어려워, 사람이 읽을 수 있는 주소를 함께 보관한다.
--   address : Google formattedAddress(예: 대한민국 서울특별시 성북구 ...). 표시·확인용이다.
-- formattedAddress는 Pro 등급 필드라, 이미 Enterprise 등급인 nearby 호출의 요금을 올리지 않는다.
-- 주소를 모르는 기존 행은 null을 허용하고, 캐시 TTL(15분)이 지나면 새 값으로 대체된다.
alter table public.restaurants
  add column address text null;

comment on column public.restaurants.address is
  'Google formattedAddress. 사람이 읽는 주소이며 표시·확인용이다. 좌표(lat/lng)와 함께 보관한다.';
