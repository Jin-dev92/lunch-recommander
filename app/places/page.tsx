'use client';
import Link from 'next/link';
import { useState } from 'react';
import FolderList from '../../components/FolderList';
import SavedPlacesMap from '../../components/SavedPlacesMap';
import { ROUTES } from '../../lib/constants';
import { useAuth } from '../../lib/hooks/useAuth';
import { MESSAGES } from '../../lib/messages';
import styles from './page.module.css';

export default function PlacesPage() {
  const { isLoggedIn } = useAuth();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  if (!isLoggedIn) {
    return (
      <main className={styles.main}>
        <p className={styles.loginRequired}>{MESSAGES.LOGIN_REQUIRED}</p>
        <Link className={styles.loginLink} href={ROUTES.LOGIN}>
          로그인
        </Link>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <FolderList selectedId={selectedFolderId} onSelect={setSelectedFolderId} />
      <SavedPlacesMap folderId={selectedFolderId} canEdit={true} />
    </main>
  );
}
