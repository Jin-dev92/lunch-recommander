-- 관리자 승인 회원가입을 Supabase 이메일 인증으로 대체하여 승인 요청과 사용량 로그를 제거한다.
-- 과거 마이그레이션은 이력으로 보존하고 현재 스키마에서만 두 테이블을 없앤다.
drop table if exists public.signup_attempts;
drop table if exists public.signup_requests;
