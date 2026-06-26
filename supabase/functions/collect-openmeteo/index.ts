import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async () => {
  try {
    // 1. tide_station_regions에서 모든 관측소 lat/lng 조회
    const { data: stations, error: stationsError } = await supabase
      .from("tide_station_regions")
      .select("station_code, lat, lng");

    if (stationsError) throw stationsError;
    if (!stations || stations.length === 0) {
      return new Response(JSON.stringify({ message: "관측소 없음" }), {
        status: 200,
      });
    }

    // 2. 관측소별 Open-Meteo API 호출 및 upsert
    let successCount = 0;
    let errorCount = 0;

    for (const station of stations) {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${station.lat}` +
          `&longitude=${station.lng}` +
          `&hourly=windspeed_10m,winddirection_10m,windgusts_10m` +
          `&wind_speed_unit=ms` +
          `&models=best_match` +
          `&timezone=Asia%2FSeoul` +
          `&forecast_days=5`;

        const res = await fetch(url);
        if (!res.ok) {
          errorCount++;
          continue;
        }

        const json = await res.json();
        const times: string[] = json.hourly.time;
        const wsds: number[] = json.hourly.windspeed_10m;
        const vecs: number[] = json.hourly.winddirection_10m;
        const gusts: number[] = json.hourly.windgusts_10m;

        // nx/ny는 tide_station_regions에 없으므로 stations 테이블에서 조회
        const { data: stationMeta } = await supabase
          .from("stations")
          .select("nx, ny")
          .eq("code", station.station_code)
          .single();

        const nx = stationMeta?.nx ?? null;
        const ny = stationMeta?.ny ?? null;

        const rows = times.map((t, i) => ({
          station_code: station.station_code,
          forecast_dt: new Date(t).toISOString(),
          wsd: wsds[i]?.toString() ?? null,
          vec: vecs[i]?.toString() ?? null,
          gust: gusts[i]?.toString() ?? null,
          nx,
          ny,
          fetched_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from("forecasts_openmeteo")
          .upsert(rows, { onConflict: "station_code,forecast_dt" });

        if (upsertError) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({ message: "완료", successCount, errorCount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});