import { createClient } from 'jsr:@supabase/supabase-js@2';

export type SignupRequest = {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  expires_at: string;
};
export type ApproveSignupDeps = {
  findRequest(token: string): Promise<SignupRequest | null>;
  invite(email: string, redirectTo: string): Promise<{ alreadyRegistered: boolean }>;
  updateStatus(id: string, from: SignupRequest['status'], to: SignupRequest['status']): Promise<boolean>;
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
      let action: 'approve' | 'reject' | 'info' | undefined;
      if (request.method === 'POST') {
        const body = await request.json().catch(() => null) as
          | { token?: unknown; action?: unknown }
          | null;
        token = typeof body?.token === 'string' ? body.token : '';
        action = body?.action === 'approve' || body?.action === 'reject' || body?.action === 'info'
          ? body.action
          : undefined;
        if (!action)
          return Response.json({ error: '승인 동작이 올바르지 않습니다.' }, { status: 400 });
      } else if (request.method !== 'GET') {
        return Response.json({ error: '허용되지 않은 메서드입니다.' }, { status: 405 });
      }
      const row = token ? await deps.findRequest(token) : null;
      if (!valid(row, deps.now()))
        return Response.json({ error: '만료되었거나 유효하지 않은 요청입니다.' }, { status: 410 });
      // GET과 POST action:'info'는 상태를 바꾸지 않는 조회 전용 경로다(브라우저는
      // supabase.functions.invoke가 GET+쿼리를 지원하지 않아 info를 쓰고, GET은 하위 호환용).
      if (request.method === 'GET' || action === 'info')
        return Response.json({ email: row.email, status: row.status });

      // 토큰을 먼저 "선점"한다(pending → approved/rejected 조건부 갱신). 동시 요청 중
      // 하나만 이 갱신에 성공하므로, 그 요청만 아래에서 초대를 보낸다. 초대를 먼저 보내고
      // 나중에 상태를 갱신하면 동시 요청이 둘 다 초대를 보내거나, 초대 후 갱신이 실패했을 때
      // 토큰이 재사용 가능한 pending 상태로 남는 문제가 생긴다.
      const next = action === 'approve' ? 'approved' : 'rejected';
      if (!(await deps.updateStatus(row.id, 'pending', next)))
        return Response.json({ error: '이미 처리된 요청입니다.' }, { status: 409 });

      if (action === 'reject')
        return Response.json({ status: 'rejected' });

      try {
        const { alreadyRegistered } = await deps.invite(row.email, `${deps.siteUrl}/set-password`);
        return Response.json({ status: 'approved', alreadyRegistered });
      } catch (error) {
        // 선점(상태 갱신)은 성공했지만 초대가 실패한 경우. 그대로 두면 토큰이 조용히
        // "승인됨"으로 소진되어 재시도가 불가능해지므로 pending으로 되돌린다.
        await deps.updateStatus(row.id, 'approved', 'pending').catch(() => {});
        throw error;
      }
    } catch (error) {
      console.error('approve-signup 처리 중 오류', error);
      return Response.json({ error: '요청을 처리하지 못했습니다.' }, { status: 500 });
    }
  };
}

// --- 운영 어댑터: 아래는 실제 Supabase 연동입니다. 테스트에서는 사용하지 않습니다. ---

if (import.meta.main) {
  const siteUrl = Deno.env.get('SITE_URL');
  if (!siteUrl) throw new Error('SITE_URL 환경변수가 설정되지 않았습니다.');

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
    invite: async (email, redirectTo) => {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) {
        // listUsers()로 미리 확인하면 페이지네이션 때문에 첫 페이지 밖의 사용자를 놓칠 수
        // 있다. 대신 inviteUserByEmail의 결과 자체로 "이미 가입됨"을 판단한다.
        if (error.code === 'email_exists' || /already.*registered|already.*exists/i.test(error.message))
          return { alreadyRegistered: true };
        throw error;
      }
      return { alreadyRegistered: false };
    },
    updateStatus: async (id, from, to) => {
      const { data, error } = await supabase.from('signup_requests').update({ status: to })
        .eq('id', id).eq('status', from).select('id').maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    now: () => new Date(),
    siteUrl,
  };
  Deno.serve(createApproveSignupHandler(deps));
}
