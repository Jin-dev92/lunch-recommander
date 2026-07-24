/**
 * supabase-js는 예외 대신 `{ data, error }`를 돌려준다. API 레이어 호출부가 매번 error를
 * 분기하지 않도록 여기서 Error로 승격시키고, 화면은 React Query의 error 하나만 본다.
 */
export type SupabaseResult<T> = { data?: T | null; error: { message: string } | null };

/** 읽기용 — 응답 데이터가 필요할 때 쓴다. */
export function unwrap<T>(result: SupabaseResult<T>): T | null {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? null;
}

/** 쓰기용 — 성공 여부만 확인하면 되는 호출에 쓴다(응답 data 형태에 묶이지 않는다). */
export function assertNoError(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}
