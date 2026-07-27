# 지도 초기 로딩 조사

- 증상: 첫 방문 또는 다른 컴퓨터에서 초기 지도 영역이 비어 보일 수 있고, 기존 오류 문구 클릭 동작을 사용자가 새로고침으로 인지하기 어려움.
- 원인 가설: Google Maps SDK의 `afterInteractive` 비동기 로딩 또는 `importLibrary` 실패·지연 시 지도 생성 effect가 완료되지 않으며, 기존 오류 버튼은 지도 오류와 위치 권한 오류를 구분하지 않고 위치 재요청만 수행함.
- 수정: 지도 영역에 명시적인 `지도 새로고침` 버튼을 추가하고, 지도 오류는 문구로 표시한다. 위치 권한 오류에서만 기존 권한 재요청 버튼을 노출한다.
- 검증: `components/Map.test.tsx`에 새로고침 콜백 회귀 테스트를 추가했으며 Map/Recommend 테스트 34개와 포맷·diff 검사를 통과함.
- 추가 확인: 실제 배포 환경에서는 `NEXT_PUBLIC_GOOGLE_MAPS_KEY`의 존재, Google Maps JavaScript API 활성화, HTTP referrer 제한, 브라우저 네트워크 응답을 확인해야 한다.
