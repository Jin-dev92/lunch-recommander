# 지도 초기 로딩 조사

- 증상: 첫 방문 또는 다른 컴퓨터에서 초기 지도 영역이 비어 보일 수 있고, 기존 오류 문구 클릭 동작을 사용자가 새로고침으로 인지하기 어려움.
- 원인: Google Maps SDK의 `afterInteractive` 비동기 로딩에서 스크립트 준비 이벤트와 `google.maps.importLibrary` 노출 시점이 다를 수 있는데, 기존 코드는 이벤트 직후 한 번만 호출해 실패하면 지도를 다시 만들지 못했다.
- 수정: `onLoad`·`onReady`를 모두 SDK 준비 신호로 사용하고, `importLibrary`가 늦게 노출되면 최대 5초간 폴링한다. 지도 오류는 문구로 표시하며 위치 오류에서만 권한 재요청 버튼을 노출한다.
- 검증: SDK 전역 지연을 재현하는 회귀 테스트를 추가했으며 Map/Recommend 테스트 35개와 포맷·diff 검사를 통과함.
- 추가 확인: 실제 배포 환경에서는 `NEXT_PUBLIC_GOOGLE_MAPS_KEY`의 존재, Google Maps JavaScript API 활성화, HTTP referrer 제한, 브라우저 네트워크 응답을 확인해야 한다.
