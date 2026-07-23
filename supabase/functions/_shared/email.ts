export type EmailDeps = {
  fetch: typeof fetch;
  apiKey: string;
  from: string;
};

// 엣지 함수를 브라우저(type=email 검증) 없이 직접 호출하면 requesterEmail에 임의의
// 문자열이 들어올 수 있다. HTML에 그대로 꽂으면 관리자 메일에 태그/링크를 주입할 수
// 있으므로 이스케이프한다.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendAdminNotification(
  deps: EmailDeps,
  input: { to: string; approveUrl: string; requesterEmail: string },
): Promise<void> {
  const response = await deps.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: deps.from,
      to: [input.to],
      subject: '회원가입 승인 요청',
      html:
        `<p>${escapeHtml(input.requesterEmail)} 님이 회원가입을 요청했습니다.</p>` +
        `<p><a href="${input.approveUrl}">요청 검토하기</a></p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend 이메일 발송에 실패했습니다: ${response.status}`);
  }
}
