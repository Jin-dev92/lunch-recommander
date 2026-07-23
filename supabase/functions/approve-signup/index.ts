import { createClient } from 'jsr:@supabase/supabase-js@2';

export type SignupRequest = {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  expires_at: string;
};
export type ApproveSignupDeps = {
  findRequest(token: string): Promise<SignupRequest | null>;
  userExists(email: string): Promise<boolean>;
  invite(email: string, redirectTo: string): Promise<void>;
  updateStatus(id: string, from: 'pending', to: 'approved' | 'rejected'): Promise<boolean>;
  now(): Date;
  siteUrl: string;
};

function valid(row: SignupRequest | null, now: Date): row is SignupRequest {
  return Boolean(row && row.status === 'pending' && new Date(row.expires_at) > now);
}

export function createApproveSignupHandler(deps: ApproveSignupDeps) {
  return async (request: Request): Promise<Response> => {
    try {
      let token = new URL(request.url).searchParams.get('token') ?? '';
      let action: 'approve' | 'reject' | undefined;
      if (request.method === 'POST') {
        const body = await request.json().catch(() => null) as
          | { token?: unknown; action?: unknown }
          | null;
        token = typeof body?.token === 'string' ? body.token : '';
        action = body?.action === 'approve' || body?.action === 'reject' ? body.action : undefined;
        if (!action)
          return Response.json({ error: '승인 동작이 올바르지 않습니다.' }, { status: 400 });
      } else if (request.method !== 'GET') {
        return Response.json({ error: '허용되지 않은 메서드입니다.' }, { status: 405 });
      }
      const row = token ? await deps.findRequest(token) : null;
      if (!valid(row, deps.now()))
        return Response.json({ error: '만료되었거나 유효하지 않은 요청입니다.' }, { status: 410 });
      if (request.method === 'GET')
        return Response.json({ email: row.email, status: row.status });

      const next = action === 'approve' ? 'approved' : 'rejected';
      const alreadyRegistered = action === 'approve' && await deps.userExists(row.email);
      if (action === 'approve' && !alreadyRegistered)
        await deps.invite(row.email, `${deps.siteUrl}/set-password`);
      if (!(await deps.updateStatus(row.id, 'pending', next)))
        return Response.json({ error: '이미 처리된 요청입니다.' }, { status: 409 });
      return Response.json(
        action === 'approve'
          ? { status: 'approved', alreadyRegistered }
          : { status: 'rejected' },
      );
    } catch (error) {
      console.error('approve-signup 처리 중 오류', error);
      return Response.json({ error: '요청을 처리하지 못했습니다.' }, { status: 500 });
    }
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase 연동입니다. 테스트에서는 사용하지 않습니다. ---

if (import.meta.main) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const deps: ApproveSignupDeps = {
    findRequest: async (token) => {
      const { data, error } = await supabase.from('signup_requests')
        .select('id,email,status,expires_at').eq('token', token).maybeSingle();
      if (error) throw error;
      return data;
    },
    userExists: async (email) => {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) throw error;
      return data.users.some((user) => user.email?.toLowerCase() === email);
    },
    invite: async (email, redirectTo) => {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) throw error;
    },
    updateStatus: async (id, from, to) => {
      const { data, error } = await supabase.from('signup_requests').update({ status: to })
        .eq('id', id).eq('status', from).select('id').maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    now: () => new Date(),
    siteUrl: Deno.env.get('SITE_URL')!,
  };
  Deno.serve(createApproveSignupHandler(deps));
}
