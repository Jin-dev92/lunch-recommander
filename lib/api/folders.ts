import { TABLE } from '../constants';
import { MESSAGES } from '../messages';
import { supabase } from '../supabaseClient';
import type { Folder } from '../types/api';
import { assertNoError, unwrap } from './unwrap';

type FolderRow = { id: string; name: string; owner_id: string; created_at: string };
const toFolder = (r: FolderRow): Folder => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  createdAt: r.created_at,
});

export async function listFolders(): Promise<Folder[]> {
  const rows = unwrap<FolderRow[]>(
    await supabase.from(TABLE.FOLDERS).select('id,name,owner_id,created_at').order('created_at'),
  );
  return (rows ?? []).map(toFolder);
}

export async function createFolder(name: string): Promise<Folder> {
  const { data } = await supabase.auth.getUser();
  const ownerId = data.user?.id;
  if (!ownerId) throw new Error(MESSAGES.LOGIN_REQUIRED);
  const row = unwrap<FolderRow>(
    await supabase
      .from(TABLE.FOLDERS)
      .insert({ name, owner_id: ownerId })
      .select('id,name,owner_id,created_at')
      .single(),
  );
  if (!row) throw new Error(MESSAGES.FOLDER_SAVE_FAILED);
  return toFolder(row);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  assertNoError(await supabase.from(TABLE.FOLDERS).update({ name }).eq('id', id));
}

export async function deleteFolder(id: string): Promise<void> {
  assertNoError(await supabase.from(TABLE.FOLDERS).delete().eq('id', id));
}
