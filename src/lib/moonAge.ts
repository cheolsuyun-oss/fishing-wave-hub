function solarToLunarDay(date: Date): number {
  const BASE = new Date(2000, 0, 6).getTime();
  const LUNAR_MONTH = 29.530588853;
  const diffDays = (date.getTime() - BASE) / 86400000;
  const monthsElapsed = diffDays / LUNAR_MONTH;
  const dayInMonth = (monthsElapsed % 1) * LUNAR_MONTH;
  return Math.floor(dayInMonth) + 1;
}

export function getMulddae(date: Date = new Date()): string {
  const lunarDay = solarToLunarDay(date);
  const mulddae = ((lunarDay - 1) % 15) + 1;
  return `${mulddae}물`;
}
