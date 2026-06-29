export function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600_000);
}

export function kstYMD(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function kstDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function kstTodayStartUTC(): string {
  const now = kstNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  return new Date(Date.UTC(y, m - 1, d) - 9 * 3600_000).toISOString();
}