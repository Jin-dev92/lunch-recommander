import { ON_CONFLICT, TABLE } from '../constants';
import { supabase } from '../supabaseClient';
import type { SaveCategoryPrefRequest } from '../types/api';
import { assertNoError } from './unwrap';

export async function saveCategoryPref({
  userId,
  category,
  weight,
}: SaveCategoryPrefRequest): Promise<void> {
  assertNoError(
    await supabase
      .from(TABLE.CATEGORY_PREFS)
      .upsert({ user_id: userId, category, weight }, { onConflict: ON_CONFLICT.CATEGORY_PREFS }),
  );
}
