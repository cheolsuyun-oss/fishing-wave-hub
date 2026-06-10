// Per-point dummy data for detail screens

export interface WindHour {
  hour: number; // 0-23
  dir: number; // degrees, 0 = N
  dirLabel: string;
  speed: number; // m/s
  gust: number; // m/s
}

export interface HourValue {
  hour: number;
  value: number;
}

export interface TideEvent {
  time: string; // "HH:MM"
  level: number; // cm
}

export interface MoonInfo {
  phase: string;
  emoji: string;
  illumination: number;
}

export interface PointDetailData {
  wind: WindHour[];
  wave: HourValue[]; // m
  rain: HourValue[]; // %
  temp: HourValue[]; // °C
  highs: TideEvent[];
  lows: TideEvent[];
  moon: MoonInfo;
}

const DIR_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

function w(hour: number, dirLabel: string, speed: number, gust: number): WindHour {
  return { hour, dir: DIR_DEG[dirLabel], dirLabel, speed, gust };
}

function hv(hour: number, value: number): HourValue {
  return { hour, value };
}

export const POINT_DATA: Record<string, PointDetailData> = {
  "mukho-breakwater": {
    wind: [
      w(0, "NW", 4, 6),
      w(3, "NNW", 5, 7),
      w(6, "N", 4, 6),
      w(9, "NE", 4, 6),
      w(12, "ENE", 5, 7),
      w(15, "E", 4, 6),
      w(18, "NE", 3, 5),
      w(21, "N", 4, 6),
    ],
    wave: [hv(0, 0.3), hv(3, 0.4), hv(6, 0.4), hv(9, 0.5), hv(12, 0.5), hv(15, 0.4), hv(18, 0.4), hv(21, 0.3)],
    rain: [hv(0, 10), hv(3, 10), hv(6, 15), hv(9, 20), hv(12, 20), hv(15, 15), hv(18, 10), hv(21, 10)],
    temp: [hv(0, 13), hv(3, 13), hv(6, 14), hv(9, 16), hv(12, 18), hv(15, 18), hv(18, 16), hv(21, 14)],
    highs: [{ time: "05:10", level: 38 }, { time: "17:40", level: 42 }],
    lows: [{ time: "11:25", level: 8 }, { time: "23:50", level: 6 }],
    moon: { phase: "상현달", emoji: "🌓", illumination: 52 },
  },
  "daecheon-breakwater": {
    wind: [
      w(0, "NW", 6, 9),
      w(3, "NNW", 7, 10),
      w(6, "N", 8, 11),
      w(9, "NNE", 7, 10),
      w(12, "NE", 6, 9),
      w(15, "ENE", 5, 8),
      w(18, "E", 6, 9),
      w(21, "NE", 7, 10),
    ],
    wave: [hv(0, 0.5), hv(3, 0.6), hv(6, 0.7), hv(9, 0.8), hv(12, 0.7), hv(15, 0.6), hv(18, 0.6), hv(21, 0.5)],
    rain: [hv(0, 15), hv(3, 20), hv(6, 25), hv(9, 30), hv(12, 25), hv(15, 20), hv(18, 15), hv(21, 15)],
    temp: [hv(0, 12), hv(3, 12), hv(6, 13), hv(9, 15), hv(12, 17), hv(15, 17), hv(18, 15), hv(21, 13)],
    highs: [{ time: "04:35", level: 712 }, { time: "17:05", level: 728 }],
    lows: [{ time: "10:50", level: 124 }, { time: "23:20", level: 118 }],
    moon: { phase: "상현달", emoji: "🌓", illumination: 52 },
  },
  "tongyeong-breakwater": {
    wind: [
      w(0, "SW", 4, 6),
      w(3, "SSW", 5, 7),
      w(6, "SW", 5, 8),
      w(9, "WSW", 5, 7),
      w(12, "SW", 4, 6),
      w(15, "SSW", 4, 6),
      w(18, "SW", 3, 5),
      w(21, "W", 4, 6),
    ],
    wave: [hv(0, 0.3), hv(3, 0.4), hv(6, 0.5), hv(9, 0.6), hv(12, 0.5), hv(15, 0.5), hv(18, 0.4), hv(21, 0.4)],
    rain: [hv(0, 10), hv(3, 15), hv(6, 20), hv(9, 25), hv(12, 20), hv(15, 15), hv(18, 15), hv(21, 10)],
    temp: [hv(0, 15), hv(3, 15), hv(6, 16), hv(9, 18), hv(12, 19), hv(15, 19), hv(18, 17), hv(21, 16)],
    highs: [{ time: "06:50", level: 295 }, { time: "19:25", level: 302 }],
    lows: [{ time: "13:15", level: 48 }, { time: "00:40", level: 52 }],
    moon: { phase: "상현달", emoji: "🌓", illumination: 52 },
  },
};

export function getPointDetail(id: string): PointDetailData {
  return POINT_DATA[id] ?? POINT_DATA["mukho-breakwater"];
}


// Color thresholds (in m/s for wind, m for wave)
export function windColor(ms: number) {
  if (ms <= 7) return "hsl(142 70% 40%)";
  if (ms <= 14) return "hsl(40 95% 50%)";
  return "hsl(0 75% 52%)";
}

export function waveColor(m: number) {
  if (m <= 0.5) return "hsl(142 70% 40%)";
  if (m <= 1.5) return "hsl(40 95% 50%)";
  return "hsl(0 75% 52%)";
}

// Build a smooth 24h tide curve from high/low events using cosine interpolation
function parseHHMM(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

export function buildTideCurve(
  highs: TideEvent[],
  lows: TideEvent[],
): { hour: number; level: number }[] {
  type Evt = { t: number; level: number };
  const events: Evt[] = [
    ...highs.map((h) => ({ t: parseHHMM(h.time), level: h.level })),
    ...lows.map((l) => ({ t: parseHHMM(l.time), level: l.level })),
  ].sort((a, b) => a.t - b.t);

  if (events.length === 0) return [];

  // Wrap-around helpers
  const first = events[0];
  const last = events[events.length - 1];
  const wrapBefore: Evt = { t: last.t - 24, level: last.level };
  const wrapAfter: Evt = { t: first.t + 24, level: first.level };
  const all: Evt[] = [wrapBefore, ...events, wrapAfter];

  const pts: { hour: number; level: number }[] = [];
  const step = 0.25;
  for (let h = 0; h <= 24 + 1e-9; h += step) {
    let before = all[0];
    let after = all[all.length - 1];
    for (let i = 0; i < all.length - 1; i += 1) {
      if (all[i].t <= h && all[i + 1].t >= h) {
        before = all[i];
        after = all[i + 1];
        break;
      }
    }
    const span = after.t - before.t || 1;
    const ratio = (h - before.t) / span;
    // Cosine ease → smooth U-shaped sine between extrema
    const eased = (1 - Math.cos(ratio * Math.PI)) / 2;
    const level = before.level + (after.level - before.level) * eased;
    pts.push({ hour: Math.round(h * 100) / 100, level: Math.round(level) });
  }
  return pts;
}
