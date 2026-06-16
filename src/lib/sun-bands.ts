// 일출/일몰 기반 낮/밤/여명/황혼 구간 공통 유틸

export interface SunBand {
  x1: number;
  x2: number;
  type: "night" | "dawn" | "dusk" | "day";
}

const TWILIGHT = 0.75; // 여명/황혼 구간 45분

/**
 * 일출/일몰 시간을 받아서 차트용 구간 배열 반환
 * @param sunrise 소수점 시간 (예: 5.5 = 5시 30분)
 * @param sunset  소수점 시간 (예: 19.3 = 19시 18분)
 * @param days    1일치 = 24h, 다일치는 day offset 곱해서 반환
 */
export function buildSunBands(
  sunrise: number,
  sunset: number,
  days: number = 1,
): SunBand[] {
  const bands: SunBand[] = [];

  for (let d = 0; d < days; d++) {
    const offset = d * 24;

    // 새벽 야간 (0시 ~ 일출 전 여명)
    bands.push({ x1: offset, x2: offset + sunrise - TWILIGHT, type: "night" });
    // 여명 (일출 전 45분)
    bands.push({ x1: offset + sunrise - TWILIGHT, x2: offset + sunrise + TWILIGHT, type: "dawn" });
    // 황혼 (일몰 전 45분)
    bands.push({ x1: offset + sunset - TWILIGHT, x2: offset + sunset + TWILIGHT, type: "dusk" });
    // 저녁 야간 (일몰 후 여명 ~ 자정)
    bands.push({ x1: offset + sunset + TWILIGHT, x2: offset + 24, type: "night" });
  }

  return bands;
}

import { SUN_BAND_COLORS } from "@/lib/chart-colors";

export function bandFill(type: SunBand["type"]): string {
  switch (type) {
    case "dawn": return SUN_BAND_COLORS.dawn;
    case "dusk": return SUN_BAND_COLORS.dusk;
    case "night": return SUN_BAND_COLORS.night;
    default: return "transparent";
  }
}

export function bandOpacity(type: SunBand["type"]): number {
  switch (type) {
    case "night": return 0.14;
    case "dawn":
    case "dusk": return 0.3;
    default: return 0;
  }
}