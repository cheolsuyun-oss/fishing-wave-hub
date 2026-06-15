import type { FishingPoint } from "./points";
import tideStationsMaster from "../data/tide-stations-master.json";

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

// 조석 관측소 (기상청 조석예보(고저조) 오픈API 활용가이드 기준, 172개)
type TideStation = { code: string; name: string; lat: number; lng: number; sea: FishingPoint["sea"] };

const TIDE_STATIONS: TideStation[] = tideStationsMaster as TideStation[];

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

// nx/ny 격자 기준으로 가장 가까운 관측소 code 반환
export function nearestStationCodeByGrid(nx: number, ny: number): string {
  let best = TIDE_STATIONS[0];
  let bestD = Infinity;
  for (const s of (tideStationsMaster as Array<{ code: string; name: string; lat: number; lng: number; nx: number; ny: number; sea: string }>)) {
    const d = Math.sqrt((s.nx - nx) ** 2 + (s.ny - ny) ** 2);
    if (d < bestD) {
      bestD = d;
      best = s as unknown as TideStation;
    }
  }
  return best.code;
}

// 좌표 기반 해역 추정 (제주권 포함 4분류)
export function inferSea(lat: number, lng: number): FishingPoint["sea"] {
  // 제주 본섬 및 인근 도서 (대략 위도 33~34.3, 경도 126.0~127.0 권역 + 이어도)
  if (lat < 34.3 && lng < 127.0 && lng > 124.5) return "제주";
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
