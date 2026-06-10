function solarToLunarDay(date: Date): number {
  const BASE_MS = Date.UTC(2000, 0, 6);
  const LUNAR_MONTH = 29.530588853;
  const diffDays = (date.getTime() - BASE_MS) / 86400000;
  const monthsElapsed = diffDays / LUNAR_MONTH;
  const dayInMonth = ((monthsElapsed % 1) + 1) % 1;
  return Math.floor(dayInMonth * LUNAR_MONTH) + 1;
}

export function getMulddae(date: Date = new Date()): string {
  try {
    const lunarDay = solarToLunarDay(date);
    const mulddae = ((lunarDay - 1) % 15) + 1;
    return mulddae + "물";
  } catch {
    return "-";
  }
}