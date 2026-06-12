

export type VillageForecast = {
  nx: number;
  ny: number;
  fcstDate: string;
  fcstTime: string;
  tmp: number | null; // 기온 ℃
  wsd: number | null; // 풍속 m/s
  vec: number | null; // 풍향 deg (0~360, 0=N)
  pop: number | null; // 강수확률 %
  wav: number | null; // 파고 m
  fetchedAt: number;
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

// KMA base_time slots (KST): 0200, 0500, 0800, 1100, 1400, 1700, 2000, 2300
function pickBase(): { baseDate: string; baseTime: string } {
  // KST = UTC+9. Subtract ~15 min to account for publication delay.
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

export async function getVillageForecast(data: { nx: number; ny: number }): Promise<VillageForecast> {
    const now = Date.now();
    const key = `${data.nx},${data.ny}`;
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) return hit.data;

    const apiKey = import.meta.env.VITE_KMA_API_KEY;
    const empty: VillageForecast = {
      nx: data.nx,
      ny: data.ny,
      fcstDate: "",
      fcstTime: "",
      tmp: null,
      wsd: null,
      vec: null,
      pop: null,
      wav: null,
      fetchedAt: now,
    };
    if (!apiKey) {
      cache.set(key, { at: now, data: empty });
      return empty;
    }

    const { baseDate, baseTime } = pickBase();
    const url = new URL(
      "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
    );
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "1000");
    url.searchParams.set("dataType", "JSON");
    url.searchParams.set("base_date", baseDate);
    url.searchParams.set("base_time", baseTime);
    url.searchParams.set("nx", String(data.nx));
    url.searchParams.set("ny", String(data.ny));

    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`KMA fcst ${res.status}`);
      const json = (await res.json()) as {
        response?: { body?: { items?: { item?: FcstItem[] } } };
      };
      const items = json.response?.body?.items?.item ?? [];
      if (!items.length) throw new Error("empty items");

      // Pick fcstTime closest to current hour (>= current preferred, else nearest)
      const targetHHMM = currentKstHHMM();
      const uniqTimes = Array.from(
        new Set(items.map((i) => `${i.fcstDate}${i.fcstTime}`)),
      ).sort();
      const targetKey =
        uniqTimes.find((t) => t.slice(8) >= targetHHMM) ?? uniqTimes[0];

      const fcstDate = targetKey.slice(0, 8);
      const fcstTime = targetKey.slice(8);

      const pick = (cat: string) => {
        const it = items.find(
          (i) =>
            i.category === cat &&
            i.fcstDate === fcstDate &&
            i.fcstTime === fcstTime,
        );
        if (!it) return null;
        const n = Number(it.fcstValue);
        return Number.isFinite(n) ? n : null;
      };

      const result: VillageForecast = {
        nx: data.nx,
        ny: data.ny,
        fcstDate,
        fcstTime,
        tmp: pick("TMP"),
        wsd: pick("WSD"),
        vec: pick("VEC"),
        pop: pick("POP"),
        wav: pick("WAV"),
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
