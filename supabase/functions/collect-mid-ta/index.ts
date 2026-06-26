import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KMA_KEY = Deno.env.get("KMA_API_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;

const supabase = createClient(SB_URL, SB_KEY);

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

function midBaseTime() {
  const now = kstNow();
  const h = now.getUTCHours();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const bh = h >= 18 ? "18" : "06";
  return {
    tmFc: `${yyyy}${mm}${dd}${bh}00`,
    tmFcIso: `${yyyy}-${mm}-${dd}T${bh}:00:00+09:00`,
  };
}

async function collectRegion(regId: string, tmFc: string, tmFcIso: string) {
  const url = new URL("https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa");
  url.searchParams.set("serviceKey", KMA_KEY);
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("regId", regId);
  url.searchParams.set("tmFc", tmFc);

  const res = await fetch(url.toString());
  const text = await res.text();
  if (!text || text.trim() === "") return;

  let json;
  try { json = JSON.parse(text); } catch {
    console.log("MID-TA PARSE ERROR", regId, text.slice(0, 200));
    return;
  }

  const item = json?.response?.body?.items?.item?.[0];
  if (!item) return;

  const row = {
    reg_id: regId,
    tm_fc: tmFcIso,
    ta_min_4: item.taMin4 ?? null, ta_min_4_low: item.taMin4Low ?? null, ta_min_4_high: item.taMin4High ?? null,
    ta_max_4: item.taMax4 ?? null, ta_max_4_low: item.taMax4Low ?? null, ta_max_4_high: item.taMax4High ?? null,
    ta_min_5: item.taMin5 ?? null, ta_min_5_low: item.taMin5Low ?? null, ta_min_5_high: item.taMin5High ?? null,
    ta_max_5: item.taMax5 ?? null, ta_max_5_low: item.taMax5Low ?? null, ta_max_5_high: item.taMax5High ?? null,
    ta_min_6: item.taMin6 ?? null, ta_min_6_low: item.taMin6Low ?? null, ta_min_6_high: item.taMin6High ?? null,
    ta_max_6: item.taMax6 ?? null, ta_max_6_low: item.taMax6Low ?? null, ta_max_6_high: item.taMax6High ?? null,
    ta_min_7: item.taMin7 ?? null, ta_min_7_low: item.taMin7Low ?? null, ta_min_7_high: item.taMin7High ?? null,
    ta_max_7: item.taMax7 ?? null, ta_max_7_low: item.taMax7Low ?? null, ta_max_7_high: item.taMax7High ?? null,
    ta_min_8: item.taMin8 ?? null, ta_min_8_low: item.taMin8Low ?? null, ta_min_8_high: item.taMin8High ?? null,
    ta_max_8: item.taMax8 ?? null, ta_max_8_low: item.taMax8Low ?? null, ta_max_8_high: item.taMax8High ?? null,
    ta_min_9: item.taMin9 ?? null, ta_min_9_low: item.taMin9Low ?? null, ta_min_9_high: item.taMin9High ?? null,
    ta_max_9: item.taMax9 ?? null, ta_max_9_low: item.taMax9Low ?? null, ta_max_9_high: item.taMax9High ?? null,
    ta_min_10: item.taMin10 ?? null, ta_min_10_low: item.taMin10Low ?? null, ta_min_10_high: item.taMin10High ?? null,
    ta_max_10: item.taMax10 ?? null, ta_max_10_low: item.taMax10Low ?? null, ta_max_10_high: item.taMax10High ?? null,
    fetched_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("forecasts_mid_ta")
    .upsert(row, { onConflict: "reg_id,tm_fc" });

  if (error) console.log(regId, "MID-TA ERROR:", error.message);
  else console.log(regId, "MID-TA OK");
}

Deno.serve(async (_req) => {
  try {
    const { data, error } = await supabase
      .from("tide_station_regions")
      .select("mid_land_ta_reg_id");

    if (error) throw error;

    const regIds = [...new Set(
      data.map((r: { mid_land_ta_reg_id: string }) => r.mid_land_ta_reg_id).filter(Boolean)
    )];

    const { tmFc, tmFcIso } = midBaseTime();

    await Promise.all(regIds.map((regId: string) =>
      collectRegion(regId, tmFc, tmFcIso).catch(e =>
        console.error(regId, "failed:", e instanceof Error ? e.message : String(e))
      )
    ));

    return new Response(JSON.stringify({ ok: true, count: regIds.length }), {
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