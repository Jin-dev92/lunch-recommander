import { RPC } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type { CreateGroupRequest, CreateGroupRow, JoinGroupRequest } from '../types/api';
import { assertNoError, unwrap } from './unwrap';

/** 그룹을 만들고 초대코드를 돌려준다. */
export async function createGroup({ name }: CreateGroupRequest): Promise<string> {
  const rows = unwrap<CreateGroupRow[]>(await supabase.rpc(RPC.CREATE_GROUP, { group_name: name }));
  const inviteCode = rows?.[0]?.invite_code;
  if (!inviteCode) throw new Error(MESSAGES.GROUP_CREATE_FAILED);
  return inviteCode;
}

export async function joinGroupByCode({ code }: JoinGroupRequest): Promise<void> {
  assertNoError(await supabase.rpc(RPC.JOIN_GROUP_BY_CODE, { code }));
}
