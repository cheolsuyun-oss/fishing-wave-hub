import { supabase } from "./supabase";
import { nearestStationCodeByGrid } from "./geo";
import { debugLog } from "./debug";
import { kstNow, kstYMD, kstDateStr, kstTodayStartUTC } from "./time";

export type VillageForecast = {
  nx: number;
  ny: number;
  fcstDate: string;
  fcstTime: string;
  tmp: number | null;
  wsd: number | null;
  vec: number | null;
  pop: number | null;
  wav: number | null;
  fetchedAt: number;
};

export type VillageForecastHour = {
  fcstDate: string;
  fcstTime: string;
  hour: number;
  tmp: number | null;
  wsd: number | null;
  vec: number | null;
  pop: number | null;
  wav: number | null;
  source: "ultra" | "short" | "extended";
};

type FcstItem = {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
  nx: number;
  ny: number;
};

type NcstItem = {
  category: string;
  obsrValue: string;
};

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; data: VillageForecast }>();

function kstHH(d: Date): number {
  return d.getUTCHours();
}

function kstMM(d: Date): number {
  return d.getUTCMinutes();
}

function pickBase(): { baseDate: string; baseTime: string } {
  const now = kstNow();
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = kstHH(now);
  const m = kstMM(now);
  const effectiveH = m >= 15 ? h : h - 1;
  let baseHour = slots.find((s) => s <= ((effectiveH % 24 + 24) % 24));
  const date = new Date(now);
  if (baseHour === undefined) {
    baseHour = 23;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return {
    baseDate: kstYMD(date),
    baseTime: `${String(baseHour).padStart(2, "0")}00`,
  };
}

function pickNcstBase(): { baseDate: string; baseTime: string } {
  const now = kstNow();
  const h = kstHH(now);
  const m = kstMM(now);
  const baseHour = m >= 40 ? h : h - 1;
  const safeH = ((baseHour % 24) + 24) % 24;
  const date = new Date(now);
  if (m < 40 && h === 0) date.setUTCDate(date.getUTCDate() - 1);
  return {
    baseDate: kstYMD(date),
    baseTime: `${String(safeH).padStart(2, "0")}00`,
  };
}

function pickUltraShortBase(): { baseDate: string; baseTime: string } {
  const now = kstNow();
  const h = kstHH(now);
  const m = kstMM(now);
  const baseHour = m >= 30 ? h : h - 1;
  const safeH = ((baseHour % 24) + 24) % 24;
  const date = new Date(now);
  if (m < 30 && h === 0) date.setUTCDate(date.getUTCDate() - 1);
  return {
    baseDate: kstYMD(date),
    baseTime: `${String(safeH).padStart(2, "0")}30`,
  };
}

function currentKstHHMM(): string {
  const now = kstNow();
  return `${String(kstHH(now)).padStart(2, "0")}00`;
}

async function fetchNcst(nx: number, ny: number): Promise<Partial<VillageForecast> | null> {
  const apiKey = import.meta.env.VITE_KMA_API_KEY;
  if (!apiKey) return null;
  const { baseDate, baseTime } = pickNcstBase();
  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "60");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = await res.json() as { response?: { body?: { items?: { item?: NcstItem[] } } } };
    const items = json.response?.body?.items?.item ?? [];
    if (!items.length) return null;
    const pick = (cat: string) => {
      const it = items.find((i) => i.category === cat);
      if (!it) return null;
      const n = Number(it.obsrValue);
      return Number.isFinite(n) ? n : null;
    };
    return {
      fcstDate: baseDate,
      fcstTime: baseTime,
      tmp: pick("T1H"),
      wsd: pick("WSD"),
      vec: pick("VEC"),
      pop: null,
      wav: null,
    };
  } catch {
    return null;
  }
}

async function fetchUltraShort(nx: number, ny: number): Promise<Partial<VillageForecast> | null> {
  const apiKey = import.meta.env.VITE_KMA_API_KEY;
  if (!apiKey) return null;
  const { baseDate, baseTime } = pickUltraShortBase();
  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "60");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = await res.json() as { response?: { body?: { items?: { item?: FcstItem[] } } } };
    const items = json.response?.body?.items?.item ?? [];
    if (!items.length) return null;
    const nowHHMM = currentKstHHMM();
    const uniqTimes = Array.from(new Set(items.map((i) => `${i.fcstDate}${i.fcstTime}`))).sort();
    const targetKey = uniqTimes.find((t) => t.slice(8) >= nowHHMM) ?? uniqTimes[0];
    const fcstDate = targetKey.slice(0, 8);
    const fcstTime = targetKey.slice(8);
    const pick = (cat: string) => {
      const it = items.find((i) => i.category === cat && i.fcstDate === fcstDate && i.fcstTime === fcstTime);
      if (!it) return null;
      const n = Number(it.fcstValue);
      return Number.isFinite(n) ? n : null;
    };
    return {
      fcstDate, fcstTime,
      tmp: pick("T1H"),
      wsd: pick("WSD"),
      vec: pick("VEC"),
      pop: null,
      wav: pick("WAV"),
    };
  } catch {
    return null;
  }
}

async function fetchItems(nx: number, ny: number): Promise<FcstItem[]> {
  const apiKey = import.meta.env.VITE_KMA_API_KEY;
  if (!apiKey) return [];
  const { baseDate, baseTime } = pickBase();
  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`KMA fcst ${res.status}`);
  const json = (await res.json()) as {
    response?: { body?: { items?: { item?: FcstItem[] } } };
  };
  const items = json.response?.body?.items?.item ?? [];
  if (!items.length) throw new Error("empty items");
  return items;
}

export async function getVillageForecast(data: { nx: number; ny: number }): Promise<VillageForecast> {
  const now = Date.now();
  const key = `${data.nx},${data.ny}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;

  const empty: VillageForecast = {
    nx: data.nx, ny: data.ny,
    fcstDate: "", fcstTime: "",
    tmp: null, wsd: null, vec: null, pop: null, wav: null,
    fetchedAt: now,
  };

  try {
    const ncst = await fetchNcst(data.nx, data.ny);

    let wav: number | null = null;
    let pop: number | null = null;
    try {
      const items = await fetchItems(data.nx, data.ny);
      const targetHHMM = currentKstHHMM();
      const uniqTimes = Array.from(new Set(items.map((i) => `${i.fcstDate}${i.fcstTime}`))).sort();
      const targetKey = uniqTimes.find((t) => t.slice(8) >= targetHHMM) ?? uniqTimes[0];
      const fcstDate = targetKey.slice(0, 8);
      const fcstTime = targetKey.slice(8);
      const pick = (cat: string) => {
        const it = items.find((i) => i.category === cat && i.fcstDate === fcstDate && i.fcstTime === fcstTime);
        if (!it) return null;
        const n = Number(it.fcstValue);
        return Number.isFinite(n) ? n : null;
      };
      wav = pick("WAV");
      pop = pick("POP");
    } catch { /* 파고 조회 실패해도 계속 진행 */ }

    if (ncst) {
      const result: VillageForecast = {
        nx: data.nx, ny: data.ny,
        fcstDate: ncst.fcstDate ?? "",
        fcstTime: ncst.fcstTime ?? "",
        tmp: ncst.tmp ?? null,
        wsd: ncst.wsd ?? null,
        vec: ncst.vec ?? null,
        pop, wav,
        fetchedAt: now,
      };
      cache.set(key, { at: now, data: result });
      return result;
    }

    const ultra = await fetchUltraShort(data.nx, data.ny);
    if (ultra) {
      const result: VillageForecast = {
        nx: data.nx, ny: data.ny,
        fcstDate: ultra.fcstDate ?? "",
        fcstTime: ultra.fcstTime ?? "",
        tmp: ultra.tmp ?? null,
        wsd: ultra.wsd ?? null,
        vec: ultra.vec ?? null,
        pop,
        wav: ultra.wav ?? wav,
        fetchedAt: now,
      };
      cache.set(key, { at: now, data: result });
      return result;
    }

    const items = await fetchItems(data.nx, data.ny);
    const targetHHMM = currentKstHHMM();
    const uniqTimes = Array.from(new Set(items.map((i) => `${i.fcstDate}${i.fcstTime}`))).sort();
    const targetKey = uniqTimes.find((t) => t.slice(8) >= targetHHMM) ?? uniqTimes[0];
    const fcstDate = targetKey.slice(0, 8);
    const fcstTime = targetKey.slice(8);
    const pick = (cat: string) => {
      const it = items.find((i) => i.category === cat && i.fcstDate === fcstDate && i.fcstTime === fcstTime);
      if (!it) return null;
      const n = Number(it.fcstValue);
      return Number.isFinite(n) ? n : null;
    };
    const result: VillageForecast = {
      nx: data.nx, ny: data.ny, fcstDate, fcstTime,
      tmp: pick("TMP"), wsd: pick("WSD"), vec: pick("VEC"),
      pop: pick("POP"), wav: pick("WAV"),
      fetchedAt: now,
    };
    cache.set(key, { at: now, data: result });
    return result;

  } catch (err) {
    console.error("KMA village forecast failed:", err);
    cache.set(key, { at: now - (TTL_MS - 60_000), data: empty });
    return empty;
  }
}

async function traceDbQuery(stationCode: string, forecastDt: string, windSpeed: number | null, note?: string) {
  try {
    await supabase.from("debug_trace").insert({
      trace_key: `${stationCode}|${forecastDt}`,
      node: "db_query",
      wind_speed: windSpeed,
      note: note ?? null,
    });
  } catch {
    // 트레이싱 실패는 조용히 무시
  }
}

async function getTimelineFromSupabase(nx: number, ny: number): Promise<VillageForecastHour[]> {
  const stationCode = await nearestStationCodeByGrid(nx, ny);
  debugLog("forecast_pipeline", "nx,ny:", nx, ny, "-> stationCode:", stationCode);

  if (!stationCode) {
    debugLog("forecast_pipeline", "stationCode null — 관측소 매칭 실패, 빈 배열 반환");
    return [];
  }

  const now = kstNow();
  const todayStr = kstDateStr(now);
  const fromUtcIso = kstTodayStartUTC();
  const toUtcIso = new Date(Date.now() + 6 * 3600_000).toISOString();

  debugLog("forecast_pipeline", "query range (UTC):", fromUtcIso, "~", toUtcIso);

  const { data, error } = await supabase
    .from("forecasts_ultra")
    .select("forecast_dt, wsd, vec, t1h")
    .eq("station_code", stationCode)
    .gte("forecast_dt", fromUtcIso)
    .lte("forecast_dt", toUtcIso)
    .order("forecast_dt", { ascending: true })
    .limit(30);

  if (error || !data || data.length < 1) {
    debugLog("forecast_pipeline", "supabase ultra data empty. error:", error);
    await traceDbQuery(stationCode, fromUtcIso, null, error ? `조회 에러: ${error.message}` : "빈 결과");
    return [];
  }
  debugLog("forecast_pipeline", "supabase ultra rows:", data.length, data.map((r) => r.forecast_dt));

  const firstRow = data[0];
  const firstRowUtcMs = new Date(firstRow.forecast_dt as string).getTime();
  const firstRowKst = new Date(firstRowUtcMs + 9 * 3600_000);
  const firstRowKstIso = `${firstRowKst.getUTCFullYear()}-${String(firstRowKst.getUTCMonth() + 1).padStart(2, "0")}-${String(firstRowKst.getUTCDate()).padStart(2, "0")}T${String(firstRowKst.getUTCHours()).padStart(2, "0")}:00:00+09:00`;
  await traceDbQuery(stationCode, firstRowKstIso, (firstRow as { wsd?: number | null }).wsd ?? null, "조회 성공");

  return data.map((row) => {
    const utcMs = new Date(row.forecast_dt as string).getTime();
    const kstMs = utcMs + 9 * 3600_000;
    const kstDate = new Date(kstMs);
    const hourOfDay = kstDate.getUTCHours();
    const fcstDateCompact = kstYMD(kstDate);
    const fcstTime = `${String(hourOfDay).padStart(2, "0")}00`;

    const todayY = parseInt(todayStr.slice(0, 4));
    const todayM = parseInt(todayStr.slice(5, 7)) - 1;
    const todayD = parseInt(todayStr.slice(8, 10));
    const kstY = parseInt(fcstDateCompact.slice(0, 4));
    const kstM = parseInt(fcstDateCompact.slice(4, 6)) - 1;
    const kstD = parseInt(fcstDateCompact.slice(6, 8));
    const dayDiff = Math.round(
      (Date.UTC(kstY, kstM, kstD) - Date.UTC(todayY, todayM, todayD)) / 86400000
    );
    const hour = dayDiff * 24 + hourOfDay;

    return {
      fcstDate: fcstDateCompact,
      fcstTime,
      hour,
      tmp: (row as { t1h?: number | null }).t1h ?? null,
      wsd: (row as { wsd?: number | null }).wsd ?? null,
      vec: (row as { vec?: number | null }).vec ?? null,
      pop: null,
      wav: null,
      source: "ultra" as const,
    };
  });
}

async function getShortTimelineFromSupabase(nx: number, ny: number): Promise<VillageForecastHour[]> {
  const stationCode = await nearestStationCodeByGrid(nx, ny);
  if (!stationCode) return [];

  const now = kstNow();
  const todayStr = kstDateStr(now);
  const fromUtcIso = new Date(Date.now() + 6 * 3600_000).toISOString();
  const toUtcIso = new Date(Date.now() + 72 * 3600_000).toISOString();

  debugLog("forecast_pipeline", "short query range (UTC):", fromUtcIso, "~", toUtcIso);

  const { data, error } = await supabase
    .from("forecasts_short")
    .select("forecast_dt, tmp, wsd, vec, pop, wav")
    .eq("station_code", stationCode)
    .gte("forecast_dt", fromUtcIso)
    .lte("forecast_dt", toUtcIso)
    .order("forecast_dt", { ascending: true })
    .limit(72);

  if (error || !data || data.length < 1) {
    debugLog("forecast_pipeline", "forecasts_short empty. error:", error);
    return [];
  }

  return data.map((row) => {
    const utcMs = new Date(row.forecast_dt as string).getTime();
    const kstMs = utcMs + 9 * 3600_000;
    const kstDate = new Date(kstMs);
    const hourOfDay = kstDate.getUTCHours();
    const fcstDateCompact = kstYMD(kstDate);
    const fcstTime = `${String(hourOfDay).padStart(2, "0")}00`;

    const todayY = parseInt(todayStr.slice(0, 4));
    const todayM = parseInt(todayStr.slice(5, 7)) - 1;
    const todayD = parseInt(todayStr.slice(8, 10));
    const kstY = parseInt(fcstDateCompact.slice(0, 4));
    const kstM = parseInt(fcstDateCompact.slice(4, 6)) - 1;
    const kstD = parseInt(fcstDateCompact.slice(6, 8));
    const dayDiff = Math.round(
      (Date.UTC(kstY, kstM, kstD) - Date.UTC(todayY, todayM, todayD)) / 86400000
    );
    const hour = dayDiff * 24 + hourOfDay;

    return {
      fcstDate: fcstDateCompact,
      fcstTime,
      hour,
      tmp: (row as { tmp?: number | null }).tmp ?? null,
      wsd: (row as { wsd?: number | null }).wsd ?? null,
      vec: (row as { vec?: number | null }).vec ?? null,
      pop: (row as { pop?: number | null }).pop ?? null,
      wav: (row as { wav?: number | null }).wav ?? null,
      source: "short" as const,
    };
  });
}

function buildExtendedTimeline(
  ultraTimeline: VillageForecastHour[],
  maxHour: number
): VillageForecastHour[] {
  if (!ultraTimeline.length) return [];
  const last = ultraTimeline[ultraTimeline.length - 1];
  const lastHour = last.hour;
  const extended: VillageForecastHour[] = [];
  for (let h = lastHour + 1; h < maxHour; h++) {
    extended.push({
      fcstDate: last.fcstDate,
      fcstTime: last.fcstTime,
      hour: h,
      tmp: last.tmp,
      wsd: last.wsd,
      vec: null,
      pop: null,
      wav: null,
      source: "extended",
    });
  }
  return extended;
}

export async function getVillageForecastTimeline(data: { nx: number; ny: number }): Promise<VillageForecastHour[]> {
  try {
    const now = kstNow();

    // 1) past + near 구간: forecasts_ultra DB
    const ultraTimeline = await getTimelineFromSupabase(data.nx, data.ny);
    debugLog("forecast_pipeline", "ultraTimeline hours:", ultraTimeline.map((r) => r.hour));

    // 2) far 구간: forecasts_short DB
    const shortTimeline = await getShortTimelineFromSupabase(data.nx, data.ny);
    debugLog("forecast_pipeline", "shortTimeline hours:", shortTimeline.map((r) => r.hour));

    // 3) forecasts_short 비어있으면 ultra 마지막 값으로 flat 연장
    const farTimeline = shortTimeline.length > 0
      ? shortTimeline
      : buildExtendedTimeline(ultraTimeline, 72);

    // 4) 병합 (ultra 우선)
    const ultraByHour = new Map(ultraTimeline.map((r) => [r.hour, r]));
    const farByHour = new Map(farTimeline.map((r) => [r.hour, r]));
    const allHours = Array.from(
      new Set([...ultraByHour.keys(), ...farByHour.keys()])
    ).sort((a, b) => a - b);

    const merged = allHours.map((h) => ultraByHour.get(h) ?? farByHour.get(h)!);
    debugLog("forecast_pipeline", "merged hours:", merged.map((r) => r.hour));
    return merged;

  } catch (err) {
    console.error("KMA timeline failed:", err);
    return [];
  }
}