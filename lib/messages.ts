// 사용자 노출 문구 단일 출처. 식별자(쿠키명·경로 등)는 lib/constants.ts에 둔다.
export const MESSAGES = {
  LOGIN_REQUIRED: '로그인이 필요합니다.',
  NO_CANDIDATES: '추천할 음식점이 없습니다.',
  RATING_SAVE_FAILED: '평점 저장에 실패했습니다.',
  SNOOZE_FAILED: '스누즈 처리에 실패했습니다.',
  CATEGORY_PREF_SAVE_FAILED: '기호 저장에 실패했습니다.',
  GEOLOCATION_DENIED: '현재 위치 권한이 필요합니다.',
  MAP_LOAD_FAILED: '지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  GROUP_CREATE_FAILED: '그룹 생성에 실패했습니다.',
  GROUP_JOINED: '그룹에 가입했습니다.',
  // 서버가 안내 문구를 주지 않았을 때만 쓰는 대체 문구
  SIGNUP_REQUEST_ACCEPTED: '승인되면 메일로 안내됩니다',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
} as const;

/** catch로 받은 unknown을 화면에 띄울 문구로 좁힌다. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR;
}
