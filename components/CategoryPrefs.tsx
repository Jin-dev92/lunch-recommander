'use client';
import { useState } from 'react';
import { CATEGORY_PREFERENCE_OPTIONS, DEFAULT_CATEGORY_WEIGHT } from '../lib/constants';
import { useSaveCategoryPref } from '../lib/hooks/mutations';
import { MESSAGES } from '../lib/messages';
import styles from './CategoryPrefs.module.css';

/**
 * 카테고리 선호도를 3단계로 받는다. 숫자를 직접 입력받던 방식은 값의 의미가 드러나지 않았다.
 * `category`는 저장 키인 기계값이고 화면에 보여주는 이름은 `categoryLabel`이다.
 * 선택 상태를 컴포넌트가 들고 있으므로, 카테고리가 바뀔 때는 상위에서 key로 remount한다.
 */
export default function CategoryPrefs({
  userId,
  category,
  categoryLabel,
  currentWeight,
}: {
  userId: string;
  category: string;
  categoryLabel: string;
  currentWeight?: number;
}) {
  const [weight, setWeight] = useState(currentWeight ?? DEFAULT_CATEGORY_WEIGHT);
  const saveCategoryPref = useSaveCategoryPref();

  function choose(next: number) {
    setWeight(next);
    saveCategoryPref.mutate({ userId, category, weight: next });
  }

  return (
    <section
      className={styles.section}
      aria-label="카테고리 기호"
      aria-busy={saveCategoryPref.isPending}
    >
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{categoryLabel}, 얼마나 좋아하세요?</legend>
        <div className={styles.options}>
          {CATEGORY_PREFERENCE_OPTIONS.map((option) => (
            <label className={styles.option} key={option.label}>
              <input
                className={styles.radio}
                type="radio"
                name={`category-preference-${category}`}
                checked={weight === option.weight}
                disabled={saveCategoryPref.isPending}
                onChange={() => choose(option.weight)}
              />
              <span className={styles.optionLabel}>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {saveCategoryPref.isError && (
        <p className={styles.error} role="alert">
          {MESSAGES.CATEGORY_PREF_SAVE_FAILED}
        </p>
      )}
    </section>
  );
}
