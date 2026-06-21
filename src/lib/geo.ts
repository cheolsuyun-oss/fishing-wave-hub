import type { FishingPoint } from "./points";
import { supabase } from "./supabase";

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

// 조석 관측소 — Supabase tide_station_regions 테이블 기반 (29차 세션, JSON 파일 대체)
export type TideStationRegion = {
  station_code: string;
  lat: number;
  lng: number;
  nx: number;
  ny: number;
  sido: string | null;
  sigungu: string | null;
  address_etc: string | null;
  sea: FishingPoint["sea"]; // 한글: 동해/서해/남해/제주
  sea_etc: string | null; // 한글: 북부/중부/남부/서부/동부
  mid_land_ta_reg_id: string | null;
  mid_sea_reg_id: string | null;
  note: string | null;
};

const LOCAL_CACHE_KEY = "tide_station_regions_cache";
const LOCAL_CACHE_VERSION_KEY = "tide_station_regions_cache_version";
const APP_DATA_VERSION_KEY = "tide_stations"; // app_data_versions.key

let memoryCache: TideStationRegion[] | null = null;

// app_data_versions 테이블의 현재 버전 조회
async function fetchRemoteVersion(): Promise<number | null> {
  const { data, error } = await supabase
    .from("app_data_versions")
    .select("version")
    .eq("key", APP_DATA_VERSION_KEY)
    .maybeSingle();
  if (error || !data) return null;
  return data.version as number;
}

// tide_station_regions 전체 조회 (172건)
async function fetchAllStationRegions(): Promise<TideStationRegion[]> {
  const { data, error } = await supabase
    .from("tide_station_regions")
    .select(
      "station_code, lat, lng, nx, ny, sido, sigungu, address_etc, sea, sea_etc, mid_land_ta_reg_id, mid_sea_reg_id, note",
    );
  if (error || !data) return [];
  return data as TideStationRegion[];
}

/**
 * 172개 관측소 데이터를 반환. 다음 우선순위로 가져온다:
 * 1) 메모리 캐시 (같은 세션 내 재호출)
 * 2) localStorage 캐시 (버전 일치 시)
 * 3) Supabase 재조회 (버전 불일치 또는 캐시 없음 시) → localStorage 갱신
 *
 * 비로그인 상태(RLS로 인해 조회 결과가 빈 배열)인 경우 빈 배열을 반환한다.
 * 호출부는 빈 배열일 때 기존 하드코딩 샘플 포인트(묵호/대천/통영) 흐름으로 폴백해야 한다.
 */
export async function getStationRegions(): Promise<TideStationRegion[]> {
  if (memoryCache) return memoryCache;

  const remoteVersion = await fetchRemoteVersion();

  // 버전 조회 실패 시(비로그인 등) 로컬 캐시가 있으면 일단 그것을 사용
  if (remoteVersion === null) {
    const cached = readLocalCache();
    if (cached) {
      memoryCache = cached;
      return cached;
    }
    return [];
  }

  const localVersion = Number(localStorage.getItem(LOCAL_CACHE_VERSION_KEY) ?? "0");
  if (localVersion === remoteVersion) {
    const cached = readLocalCache();
    if (cached) {
      memoryCache = cached;
      return cached;
    }
  }

  // 버전 불일치 또는 캐시 없음 → 재조회
  const fresh = await fetchAllStationRegions();
  if (fresh.length > 0) {
    memoryCache = fresh;
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(fresh));
      localStorage.setItem(LOCAL_CACHE_VERSION_KEY, String(remoteVersion));
    } catch {
      // localStorage 용량 초과 등은 무시 (메모리 캐시는 유지됨)
    }
  }
  return fresh;
}

function readLocalCache(): TideStationRegion[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TideStationRegion[];
  } catch {
    return null;
  }
}

// 위경도 기준 가장 가까운 관측소 반환 (비로그인 등으로 데이터 없으면 null)
export async function nearestTideStation(
  lat: number,
  lng: number,
): Promise<TideStationRegion | null> {
  const stations = await getStationRegions();
  if (stations.length === 0) return null;

  let best = stations[0];
  let bestD = Infinity;
  for (const s of stations) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// nx/ny 격자 기준으로 가장 가까운 관측소 station_code 반환 (없으면 null)
export async function nearestStationCodeByGrid(
  nx: number,
  ny: number,
): Promise<string | null> {
  const stations = await getStationRegions();
  if (stations.length === 0) return null;

  let bestCode = stations[0].station_code;
  let bestD = Infinity;
  for (const s of stations) {
    const d = Math.sqrt((s.nx - nx) ** 2 + (s.ny - ny) ** 2);
    if (d < bestD) {
      bestD = d;
      bestCode = s.station_code;
    }
  }
  return bestCode;
}

// 좌표 기반 해역 추정 (제주권 포함 4분류) — 신규 포인트 등록 시 DB 매칭 전 임시 추정용으로 유지
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