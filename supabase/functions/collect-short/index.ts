import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KMA_KEY = Deno.env.get("KMA_API_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;

const supabase = createClient(SB_URL, SB_KEY);

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

function shortBaseTime() {
  const now = kstNow();
  const h = now.getUTCHours();
  const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];

  let bh = baseTimes[0];
  for (const t of baseTimes) {
    if (h >= t) bh = t;
  }

  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const bhStr = String(bh).padStart(2, "0");

  return {
    date: yyyy + mm + dd,
    time: bhStr + "00",
  };
}

async function collectPoint(point: { code: string; nx: number; ny: number }) {
  const { date, time } = shortBaseTime();

  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
  url.searchParams.set("serviceKey", KMA_KEY);
  url.searchParams.set("numOfRows", "1000");
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
    console.log("SHORT JSON PARSE ERROR for", point.code, text.slice(0, 200));
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

  const fetchedAt = new Date().toISOString();

  const rows = Array.from(byTime.entries()).map(([key, cats]) => {
    const [d, t] = key.split("_");
    const forecastDt = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:00+09:00`;
    return {
      station_code: point.code,
      nx: point.nx,
      ny: point.ny,
      forecast_dt: forecastDt,
      tmp:  cats.TMP  ?? null,
      tmx:  cats.TMX  ?? null,
      tmn:  cats.TMN  ?? null,
      sky:  cats.SKY  ?? null,
      pty:  cats.PTY  ?? null,
      pop:  cats.POP  ?? null,
      uuu:  cats.UUU  ?? null,
      vvv:  cats.VVV  ?? null,
      pcp:  cats.PCP  ?? null,
      sno:  cats.SNO  ?? null,
      reh:  cats.REH  ?? null,
      wav:  cats.WAV  ?? null,
      vec:  cats.VEC  ?? null,
      wsd:  cats.WSD  ?? null,
      fetched_at: fetchedAt,
    };
  });

  const { error } = await supabase
    .from("forecasts_short")
    .upsert(rows, { onConflict: "station_code,forecast_dt" });

  if (error) {
    console.log(point.code, "SHORT ERROR:", error.message);
  } else {
    console.log(point.code, "SHORT OK", rows.length, "rows");
  }
}

async function collectChunk(chunk: { code: string; nx: number; ny: number }[]) {
  await Promise.all(chunk.map(p => collectPoint(p).catch(e =>
    console.error(p.code, "short failed:", e instanceof Error ? e.message : String(e))
  )));
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
