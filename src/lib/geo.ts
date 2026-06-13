import type { FishingPoint } from "./points";

// Haversine distance in meters
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// KMA Lambert Conformal Conic 격자 변환 (기상청 동네예보)
export function latLngToGrid(lat: number, lng: number): { nx: number; ny: number } {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

// 조석 관측소 (기존 하드코딩 포인트들에서 추출)
const TIDE_STATIONS: { code: string; lat: number; lng: number; sea: FishingPoint["sea"] }[] = [
  { code: "DT_0060", lat: 37.5486, lng: 129.1169, sea: "동해" }, // 묵호
  { code: "DT_0025", lat: 36.3297, lng: 126.4867, sea: "서해" }, // 대천
  { code: "DT_0027", lat: 34.8544, lng: 128.4337, sea: "남해" }, // 통영
];

export function nearestTideStation(lat: number, lng: number) {
  let best = TIDE_STATIONS[0];
  let bestD = Infinity;
  for (const s of TIDE_STATIONS) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// 좌표 기반 해역 추정
export function inferSea(lat: number, lng: number): FishingPoint["sea"] {
  if (lng < 127.3) return "서해";
  if (lng > 128.7 && lat > 35.5) return "동해";
  return "남해";
}

// "20260613" + "0900" -> "6월 13일 09:00 기준"
export function formatFcstBasis(fcstDate?: string, fcstTime?: string): string | null {
  if (!fcstDate || fcstDate.length !== 8 || !fcstTime || fcstTime.length !== 4) return null;
  const month = Number(fcstDate.slice(4, 6));
  const day = Number(fcstDate.slice(6, 8));
  const hh = fcstTime.slice(0, 2);
  const mm = fcstTime.slice(2, 4);
  if (!month || !day) return null;
  return `${month}월 ${day}일 ${hh}:${mm} 기준`;
}
