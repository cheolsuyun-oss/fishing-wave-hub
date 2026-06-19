import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KMA_KEY = Deno.env.get("KMA_API_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;

const supabase = createClient(SB_URL, SB_KEY);

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

function baseTime() {
  const now = kstNow();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  let bh = m >= 30 ? h : h - 1;
  let date = new Date(now);
  if (bh < 0) {
    bh = 23;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return {
    date: yyyy + mm + dd,
    time: String(bh).padStart(2, "0") + "30",
  };
}

async function collectPoint(point: { code: string; nx: number; ny: number }) {
  const { date, time } = baseTime();
  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst");
  url.searchParams.set("serviceKey", KMA_KEY);
  url.searchParams.set("numOfRows", "60");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", date);
  url.searchParams.set("base_time", time);
  url.searchParams.set("nx", String(point.nx));
  url.searchParams.set("ny", String(point.ny));

  const res = await fetch(url.toString());
  const text = await res.text();
  if (!text || text.trim() === "") return;

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log("JSON PARSE ERROR for", point.code, text.slice(0, 200));
    return;
  }

  const items = json?.response?.body?.items?.item ?? [];
  if (!items.length) return;

  const byTime = new Map<string, Record<string, string>>();
  for (const item of items) {
    const key = item.fcstDate + "_" + item.fcstTime;
    if (!byTime.has(key)) byTime.set(key, {});
    byTime.get(key)![item.category] = item.fcstValue;
  }

  const rows = Array.from(byTime.entries()).map(([key, cats]) => {
    const [d, t] = key.split("_");
    const dt = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:00+09:00`;
    return {
      station_code: point.code,
      forecast_dt: dt,
      temp: cats.T1H ? parseFloat(cats.T1H) : null,
      precip_1h: cats.RN1 ? parseFloat(cats.RN1) : null,
      precip_type: cats.PTY ? parseInt(cats.PTY) : null,
      humidity: cats.REH ? parseInt(cats.REH) : null,
      wind_dir: cats.VEC ? parseInt(cats.VEC) : null,
      wind_speed: cats.WSD ? parseFloat(cats.WSD) : null,
      sky: cats.SKY ? parseInt(cats.SKY) : null,
      fetched_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("ultra_short_forecasts")
    .upsert(rows, { onConflict: "station_code,forecast_dt" });

  if (error) console.log(point.code, "ERROR:", error.message);
  else console.log(point.code, "OK", rows.length, "rows");
}

async function collectChunk(chunk: { code: string; nx: number; ny: number }[]) {
  await Promise.all(chunk.map(p => collectPoint(p).catch(e => console.error(p.code, e.message))));
}

Deno.serve(async (_req) => {
  try {
    const { data: stations, error } = await supabase
      .from("stations")
      .select("code, nx, ny")
      .eq("active", true)
      .eq("source", "kma")
      .eq("type", "tide");

    if (error) throw error;

    const CHUNK_SIZE = 10;
    for (let i = 0; i < stations.length; i += CHUNK_SIZE) {
      const chunk = stations.slice(i, i + CHUNK_SIZE);
      await collectChunk(chunk);
      console.log(`${i + chunk.length}/${stations.length} 완료`);
    }

    return new Response(JSON.stringify({ ok: true, count: stations.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});