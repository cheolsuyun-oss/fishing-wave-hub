// 차트 공통 색상 상수 (Single Source of Truth)

// 풍속 기준 색상
export const WIND_COLORS = {
  safe:    "hsl(142 70% 40%)",  // 출조가능 ≤5.6m/s
  caution: "hsl(40 95% 50%)",   // 주의 ≤10m/s
  danger:  "hsl(0 75% 52%)",    // 경고 >10m/s
} as const;

// 파고 기준 색상 (풍속과 동일 팔레트)
export const WAVE_COLORS = {
  safe:    "hsl(142 70% 40%)",
  caution: "hsl(40 95% 50%)",
  danger:  "hsl(0 75% 52%)",
} as const;

// 일출/일몰 구간 색상
export const SUN_BAND_COLORS = {
  night: "hsl(270 60% 55%)",
  dawn:  "hsl(45 95% 65%)",
  dusk:  "hsl(30 90% 60%)",
} as const;

// 현재선/탐색선 색상
export const TIMELINE_COLORS = {
  current: "hsl(0 0% 15%)",
  active:  "hsl(217 80% 50%)",
} as const;

// 헬퍼 함수
export function windColor(ms: number): string {
  if (ms <= 5.6) return WIND_COLORS.safe;
  if (ms <= 10)  return WIND_COLORS.caution;
  return WIND_COLORS.danger;
}

export function waveColor(m: number): string {
  if (m <= 0.5) return WAVE_COLORS.safe;
  if (m <= 1.5) return WAVE_COLORS.caution;
  return WAVE_COLORS.danger;
}