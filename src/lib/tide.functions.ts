import { createServerFn } from "@tanstack/react-start";

export type TideEvent = {
  time: string; // "HH:MM"
  level: number; // cm
  type: "high" | "low";
};

export type TidePredict = {
  stationCode: string;
  date: string;
  events: TideEvent[];
  fetchedAt: number;
};

type ApiItem = {
  predcDt?: string;    // "YYYY-MM-DD HH:mm"
  predcTdlvVl?: string; // cm (string)
  extrSe?: string;     // "1"=오전고조 "2"=오전저조 "3"=오후고조 "4"=오후저조
};

const TTL_MS = 0;
const cache = new Map<string, { at: number; data: TidePredict }>();

function kstDateYYYYMMDD(d = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseHHMM(ts?: string): string {
  if (!ts) return "";
  const m = ts.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

function classifyHL(extrSe?: string): "high" | "low" | null {
  if (!extrSe) return null;
  const c = extrSe.trim();
  if (c === "1" || c === "3") return "high"; // 오전/오후 고조
  if (c === "2" || c === "4") return "low";  // 오전/오후 저조
  return null;
}

export const getTidePredict = createServerFn({ method: "GET" })
  .inputValidator((data: { stationCode: string; date?: string }) => data)
  .handler(async ({ data }): Promise<TidePredict> => {
    const date = data.date ?? kstDateYYYYMMDD();
    const key = `${data.stationCode}:${date}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) return hit.data;

    const empty: TidePredict = {
      stationCode: data.stationCode,
      date,
      events: [],
      fetchedAt: now,
    };

    const apiKey = process.env.KMA_API_KEY ?? process.env.VITE_KMA_API_KEY;
    if (!apiKey) {
      cache.set(key, { at: now, data: empty });
      return empty;
    }

    const url = new URL(
      "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService",
    );
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("type", "JSON");
    url.searchParams.set("numOfRows", "10");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("obsCode", data.stationCode);
    url.searchParams.set("reqDate", date);

    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        cache.set(key, { at: now, data: empty });
        return empty;
      }
      const json: unknown = await res.json();

      const items: ApiItem[] = (() => {
const root = json as Record<string, unknown> | null;
const body = (root?.body ?? (root?.response as Record<string, unknown> | undefined)?.body) as Record<string, unknown> | undefined;
        const itemsWrap = body?.items as
          | { item?: ApiItem | ApiItem[] }
          | undefined;
        const raw = itemsWrap?.item;
        if (!raw) return [];
        return Array.isArray(raw) ? raw : [raw];
      })();

      const events: TideEvent[] = items
        .map((it) => {
          const t = parseHHMM(it.predcDt);
          const lvl = Number(it.predcTdlvVl);
          const type = classifyHL(it.extrSe);
          if (!t || !Number.isFinite(lvl) || !type) return null;
          return { time: t, level: Math.round(lvl), type };
        })
        .filter((e): e is TideEvent => e !== null)
        .sort((a, b) => a.time.localeCompare(b.time));

      const result: TidePredict = {
        stationCode: data.stationCode,
        date,
        events,
        fetchedAt: now,
      };
      cache.set(key, { at: now, data: result });
      return result;
    } catch (err) {
      console.error("getTidePredict failed:", err);
      cache.set(key, { at: now, data: empty });
      return empty;
    }
  });