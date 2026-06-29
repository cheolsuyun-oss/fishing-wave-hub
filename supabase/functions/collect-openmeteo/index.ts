import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;
const supabase = createClient(SB_URL, SB_KEY);

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const offset = Number(body.offset ?? 0);
    const limit = 20;

    const { data: stations, error: stationsError } = await supabase
      .from("tide_station_regions")
      .select("station_code, lat, lng")
      .range(offset, offset + limit - 1);

    if (stationsError) throw stationsError;
    if (!stations || stations.length === 0) {
      return new Response(JSON.stringify({ message: "완료", offset, count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

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
        if (!res.ok) { errorCount++; continue; }

        const json = await res.json();
        const times = json.hourly.time;
        const wsds = json.hourly.windspeed_10m;
        const vecs = json.hourly.winddirection_10m;
        const gusts = json.hourly.windgusts_10m;

        const { data: stationMeta } = await supabase
          .from("stations")
          .select("nx, ny")
          .eq("code", station.station_code)
          .single();

        const nx = stationMeta?.nx ?? null;
        const ny = stationMeta?.ny ?? null;

        const rows = times.map((t: string, i: number) => ({
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

        if (upsertError) { errorCount++; } else { successCount++; }
      } catch { errorCount++; }
    }

    return new Response(
      JSON.stringify({ message: "완료", offset, count: stations.length, successCount, errorCount }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});