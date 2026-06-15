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
  hour: number;       // 0~23 (당일 기준 절대 시각, 다음날은 24+)
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

function currentKstHHMM(): string {
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  return `${String(nowKst.getUTCHours()).padStart(2, "0")}00`;
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
      tmp: pick("TMP"), wsd: pick("WSD"), vec: pick("VEC"), pop: pick("POP"), wav: pick("WAV"),
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

    // 기준일 (오늘 KST)
    const todayKst = new Date(Date.now() + 9 * 3600_000);
    const todayStr = `${todayKst.getUTCFullYear()}${String(todayKst.getUTCMonth() + 1).padStart(2, "0")}${String(todayKst.getUTCDate()).padStart(2, "0")}`;

    // 고유 시각 목록 정렬
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
      // 날짜 차이 계산 (다음날이면 +24, 모레면 +48)
      const diffDays = (Number(fcstDate) - Number(todayStr)) /
        (Number(todayStr.slice(0,4)) > 0 ? 1 : 1); // 단순 날짜 문자열 차이
      // 더 정확한 날짜 차이
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