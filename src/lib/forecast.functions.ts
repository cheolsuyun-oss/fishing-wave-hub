import { supabase } from "./supabase";
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
  source: "ultra" | "short" | "extended" | "openmeteo";
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

async function callEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Edge Function ${name} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

type WindForecastHour = {
  hour: number;
  wsd: number | null;
  vec: number | null;
  tmp: number | null;
  pop: number | null;
  wav: number | null;
  source: "ultra" | "short" | "extended" | "openmeteo";
};

export async function getVillageForecastTimeline(data: {
  nx: number;
  ny: number;
  stationCode: string;
  range?: 1 | 3 | 5;
}): Promise<VillageForecastHour[]> {
  try {
    const range = data.range ?? 1;
    const rows = await callEdgeFunction<WindForecastHour[]>("get-wind-forecast", {
      station_code: data.stationCode,
      range,
    });

    const now = kstNow();
    const todayStr = kstDateStr(now);

    return rows.map((r) => {
      const dayDiff = Math.floor(r.hour / 24);
      const hourOfDay = r.hour % 24;
      const d = new Date(Date.UTC(
        parseInt(todayStr.slice(0, 4)),
        parseInt(todayStr.slice(5, 7)) - 1,
        parseInt(todayStr.slice(8, 10)) + dayDiff,
      ));
      const fcstDate = kstYMD(d);
      const fcstTime = `${String(hourOfDay).padStart(2, "0")}00`;
      return {
        fcstDate,
        fcstTime,
        hour: r.hour,
        tmp: r.tmp,
        wsd: r.wsd,
        vec: r.vec,
        pop: r.pop,
        wav: r.wav,
        source: r.source,
      };
    });
  } catch (err) {
    console.error("getVillageForecastTimeline failed:", err);
    return [];
  }
}

export async function getOpenMeteoTimeline(data: {
  nx: number;
  ny: number;
  stationCode: string;
}): Promise<VillageForecastHour[]> {
  try {
    const rows = await callEdgeFunction<WindForecastHour[]>("get-wind-forecast", {
      station_code: data.stationCode,
      range: 5,
    });

    const now = kstNow();
    const todayStr = kstDateStr(now);

    return rows
      .filter((r) => r.source === "openmeteo")
      .map((r) => {
        const dayDiff = Math.floor(r.hour / 24);
        const hourOfDay = r.hour % 24;
        const d = new Date(Date.UTC(
          parseInt(todayStr.slice(0, 4)),
          parseInt(todayStr.slice(5, 7)) - 1,
          parseInt(todayStr.slice(8, 10)) + dayDiff,
        ));
        const fcstDate = kstYMD(d);
        const fcstTime = `${String(hourOfDay).padStart(2, "0")}00`;
        return {
          fcstDate,
          fcstTime,
          hour: r.hour,
          tmp: r.tmp,
          wsd: r.wsd,
          vec: r.vec,
          pop: r.pop,
          wav: r.wav,
          source: r.source,
        };
      });
  } catch (err) {
    console.error("getOpenMeteoTimeline failed:", err);
    return [];
  }
}