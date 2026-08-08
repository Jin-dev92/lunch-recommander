'use client';
import { MESSAGES } from '../lib/messages';

// ponytail: Task 8이 이 스텁을 실제 지도+저장 목록 구현으로 대체한다.
export default function SavedPlacesMap({
  folderId,
  canEdit,
}: {
  folderId: string | null;
  canEdit: boolean;
}) {
  return (
    <section aria-label="저장한 음식점 지도" data-folder-id={folderId ?? ''} data-can-edit={canEdit}>
      <p>{MESSAGES.SAVED_PLACES_MAP_PLACEHOLDER}</p>
    </section>
  );
}
