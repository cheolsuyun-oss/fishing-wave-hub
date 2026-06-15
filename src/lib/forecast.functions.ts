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
const timelineCache = new Map<string, { at: number; data: VillageForecastHour[] }>();

function pickBase(): { baseDate: string; baseTime: string } {
  const nowKst = new Date(Date.now() + 9 * 3600_000 - 15 * 60_000);
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = nowKst.getUTCHours();
  let baseHour = slots.find((s) => s <= h);
  const date = new Date(nowKst);
  if (baseHour === undefined) {
    baseHour = 23;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return {
    baseDate: `${yyyy}${mm}${dd}`,
    baseTime: `${String(baseHour).padStart(2, "0")}00`,
  };
}

function pickNcstBase(): { baseDate: string; baseTime: string } {
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  const h = nowKst.getUTCHours();
  const m = nowKst.getUTCMinutes();
  const baseHour = m >= 40 ? h : h - 1;
  const safeH = ((baseHour % 24) + 24) % 24;
  const date = new Date(nowKst);
  if (m < 40 && h === 0) date.setUTCDate(date.getUTCDate() - 1);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return {
    baseDate: `${yyyy}${mm}${dd}`,
    baseTime: `${String(safeH).padStart(2, "0")}00`,
  };
}

function pickUltraShortBase(): { baseDate: string; baseTime: string } {
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  const h = nowKst.getUTCHours();
  const m = nowKst.getUTCMinutes();
  const baseHour = m >= 30 ? h : h - 1;
  const safeH = ((baseHour % 24) + 24) % 24;
  const date = new Date(nowKst);
  if (m < 30 && h === 0) date.setUTCDate(date.getUTCDate() - 1);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return {
    baseDate: `${yyyy}${mm}${dd}`,
    baseTime: `${String(safeH).padStart(2, "0")}30`,
  };
}

function currentKstHHMM(): string {
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  return `${String(nowKst.getUTCHours()).padStart(2, "0")}00`;
}

// 1단계: 초단기실황 (현재 실측값, 파고 없음)
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

// 2단계: 초단기예보 (6시간 이내, 파고 포함)
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

// 3단계: 단기예보 (72시간, 강수확률+파고 포함)
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
    // 1단계: 초단기실황 시도
    const ncst = await fetchNcst(data.nx, data.ny);

    // 파고는 실황에 없으므로 단기예보에서 별도 조회
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
      // 1단계 성공: 실황값 + 파고/강수확률은 단기예보에서
      const result: VillageForecast = {
        nx: data.nx, ny: data.ny,
        fcstDate: ncst.fcstDate ?? "",
        fcstTime: ncst.fcstTime ?? "",
        tmp: ncst.tmp ?? null,
        wsd: ncst.wsd ?? null,
        vec: ncst.vec ?? null,
        pop,
        wav,
        fetchedAt: now,
      };
      cache.set(key, { at: now, data: result });
      return result;
    }

    // 2단계: 초단기예보 시도
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

    // 3단계: 단기예보 폴백
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

export async function getVillageForecastTimeline(data: { nx: number; ny: number }): Promise<VillageForecastHour[]> {
  const now = Date.now();
  const key = `${data.nx},${data.ny}`;
  const hit = timelineCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;

  try {
    const items = await fetchItems(data.nx, data.ny);

    const todayKst = new Date(Date.now() + 9 * 3600_000);
    const todayStr = `${todayKst.getUTCFullYear()}${String(todayKst.getUTCMonth() + 1).padStart(2, "0")}${String(todayKst.getUTCDate()).padStart(2, "0")}`;

    const uniqKeys = Array.from(new Set(items.map((i) => `${i.fcstDate}${i.fcstTime}`))).sort();

    const pick = (cat: string, fcstDate: string, fcstTime: string) => {
      const it = items.find((i) => i.category === cat && i.fcstDate === fcstDate && i.fcstTime === fcstTime);
      if (!it) return null;
      const n = Number(it.fcstValue);
      return Number.isFinite(n) ? n : null;
    };

    const timeline: VillageForecastHour[] = uniqKeys.map((k) => {
      const fcstDate = k.slice(0, 8);
      const fcstTime = k.slice(8);
      const hourOfDay = parseInt(fcstTime.slice(0, 2), 10);
      const d1 = new Date(`${fcstDate.slice(0,4)}-${fcstDate.slice(4,6)}-${fcstDate.slice(6,8)}`);
      const d0 = new Date(`${todayStr.slice(0,4)}-${todayStr.slice(4,6)}-${todayStr.slice(6,8)}`);
      const dayDiff = Math.round((d1.getTime() - d0.getTime()) / 86400000);
      const hour = dayDiff * 24 + hourOfDay;

      return {
        fcstDate,
        fcstTime,
        hour,
        tmp: pick("TMP", fcstDate, fcstTime),
        wsd: pick("WSD", fcstDate, fcstTime),
        vec: pick("VEC", fcstDate, fcstTime),
        pop: pick("POP", fcstDate, fcstTime),
        wav: pick("WAV", fcstDate, fcstTime),
      };
    });

    timelineCache.set(key, { at: now, data: timeline });
    return timeline;
  } catch (err) {
    console.error("KMA timeline failed:", err);
    return [];
  }
}