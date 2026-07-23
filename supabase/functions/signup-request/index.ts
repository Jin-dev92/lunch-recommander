import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendAdminNotification } from '../_shared/email.ts';
import { generateApprovalToken } from '../_shared/token.ts';

export type SignupRequestInsert = {
  email: string;
  request_ip: string;
  token: string;
  status: 'pending';
  expires_at: string;
};
export type SignupRequestDeps = {
  countRecent(ip: string, email: string, since: string): Promise<{ ip: number; email: number }>;
  findPending(email: string): Promise<boolean>;
  userExists(email: string): Promise<boolean>;
  insert(input: SignupRequestInsert): Promise<void>;
  rollbackInsert(token: string): Promise<void>;
  sendAdmin(input: { to: string; approveUrl: string; requesterEmail: string }): Promise<void>;
  generateToken(): string;
  now(): Date;
  adminEmail: string;
  siteUrl: string;
};

// insert()가 signup_requests_pending_email_idx(partial unique index) 위반으로
// 실패했을 때 던지는 마커. 앱 레벨 pending 체크를 통과한 동시 요청이 마지막 방어선인
// DB 제약에 걸린 경우로, 사용자에게는 일반 pending 응답(202)을 그대로 돌려준다.
export class DuplicatePendingRequestError extends Error {}

const LIMIT_PER_HOUR = 5;

export function createSignupRequestHandler(deps: SignupRequestDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST')
      return Response.json({ error: '허용되지 않은 메서드입니다.' }, { status: 405 });
    let body: { email?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' }, { status: 400 });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return Response.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
    // Supabase 엣지 게이트웨이가 실제 클라이언트 IP를 x-forwarded-for의 마지막 hop으로
    // 덧붙인다. 앞쪽 값들은 클라이언트가 임의로 넣을 수 있어 신뢰할 수 없으므로 첫 값이
    // 아니라 마지막 값을 사용한다. (그래도 IP 자체는 위조 여지가 남는 값이라 이메일 기준
    // rate limit을 함께 둬서 피해 범위를 제한한다.)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip =
      forwardedFor
        ?.split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .pop() || 'unknown';

    try {
      const now = deps.now();
      // 요금폭탄 주의: 스팸 요청이 Resend 발송·요금으로 직결
      const counts = await deps.countRecent(
        ip,
        email,
        new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      );
      if (counts.ip >= LIMIT_PER_HOUR || counts.email >= LIMIT_PER_HOUR)
        return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });
      // ponytail: count 조회와 insert 사이의 레이스는 남아있다(요청 폭주 시 한도를 살짝
      // 넘겨서 통과할 수 있음). 초대제 소규모 앱 규모에서는 이메일+IP 이중 한도와 아래
      // pending unique index가 실질 피해(중복 메일 폭탄 등)를 막아준다. 완전히 원자적인
      // 처리가 필요해지면 rate limit 체크+insert를 DB 함수(단일 트랜잭션)로 승격한다.
      if (await deps.userExists(email))
        return Response.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
      if (await deps.findPending(email))
        return Response.json({ message: '이미 요청됨' }, { status: 202 });

      const token = deps.generateToken();
      try {
        await deps.insert({
          email,
          request_ip: ip,
          token,
          status: 'pending',
          expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (error) {
        // 위의 findPending 체크를 통과한 동시 요청이 DB의 partial unique index에
        // 걸린 경우. 이미 pending 요청이 있는 것과 동일하게 처리한다.
        if (error instanceof DuplicatePendingRequestError)
          return Response.json({ message: '이미 요청됨' }, { status: 202 });
        throw error;
      }
      try {
        await deps.sendAdmin({
          to: deps.adminEmail,
          approveUrl: `${deps.siteUrl}/admin/approve?token=${encodeURIComponent(token)}`,
          requesterEmail: email,
        });
      } catch (error) {
        // 메일 발송 실패 시 방금 넣은 pending 행을 되돌린다. 그대로 두면 재요청이
        // pending 중복으로 막혀서 다시는 관리자에게 알림이 갈 수 없게 된다.
        await deps.rollbackInsert(token);
        throw error;
      }
      return Response.json({ message: '승인되면 메일로 안내됩니다' }, { status: 202 });
    } catch (error) {
      console.error('signup-request 처리 중 오류', error);
      return Response.json({ error: '요청을 처리하지 못했습니다.' }, { status: 500 });
    }
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase/Resend 연동입니다. 테스트에서는 사용하지 않습니다. ---

if (import.meta.main) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const deps: SignupRequestDeps = {
    countRecent: async (ip, email, since) => {
      const [ipResult, emailResult] = await Promise.all([
        supabase.from('signup_requests').select('id', { count: 'exact', head: true })
          .eq('request_ip', ip).gte('created_at', since),
        supabase.from('signup_requests').select('id', { count: 'exact', head: true })
          .eq('email', email).gte('created_at', since),
      ]);
      if (ipResult.error) throw ipResult.error;
      if (emailResult.error) throw emailResult.error;
      return { ip: ipResult.count ?? 0, email: emailResult.count ?? 0 };
    },
    findPending: async (email) => {
      const { count, error } = await supabase.from('signup_requests')
        .select('id', { count: 'exact', head: true }).eq('email', email).eq('status', 'pending');
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    userExists: async (email) => {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) throw error;
      return data.users.some((user) => user.email?.toLowerCase() === email);
    },
    insert: async (input) => {
      const { error } = await supabase.from('signup_requests').insert(input);
      if (error) {
        if (error.code === '23505') throw new DuplicatePendingRequestError();
        throw error;
      }
    },
    rollbackInsert: async (token) => {
      const { error } = await supabase.from('signup_requests').delete().eq('token', token);
      if (error) throw error;
    },
    sendAdmin: (input) => sendAdminNotification(
      {
        fetch,
        apiKey: Deno.env.get('RESEND_API_KEY')!,
        from: Deno.env.get('RESEND_FROM')!,
      },
      input,
    ),
    generateToken: generateApprovalToken,
    now: () => new Date(),
    adminEmail: Deno.env.get('ADMIN_EMAIL')!,
    siteUrl: Deno.env.get('SITE_URL')!,
  };
  Deno.serve(createSignupRequestHandler(deps));
}
