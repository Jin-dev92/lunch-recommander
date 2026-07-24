'use client';
import { useSaveCategoryPref } from '../lib/hooks/mutations';
import { MESSAGES } from '../lib/messages';
import styles from './CategoryPrefs.module.css';

export default function CategoryPrefs({
  userId,
  categories,
  currentWeights = {},
}: {
  userId: string;
  categories: string[];
  currentWeights?: Record<string, number>;
}) {
  const saveCategoryPref = useSaveCategoryPref();

  return (
    <section
      className={styles.section}
      aria-label="카테고리 기호"
      aria-busy={saveCategoryPref.isPending}
    >
      {categories.map((category) => (
        <label className={styles.field} key={category}>
          {category}
          <input
            className={styles.input}
            type="number"
            min="0.1"
            max="3"
            step="0.1"
            defaultValue={currentWeights[category] ?? 1}
            onBlur={(event) =>
              saveCategoryPref.mutate({
                userId,
                category,
                weight: Number(event.currentTarget.value),
              })
            }
          />
        </label>
      ))}
      {saveCategoryPref.isError && (
        <p className={styles.error} role="alert">
          {MESSAGES.CATEGORY_PREF_SAVE_FAILED}
        </p>
      )}
    </section>
  );
}
