'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '../lib/constants';
import { useAddSavedPlace } from '../lib/hooks/mutations';
import { useFolders } from '../lib/hooks/queries';
import { MESSAGES } from '../lib/messages';
import styles from './SaveToFolderButton.module.css';

type Place = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
};

/**
 * 추천 결과 카드에서 그 가게를 폴더에 저장한다. 폴더가 없으면 폴더 관리 페이지로
 * 유도하고, 있으면 라디오로 폴더를 골라 저장한다.
 */
export default function SaveToFolderButton({ place }: { place: Place }) {
  const { data: folders } = useFolders();
  const addSavedPlace = useAddSavedPlace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 폴더 목록이 로드되면 첫 폴더를 기본 선택한다(FolderList의 자동 선택과 같은 패턴).
  useEffect(() => {
    if (folderId === null && folders && folders.length > 0) {
      setFolderId(folders[0].id);
    }
  }, [folders, folderId]);

  function open() {
    setSaved(false);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  function save() {
    if (!folderId) return;
    addSavedPlace.mutate({ folderId, ...place }, { onSuccess: () => setSaved(true) });
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={open}>
        {MESSAGES.SAVE_TO_FOLDER_BUTTON}
      </button>
      <dialog className={styles.dialog} ref={dialog} aria-labelledby="save-to-folder-title">
        <h2 id="save-to-folder-title" className={styles.title}>
          {MESSAGES.SAVE_TO_FOLDER_BUTTON}
        </h2>
        <p className={styles.subtitle}>{place.name}</p>

        {folders && folders.length === 0 ? (
          <div className={styles.empty}>
            <p>{MESSAGES.SAVE_TO_FOLDER_NO_FOLDERS}</p>
            <Link className={styles.manageLink} href={ROUTES.PLACES} onClick={close}>
              {MESSAGES.SAVE_TO_FOLDER_MANAGE_LINK}
            </Link>
          </div>
        ) : saved ? (
          <div className={styles.saved}>
            <p className={styles.savedStatus} role="status">
              {MESSAGES.SAVE_TO_FOLDER_SAVED}
            </p>
            <button type="button" onClick={close}>
              닫기
            </button>
          </div>
        ) : (
          <>
            <ul className={styles.folderList}>
              {(folders ?? []).map((folder) => (
                <li key={folder.id}>
                  <label className={styles.folderOption}>
                    <input
                      type="radio"
                      name="save-folder"
                      value={folder.id}
                      checked={folderId === folder.id}
                      onChange={() => setFolderId(folder.id)}
                    />
                    <span className={styles.folderName}>{folder.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button type="button" onClick={close}>
                취소
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!folderId || addSavedPlace.isPending}
              >
                저장
              </button>
            </div>
            {addSavedPlace.isError && (
              <p className={styles.error} role="alert">
                {MESSAGES.SAVE_TO_FOLDER_SAVE_FAILED}
              </p>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
