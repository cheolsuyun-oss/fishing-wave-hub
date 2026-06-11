import { createServerFn } from "@tanstack/react-start";
import { supabase } from "./supabase";

type UltraShortItem = {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
  nx: number;
  ny: number;
};

function kstNow() {
  return new Date(Date.now() + 9 * 3600_000);
}

function kstDateYYYYMMDD(d = kstNow()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function baseTime() {
  const now = kstNow();
  const h = now.getUTCHours();
  const min = now.getUTCMinutes();
  // 매 시간 30분에 발표 → 현재 시각 기준 가장 최근 발표 시각
  const bh = min >= 30 ? h : h - 1;
  const safeH = ((bh % 24) + 24) % 24;
  return String(safeH).padStart(2, "0") + "30";
}

export const saveUltraShortForecast = createServerFn({ method: "GET" })
  .inputValidator((data: { pointId: string; nx: number; ny: number }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.KMA_API_KEY ?? process.env.VITE_KMA_API_KEY;
    if (!apiKey) return { success: false, error: "no api key" };

    const date = kstDateYYYYMMDD();
    const bt = baseTime();

    const url = new URL(
      "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst"
    );
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("numOfRows", "60");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("dataType", "JSON");
    url.searchParams.set("base_date", date);
    url.searchParams.set("base_time", bt);
    url.searchParams.set("nx", String(data.nx));
    url.searchParams.set("ny", String(data.ny));

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return { success: false, error: "fetch failed" };
      const json = await res.json() as Record<string, unknown>;

      const body = (json?.response as Record<string, unknown>)?.body as Record<string, unknown>;
      const items = (body?.items as Record<string, unknown>)?.item as UltraShortItem[];
      if (!items?.length) return { success: false, error: "no items" };

      // 카테고리별로 그룹핑
      const byTime = new Map<string, Record<string, string>>();
      for (const item of items) {
        const key = `${item.fcstDate}_${item.fcstTime}`;
        if (!byTime.has(key)) byTime.set(key, {});
        byTime.get(key)![item.category] = item.fcstValue;
      }

      // Supabase에 저장할 rows 생성
      const rows = Array.from(byTime.entries()).map(([key, cats]) => {
        const [d, t] = key.split("_");
        const dt = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:00+09:00`;
        return {
          point_id: data.pointId,
          forecast_dt: dt,
          wind_speed: cats.WSD ? parseFloat(cats.WSD) : null,
          wind_dir: cats.VEC ? parseInt(cats.VEC) : null,
          wave_height: cats.WAV ? parseFloat(cats.WAV) : null,
          precip_type: cats.PTY ? parseInt(cats.PTY) : null,
          precip_1h: cats.RN1 ? parseFloat(cats.RN1) : null,
          temp: cats.T1H ? parseFloat(cats.T1H) : null,
          source: "ultra_short",
        };
      });

      // upsert (중복 저장 방지)
      const { error } = await supabase
        .from("marine_forecasts")
        .upsert(rows, { onConflict: "point_id,forecast_dt" });

      if (error) return { success: false, error: error.message };
      return { success: true, count: rows.length };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });