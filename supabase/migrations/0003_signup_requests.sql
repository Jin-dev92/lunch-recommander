create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  request_ip inet not null,
  token text unique not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index signup_requests_email_created_at_idx
  on public.signup_requests (email, created_at desc);
create index signup_requests_ip_created_at_idx
  on public.signup_requests (request_ip, created_at desc);

-- 동시 요청이 앱 레벨의 pending 중복 체크를 우회해 같은 이메일로 pending 행을
-- 두 개 이상 만들 수 없도록 DB 제약으로 강제한다(경합 상황 대비).
create unique index signup_requests_pending_email_idx
  on public.signup_requests (email) where status = 'pending';

alter table public.signup_requests enable row level security;

-- 다른 사용자 데이터에 접근 가능한 우회 경로가 없도록 anon/authenticated에는
-- GRANT와 정책을 만들지 않는다. service_role은 Edge Function에서만 사용한다.
-- delete는 메일 발송 실패 시 orphan pending 행을 롤백하는 용도로만 사용한다.
grant select, insert, update, delete on public.signup_requests to service_role;
