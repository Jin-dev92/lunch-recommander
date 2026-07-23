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
  sendAdmin(input: { to: string; approveUrl: string; requesterEmail: string }): Promise<void>;
  generateToken(): string;
  now(): Date;
  adminEmail: string;
  siteUrl: string;
};

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
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const now = deps.now();
    // 요금폭탄 주의: 스팸 요청이 Resend 발송·요금으로 직결
    const counts = await deps.countRecent(
      ip,
      email,
      new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    );
    if (counts.ip >= LIMIT_PER_HOUR || counts.email >= LIMIT_PER_HOUR)
      return Response.json({ error: '요청 한도를 초과했습니다.' }, { status: 429 });
    if (await deps.userExists(email))
      return Response.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
    if (await deps.findPending(email))
      return Response.json({ message: '이미 요청됨' }, { status: 202 });

    const token = deps.generateToken();
    await deps.insert({
      email,
      request_ip: ip,
      token,
      status: 'pending',
      expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await deps.sendAdmin({
      to: deps.adminEmail,
      approveUrl: `${deps.siteUrl}/admin/approve?token=${encodeURIComponent(token)}`,
      requesterEmail: email,
    });
    return Response.json({ message: '승인되면 메일로 안내됩니다' }, { status: 202 });
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
