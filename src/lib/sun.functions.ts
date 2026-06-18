// 기상청 일출/일몰 API 호출 및 캐시

export interface SunInfo {
  sunrise: number; // 소수점 시간 (예: 5.5 = 5시 30분)
  sunset: number;
}

const TTL_MS = 12 * 60 * 60 * 1000; // 12시간 캐시
const cache = new Map<string, { at: number; data: SunInfo }>();

function todayKst(): string {
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  const yyyy = nowKst.getUTCFullYear();
  const mm = String(nowKst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowKst.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function hhmmToDecimal(hhmm: string): number {
  // "0531" → 5.516...
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4));
  return h + m / 60;
}

const FALLBACK: SunInfo = { sunrise: 5.5, sunset: 19.5 };

export async function getSunInfo(lat: number, lng: number): Promise<SunInfo> {
  const now = Date.now();
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.data;

  const apiKey = import.meta.env.VITE_KMA_API_KEY;
  if (!apiKey) return FALLBACK;

  const locdate = todayKst();
  const url = new URL(
    "http://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo",
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("locdate", locdate);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("dnYn", "Y");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Sun API ${res.status}`);
    const text = await res.text();

    // XML 파싱 (간단하게 정규식으로)
    const sunrise = text.match(/<sunrise>\s*(\d{4})\s*<\/sunrise>/)?.[1];
    const sunset = text.match(/<sunset>\s*(\d{4})\s*<\/sunset>/)?.[1];

    if (!sunrise || !sunset) throw new Error("파싱 실패");

    const data: SunInfo = {
      sunrise: hhmmToDecimal(sunrise),
      sunset: hhmmToDecimal(sunset),
    };
    cache.set(key, { at: now, data });
    return data;
  } catch (err) {
    console.error("Sun API failed:", err);
    cache.set(key, { at: now - (TTL_MS - 60_000), data: FALLBACK });
    return FALLBACK;
  }
}