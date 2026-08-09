// @see public.folders (supabase/migrations/0011)
export type Folder = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
};
export type CreateFolderRequest = { name: string };
export type RenameFolderRequest = { id: string; name: string };
