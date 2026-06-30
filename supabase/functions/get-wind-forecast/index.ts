import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;
const supabase = createClient(SB_URL, SB_KEY);

function kstNow() {
  return new Date(Date.now() + 9 * 3600_000);
}

function kstDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function kstYMD(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

type ForecastHour = {
  hour: number;
  wsd: number | null;
  vec: number | null;
  tmp: number | null;
  pop: number | null;
  wav: number | null;
  source: "ncst" | "ultra" | "short" | "openmeteo";
};

function toNum(v: string | number | null | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dtToHour(forecastDt: string, todayStr: string): number {
  const utcMs = new Date(forecastDt).getTime();
  const kstMs = utcMs + 9 * 3600_000;
  const kstDate = new Date(kstMs);
  const hourOfDay = kstDate.getUTCHours();
  const fcstYMD = kstYMD(kstDate);

  const todayY = parseInt(todayStr.slice(0, 4));
  const todayM = parseInt(todayStr.slice(5, 7)) - 1;
  const todayD = parseInt(todayStr.slice(8, 10));
  const kstY = parseInt(fcstYMD.slice(0, 4));
  const kstM = parseInt(fcstYMD.slice(4, 6)) - 1;
  const kstD = parseInt(fcstYMD.slice(6, 8));
  const dayDiff = Math.round(
    (Date.UTC(kstY, kstM, kstD) - Date.UTC(todayY, todayM, todayD)) / 86400000
  );
  return dayDiff * 24 + hourOfDay;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { station_code, range } = await req.json() as { station_code: string; range: 1 | 3 | 5 };
    if (!station_code || !range) throw new Error("station_code, range 필수");

    const now = kstNow();
    const todayStr = kstDateStr(now);
    const nowUtc = new Date().toISOString();

    // ── 1) 과거~현재: forecasts_ncst (base_dt 기준) ───────────────
    const kstMidnightUtc = new Date(Date.now() + 9 * 3600_000);
    kstMidnightUtc.setUTCHours(0, 0, 0, 0);
    const ncstFrom = new Date(kstMidnightUtc.getTime() - 9 * 3600_000).toISOString();

    const { data: ncstRows } = await supabase
      .from("forecasts_ncst")
      .select("base_dt, wsd, vec, t1h")
      .eq("station_code", station_code)
      .gte("base_dt", ncstFrom)
      .lte("base_dt", nowUtc)
      .order("base_dt", { ascending: true });

    const ncstByDt = new Map<string, typeof ncstRows[0]>();
    for (const r of (ncstRows ?? [])) {
      ncstByDt.set(r.base_dt, r);
    }
    const ncstTimeline: ForecastHour[] = Array.from(ncstByDt.values()).map((r) => ({
      hour: dtToHour(r.base_dt, todayStr),
      wsd: toNum(r.wsd),
      vec: toNum(r.vec),
      tmp: toNum(r.t1h),
      pop: null,
      wav: null,
      source: "ncst",
    }));

    // ── 2) 현재~+6h: fcst_ultra 최신 base_dt 1회분 ───────────────
    const { data: latestBaseRow } = await supabase
      .from("fcst_ultra")
      .select("base_dt")
      .eq("station_code", station_code)
      .order("base_dt", { ascending: false })
      .limit(1)
      .single();

    const ultraTimeline: ForecastHour[] = [];
    let ultraLastForecastDt: string | null = null;

    if (latestBaseRow) {
      const { data: ultraRows } = await supabase
        .from("fcst_ultra")
        .select("forecast_dt, wsd, vec, t1h")
        .eq("station_code", station_code)
        .eq("base_dt", latestBaseRow.base_dt)
        .gte("forecast_dt", new Date(Math.floor(Date.now() / 3600_000) * 3600_000).toISOString())
        .order("forecast_dt", { ascending: true });

      for (const r of (ultraRows ?? [])) {
        ultraTimeline.push({
          hour: dtToHour(r.forecast_dt, todayStr),
          wsd: toNum(r.wsd),
          vec: toNum(r.vec),
          tmp: toNum(r.t1h),
          pop: null,
          wav: null,
          source: "ultra",
        });
      }

      if (ultraRows && ultraRows.length > 0) {
        ultraLastForecastDt = ultraRows[ultraRows.length - 1].forecast_dt;
      }
    }

    // ── 3) ultra 마지막 forecast_dt 다음부터 short ────────────────
    const shortFrom = ultraLastForecastDt
      ? new Date(new Date(ultraLastForecastDt).getTime() + 3600_000).toISOString()
      : new Date(Date.now() + 3600_000).toISOString();

    // range 1은 당일(KST 23:59)까지, range 3/5는 72h까지
    const kstEndOfDay = new Date(Date.now() + 9 * 3600_000);
    kstEndOfDay.setUTCHours(23, 59, 59, 999);
    const shortTo = range === 1
      ? new Date(kstEndOfDay.getTime() - 9 * 3600_000).toISOString()
      : new Date(Date.now() + 72 * 3600_000).toISOString();

    const { data: shortRows } = await supabase
      .from("forecasts_short")
      .select("forecast_dt, wsd, vec, tmp, pop, wav")
      .eq("station_code", station_code)
      .gte("forecast_dt", shortFrom)
      .lte("forecast_dt", shortTo)
      .order("forecast_dt", { ascending: true })
      .limit(72);

    const shortTimeline: ForecastHour[] = (shortRows ?? []).map((r) => ({
      hour: dtToHour(r.forecast_dt, todayStr),
      wsd: toNum(r.wsd),
      vec: toNum(r.vec),
      tmp: toNum(r.tmp),
      pop: toNum(r.pop),
      wav: toNum(r.wav),
      source: "short",
    }));

    // range 1, 3 공통 병합 함수
    const mergeAll = (...timelines: ForecastHour[][]) => {
      const byHour = new Map<number, ForecastHour>();
      for (const tl of timelines)
        for (const r of tl) byHour.set(r.hour, r);
      return Array.from(byHour.values()).sort((a, b) => a.hour - b.hour);
    };

    if (range === 1 || range === 3) {
      return new Response(JSON.stringify(mergeAll(ncstTimeline, ultraTimeline, shortTimeline)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4) +73h~: forecasts_openmeteo ────────────────────────────
    const omFrom = new Date(Date.now() + 73 * 3600_000).toISOString();
    const omTo   = new Date(Date.now() + 121 * 3600_000).toISOString();
    const { data: omRows } = await supabase
      .from("forecasts_openmeteo")
      .select("forecast_dt, wsd, vec")
      .eq("station_code", station_code)
      .gte("forecast_dt", omFrom)
      .lte("forecast_dt", omTo)
      .order("forecast_dt", { ascending: true })
      .limit(48);

    const omTimeline: ForecastHour[] = (omRows ?? []).map((r) => ({
      hour: dtToHour(r.forecast_dt, todayStr),
      wsd: toNum(r.wsd),
      vec: toNum(r.vec),
      tmp: null,
      pop: null,
      wav: null,
      source: "openmeteo",
    }));

    return new Response(JSON.stringify(mergeAll(ncstTimeline, ultraTimeline, shortTimeline, omTimeline)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});