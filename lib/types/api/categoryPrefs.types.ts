// @see public.category_prefs 테이블 (supabase/migrations — user_id + category 유니크)

export type CategoryPrefRow = { category: string; weight: number };

export type SaveCategoryPrefRequest = {
  userId: string;
  category: string;
  weight: number;
};
