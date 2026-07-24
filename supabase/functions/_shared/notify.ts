export type NotifyDeps = {
  fetch: typeof fetch;
  webhookUrl: string;
};

// 관리자 알림은 수신자가 고정 1명이라 이메일일 필요가 없다. Discord 웹훅은 발신 도메인
// 인증(SPF/DKIM)이 필요 없어서, 커스텀 도메인 없이 배포하는 환경에서도 그대로 동작한다.
export async function sendAdminNotification(
  deps: NotifyDeps,
  input: { approveUrl: string; requesterEmail: string },
): Promise<void> {
  const response = await deps.fetch(deps.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `새 회원가입 요청: ${input.requesterEmail}\n` + `검토하기: ${input.approveUrl}`,
      // requesterEmail은 엔드포인트를 직접 호출해 임의 문자열을 넣을 수 있는 입력이다.
      // 모든 멘션 파싱을 꺼서 @everyone·@here·역할 멘션 주입을 막는다.
      allowed_mentions: { parse: [] },
    }),
  });
  // 웹훅 성공 응답은 204 No Content다. 2xx 전체를 성공으로 본다.
  if (!response.ok) {
    throw new Error(`Discord 알림 발송에 실패했습니다: ${response.status}`);
  }
}
