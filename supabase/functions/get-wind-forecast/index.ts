import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;
const supabase = createClient(SB_URL, SB_KEY);

function kstNow() {
  return new Date(Date.now() + 9 * 3600_000);
}

function kstYMD(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function kstDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

type ForecastHour = {
  hour: number;
  wsd: number | null;
  vec: number | null;
  tmp: number | null;
  pop: number | null;
  wav: number | null;
  source: "ultra" | "short" | "extended" | "openmeteo";
};

function rowToHour(
  forecastDt: string,
  todayStr: string,
  fields: { wsd?: string | number | null; vec?: string | number | null; tmp?: string | number | null; pop?: string | number | null; wav?: string | number | null },
  source: ForecastHour["source"]
): ForecastHour {
  const utcMs = new Date(forecastDt).getTime();
  const kstMs = utcMs + 9 * 3600_000;
  const kstDate = new Date(kstMs);
  const hourOfDay = kstDate.getUTCHours();
  const fcstDateCompact = kstYMD(kstDate);

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

  const toNum = (v: string | number | null | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    hour,
    wsd: toNum(fields.wsd),
    vec: toNum(fields.vec),
    tmp: toNum(fields.tmp),
    pop: toNum(fields.pop),
    wav: toNum(fields.wav),
    source,
  };
}

function buildExtended(ultraRows: ForecastHour[], maxHour: number): ForecastHour[] {
  if (!ultraRows.length) return [];
  const last = ultraRows[ultraRows.length - 1];
  const extended: ForecastHour[] = [];
  for (let h = last.hour + 1; h < maxHour; h++) {
    extended.push({ hour: h, wsd: last.wsd, vec: null, tmp: last.tmp, pop: null, wav: null, source: "extended" });
  }
  return extended;
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

    // 1) forecasts_ultra (D0, ~+6h)
    const kstMidnightUtc = new Date(Date.now() + 9 * 3600_000);
kstMidnightUtc.setUTCHours(0, 0, 0, 0);
const ultraFrom = new Date(kstMidnightUtc.getTime() - 9 * 3600_000).toISOString();
    const kstEndOfDay = new Date(Date.now() + 9 * 3600_000);
kstEndOfDay.setUTCHours(23, 59, 59, 999);
const ultraTo = new Date(kstEndOfDay.getTime() - 9 * 3600_000).toISOString();
    const { data: ultraRows } = await supabase
      .rpc("get_latest_ultra", {
        p_station_code: station_code,
        p_from: ultraFrom,
        p_to: ultraTo,
      });

    const ultraTimeline: ForecastHour[] = (ultraRows ?? []).map((r) =>
      rowToHour(r.forecast_dt, todayStr, { wsd: r.wsd, vec: r.vec, tmp: r.t1h }, "ultra")
    );

    // range 1이면 ultra + short 당일분 병합 반환
    if (range === 1) {
      const shortFrom1 = new Date(Date.now() + 6 * 3600_000).toISOString();
      const shortTo1 = new Date(kstEndOfDay.getTime() - 9 * 3600_000).toISOString();
      const { data: shortRows1 } = await supabase
        .from("forecasts_short")
        .select("forecast_dt, wsd, vec, tmp, pop, wav")
        .eq("station_code", station_code)
        .gte("forecast_dt", shortFrom1)
        .lte("forecast_dt", shortTo1)
        .order("forecast_dt", { ascending: true })
        .limit(24);

      const shortTimeline1: ForecastHour[] = (shortRows1 ?? []).map((r) =>
        rowToHour(r.forecast_dt, todayStr, { wsd: r.wsd, vec: r.vec, tmp: r.tmp, pop: r.pop, wav: r.wav }, "short")
      );

      const ultraByHour1 = new Map(ultraTimeline.map((r) => [r.hour, r]));
      const shortByHour1 = new Map(shortTimeline1.map((r) => [r.hour, r]));
      const allHours1 = Array.from(new Set([...ultraByHour1.keys(), ...shortByHour1.keys()])).sort((a, b) => a - b);
      const merged1 = allHours1.map((h) => ultraByHour1.get(h) ?? shortByHour1.get(h)!);

      return new Response(JSON.stringify(merged1), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) forecasts_short (D1~D2, +6h~+72h)
    const shortFrom = new Date(Date.now() + 6 * 3600_000).toISOString();
    const shortTo = new Date(Date.now() + 72 * 3600_000).toISOString();
    const { data: shortRows } = await supabase
      .from("forecasts_short")
      .select("forecast_dt, wsd, vec, tmp, pop, wav")
      .eq("station_code", station_code)
      .gte("forecast_dt", shortFrom)
      .lte("forecast_dt", shortTo)
      .order("forecast_dt", { ascending: true })
      .limit(72);

    const shortTimeline: ForecastHour[] = (shortRows ?? []).map((r) =>
      rowToHour(r.forecast_dt, todayStr, { wsd: r.wsd, vec: r.vec, tmp: r.tmp, pop: r.pop, wav: r.wav }, "short")
    );

    const farTimeline = shortTimeline.length > 0
      ? shortTimeline
      : buildExtended(ultraTimeline, 72);

    // range 3이면 ultra + short 병합 반환
    if (range === 3) {
      const ultraByHour = new Map(ultraTimeline.map((r) => [r.hour, r]));
      const farByHour = new Map(farTimeline.map((r) => [r.hour, r]));
      const allHours = Array.from(new Set([...ultraByHour.keys(), ...farByHour.keys()])).sort((a, b) => a - b);
      const merged = allHours.map((h) => ultraByHour.get(h) ?? farByHour.get(h)!);
      return new Response(JSON.stringify(merged), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) forecasts_openmeteo (D3~D5, +73h~+121h)
    const omFrom = new Date(Date.now() + 73 * 3600_000).toISOString();
    const omTo = new Date(Date.now() + 121 * 3600_000).toISOString();
    const { data: omRows } = await supabase
      .from("forecasts_openmeteo")
      .select("forecast_dt, wsd, vec")
      .eq("station_code", station_code)
      .gte("forecast_dt", omFrom)
      .lte("forecast_dt", omTo)
      .order("forecast_dt", { ascending: true })
      .limit(48);

    const omTimeline: ForecastHour[] = (omRows ?? []).map((r) =>
      rowToHour(r.forecast_dt, todayStr, { wsd: r.wsd, vec: r.vec }, "openmeteo")
    );

    // ultra + short + openmeteo 병합
    const ultraByHour = new Map(ultraTimeline.map((r) => [r.hour, r]));
    const farByHour = new Map(farTimeline.map((r) => [r.hour, r]));
    const omByHour = new Map(omTimeline.map((r) => [r.hour, r]));
    const allHours = Array.from(
      new Set([...ultraByHour.keys(), ...farByHour.keys(), ...omByHour.keys()])
    ).sort((a, b) => a - b);
    const merged = allHours.map((h) => ultraByHour.get(h) ?? farByHour.get(h) ?? omByHour.get(h)!);

    return new Response(JSON.stringify(merged), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});