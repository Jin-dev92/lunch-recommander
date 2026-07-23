export type EmailDeps = {
  fetch: typeof fetch;
  apiKey: string;
  from: string;
};

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
        `<p>${input.requesterEmail} 님이 회원가입을 요청했습니다.</p>` +
        `<p><a href="${input.approveUrl}">요청 검토하기</a></p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend 이메일 발송에 실패했습니다: ${response.status}`);
  }
}
