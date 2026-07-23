// @see RPC 스펙: create_group / join_group_by_code (supabase/migrations)

export type CreateGroupRequest = { name: string };

/** create_group은 단일 행이 아니라 한 행짜리 테이블을 반환한다. */
export type CreateGroupRow = { group_id: string; invite_code: string };

export type JoinGroupRequest = { code: string };
