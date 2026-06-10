import { createServerFn } from "@tanstack/react-start";

// In-memory cache (per worker instance). TTL: 5 minutes.
let cache: { at: number; data: KmaWarningResult } | null = null;
const TTL_MS = 5 * 60 * 1000;

export type KmaWarningResult = {
  hasWarning: boolean;
  message: string | null;
  fetchedAt: number;
};

type KmaItem = {
  t6?: string; // 특보내용
  tmFc?: string; // 발표시각
  stnId?: string;
};

export const getWeatherWarning = createServerFn({ method: "GET" }).handler(
  async (): Promise<KmaWarningResult> => {
    const now = Date.now();
    if (cache && now - cache.at < TTL_MS) return cache.data;

    const apiKey = process.env.KMA_API_KEY;
    if (!apiKey) {
      const fallback: KmaWarningResult = {
        hasWarning: false,
        message: null,
        fetchedAt: now,
      };
      cache = { at: now, data: fallback };
      return fallback;
    }

    // 발표시각: 오늘 00시(yyyymmdd0000) 이후 특보 조회
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const fromTmFc = `${yyyy}${mm}${dd}0000`;

    const url = new URL(
      "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg",
    );
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "10");
    url.searchParams.set("dataType", "JSON");
    url.searchParams.set("stnId", "108"); // 전국
    url.searchParams.set("fromTmFc", fromTmFc);

    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`KMA ${res.status}`);
      const json = (await res.json()) as {
        response?: {
          body?: { items?: { item?: KmaItem[] | KmaItem } };
          header?: { resultCode?: string; resultMsg?: string };
        };
      };

      const raw = json.response?.body?.items?.item;
      const items: KmaItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const latest = items[0];
      const text = latest?.t6?.trim();

      const result: KmaWarningResult = text
        ? {
            hasWarning: true,
            message: text.length > 120 ? `${text.slice(0, 120)}…` : text,
            fetchedAt: now,
          }
        : { hasWarning: false, message: null, fetchedAt: now };

      cache = { at: now, data: result };
      return result;
    } catch (err) {
      console.error("KMA warning fetch failed:", err);
      const fallback: KmaWarningResult = {
        hasWarning: false,
        message: null,
        fetchedAt: now,
      };
      // Short cache on failure to avoid hammering
      cache = { at: now - (TTL_MS - 30_000), data: fallback };
      return fallback;
    }
  },
);
