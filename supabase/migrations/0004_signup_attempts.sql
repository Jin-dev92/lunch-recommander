-- signup_requests는 신규/실패 없이 저장에 성공한 요청만 기록하므로, 이미 pending인
-- 요청이나 이미 가입된 이메일로 반복 호출해도 행이 늘지 않아 rate limit을 우회할 수
-- 있었다. signup_attempts는 결과와 무관하게 signup-request로 들어온 모든 시도를
-- 기록해 IP/이메일 기준 rate limit이 실제 호출 횟수를 세도록 한다.
create table public.signup_attempts (
  id uuid primary key default gen_random_uuid(),
  ip inet not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index signup_attempts_ip_created_at_idx
  on public.signup_attempts (ip, created_at desc);
create index signup_attempts_email_created_at_idx
  on public.signup_attempts (email, created_at desc);

alter table public.signup_attempts enable row level security;

-- signup_requests와 동일하게 anon/authenticated에는 GRANT를 주지 않는다.
-- service_role만 Edge Function에서 기록/조회한다. update/delete는 필요 없다(append-only 로그).
-- ponytail: 오래된 행을 지우는 정리 작업은 없다(무한 누적). 용량이 문제되면 배치로 오래된
-- 행을 삭제하는 cron을 추가한다.
grant select, insert on public.signup_attempts to service_role;
