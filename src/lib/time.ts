/**
 * 시간대 처리 유틸 (시스템 헌장 16조 적용)
 * - DB는 UTC 저장, 이 파일에서만 KST 기준 시각을 계산한다
 * - 앱 전체에서 "KST 오늘 0시", "KST 현재" 등을 계산할 때
 *   new Date()를 직접 쓰지 말고 반드시 이 파일의 함수를 사용할 것
 */

/** KST 현재 시각을 UTC Date 객체로 반환 (내부 계산용) */
export function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600_000);
}

/** KST 오늘 0시를 UTC ISO string으로 반환 (Supabase 쿼리 기준값) */
export function kstTodayStartUTC(): string {
  const kst = kstNow();
  // KST 날짜의 0시 = UTC 전날 15시
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  return new Date(Date.UTC(y, m, d) - 9 * 3600_000).toISOString();
}

/** KST 현재 시각을 UTC ISO string으로 반환 (Supabase 쿼리 기준값) */
export function kstNowUTC(): string {
  return new Date().toISOString();
}

/** KST 기준 YYYYMMDD 문자열 반환 */
export function kstYMD(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** KST 기준 YYYY-MM-DD 문자열 반환 */
export function kstDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** KST 기준 현재 시(0~23) */
export function kstHour(): number {
  return kstNow().getUTCHours();
}

/** KST 기준 현재 시각을 소수점 시간(hour + 분/60)으로 반환 (WindChart nowHour용) */
export function kstNowHour(): number {
  const kst = kstNow();
  return kst.getUTCHours() + kst.getUTCMinutes() / 60;
}