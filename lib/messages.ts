// 사용자 노출 문구 단일 출처. 식별자(쿠키명·경로 등)는 lib/constants.ts에 둔다.
export const MESSAGES = {
  LOGIN_REQUIRED: '로그인이 필요합니다.',
  NO_CANDIDATES: '추천할 음식점이 없습니다.',
  RATING_SAVE_FAILED: '평점 저장에 실패했습니다.',
  SNOOZE_FAILED: '스누즈 처리에 실패했습니다.',
  CATEGORY_PREF_SAVE_FAILED: '기호 저장에 실패했습니다.',
  EXCLUDE_CONFIRM: '이 음식점을 추천에서 영구 제외합니다. 되돌릴 수 없어요. 계속할까요?',
  GEOLOCATION_DENIED: '현재 위치 권한이 필요합니다.',
  GEOLOCATION_SETTINGS_REQUIRED: '브라우저 설정에서 위치 권한을 허용해 주세요.',
  MAP_LOAD_FAILED: '지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  MAP_ADJUST_HINT: '위치가 실제와 다르면 지도를 누르거나 핀을 끌어 옮기세요.',
  GROUP_CREATE_FAILED: '그룹 생성에 실패했습니다.',
  GROUP_JOINED: '그룹에 가입했습니다.',
  ALREADY_LOGGED_IN: '이미 로그인되어 있습니다.',
  SIGNUP_CONFIRM_EMAIL: '인증 메일을 확인해 주세요.',
  SIGNUP_CONFIRM_EMAIL_RESENT: '인증 메일을 다시 보냈습니다.',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
} as const;

/** catch로 받은 unknown을 화면에 띄울 문구로 좁힌다. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : MESSAGES.UNKNOWN_ERROR;
}
