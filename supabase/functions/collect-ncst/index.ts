import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KMA_KEY = Deno.env.get("KMA_API_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;

const supabase = createClient(SB_URL, SB_KEY);

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

function kstISOString() {
  const kst = kstNow();
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  const ss = String(kst.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}

function ncstBaseTime() {
  const now = kstNow();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  let bh = m >= 40 ? h : h - 1;
  let date = new Date(now);
  if (bh < 0) {
    bh = 23;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const baseDt = `${yyyy}-${mm}-${dd}T${String(bh).padStart(2, "0")}:00:00+09:00`;
  return {
    date: yyyy + mm + dd,
    time: String(bh).padStart(2, "0") + "00",
    baseDt,
  };
}

async function collectPoint(point: { code: string; nx: number; ny: number }) {
  const { date, time, baseDt } = ncstBaseTime();

  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst");
  url.searchParams.set("serviceKey", KMA_KEY);
  url.searchParams.set("numOfRows", "10");
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
    console.log("NCST JSON PARSE ERROR for", point.code, text.slice(0, 200));
    return;
  }

  const items = json?.response?.body?.items?.item ?? [];
  if (!items.length) return;

  const cats: Record<string, string> = {};
  for (const item of items) {
    cats[item.category] = item.obsrValue;
  }

  const row = {
    nx: point.nx,
    ny: point.ny,
    station_code: point.code,
    base_dt: baseDt,
    t1h: cats.T1H ?? null,
    rn1: cats.RN1 ?? null,
    uuu: cats.UUU ?? null,
    vvv: cats.VVV ?? null,
    reh: cats.REH ?? null,
    pty: cats.PTY ?? null,
    vec: cats.VEC ?? null,
    wsd: cats.WSD ?? null,
    rcv_dt: kstISOString(),
  };

  const { error } = await supabase
    .from("forecasts_ncst")
    .insert([row]);

  if (error) {
    console.log(point.code, "NCST ERROR:", error.message);
  } else {
    console.log(point.code, "NCST OK", baseDt);
  }
}

async function collectChunk(chunk: { code: string; nx: number; ny: number }[]) {
  await Promise.all(chunk.map(p => collectPoint(p).catch(e =>
    console.error(p.code, "ncst failed:", e instanceof Error ? e.message : String(e))
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