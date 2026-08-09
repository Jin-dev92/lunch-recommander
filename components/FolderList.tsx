'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCreateFolder, useDeleteFolder, useRenameFolder } from '../lib/hooks/mutations';
import { useFolders } from '../lib/hooks/queries';
import { MESSAGES } from '../lib/messages';
import styles from './FolderList.module.css';

/**
 * 폴더 목록·생성·이름변경·삭제를 담당한다. 폴더가 로드되고 아직 선택된 폴더가 없으면
 * 첫 폴더를 자동 선택한다(맵을 빈 상태로 두지 않기 위함).
 */
export default function FolderList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: folders, isLoading, isError } = useFolders();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (selectedId === null && folders && folders.length > 0) {
      onSelect(folders[0].id);
    }
  }, [folders, selectedId, onSelect]);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createFolder.mutate({ name: trimmed }, { onSuccess: () => setName('') });
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id);
    setEditingName(currentName);
  }

  function submitRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = editingName.trim();
    if (!editingId || !trimmed) return;
    renameFolder.mutate(
      { id: editingId, name: trimmed },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function requestDelete(id: string) {
    setPendingDeleteId(id);
    confirmDialog.current?.showModal();
  }

  function cancelDelete() {
    confirmDialog.current?.close();
    setPendingDeleteId(null);
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    deleteFolder.mutate(id, {
      onSuccess: () => {
        confirmDialog.current?.close();
        setPendingDeleteId(null);
        if (selectedId === id) onSelect(null);
      },
    });
  }

  return (
    <section className={styles.section} aria-label="폴더">
      <form className={styles.createForm} onSubmit={handleCreate}>
        <input
          className={styles.nameInput}
          type="text"
          placeholder={MESSAGES.FOLDER_NAME_PLACEHOLDER}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={createFolder.isPending}
        />
        <button type="submit" disabled={createFolder.isPending || !name.trim()}>
          추가
        </button>
      </form>
      {(isError || createFolder.isError || renameFolder.isError || deleteFolder.isError) && (
        <p className={styles.error} role="alert">
          {MESSAGES.FOLDER_SAVE_FAILED}
        </p>
      )}
      {isLoading ? (
        <p role="status">불러오는 중…</p>
      ) : (
        <ul className={styles.list}>
          {(folders ?? []).map((folder) => (
            <li className={styles.item} key={folder.id}>
              {editingId === folder.id ? (
                <form className={styles.renameForm} onSubmit={submitRename}>
                  <input
                    className={styles.nameInput}
                    type="text"
                    aria-label={`${folder.name} 이름 수정`}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                  />
                  <button type="submit">저장</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    취소
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className={
                      folder.id === selectedId
                        ? `${styles.folderButton} ${styles.selected}`
                        : styles.folderButton
                    }
                    aria-pressed={folder.id === selectedId}
                    onClick={() => onSelect(folder.id)}
                  >
                    {folder.name}
                  </button>
                  <button type="button" onClick={() => startRename(folder.id, folder.name)}>
                    이름변경
                  </button>
                  <button type="button" onClick={() => requestDelete(folder.id)}>
                    삭제
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <dialog
        className={styles.confirmDialog}
        ref={confirmDialog}
        aria-labelledby="folder-delete-confirm"
      >
        <p id="folder-delete-confirm">{MESSAGES.FOLDER_DELETE_CONFIRM}</p>
        <div className={styles.confirmActions}>
          <button type="button" onClick={cancelDelete}>
            취소
          </button>
          <button type="button" onClick={confirmDelete}>
            삭제하기
          </button>
        </div>
      </dialog>
    </section>
  );
}
