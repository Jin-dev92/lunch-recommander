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

alter table public.signup_requests enable row level security;

-- 다른 사용자 데이터에 접근 가능한 우회 경로가 없도록 anon/authenticated에는
-- GRANT와 정책을 만들지 않는다. service_role은 Edge Function에서만 사용한다.
grant select, insert, update on public.signup_requests to service_role;
