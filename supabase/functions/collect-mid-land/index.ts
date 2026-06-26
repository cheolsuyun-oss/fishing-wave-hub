import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KMA_KEY = Deno.env.get("KMA_API_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;

const supabase = createClient(SB_URL, SB_KEY);

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

// 중기예보 발표: 06:00 / 18:00 KST
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
  const url = new URL("https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst");
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
    console.log("MID-LAND PARSE ERROR", regId, text.slice(0, 200));
    return;
  }

  const item = json?.response?.body?.items?.item?.[0];
  if (!item) return;

  const row = {
    reg_id: regId,
    tm_fc: tmFcIso,
    rn_st_4am: item.rnSt4Am ?? null, rn_st_4pm: item.rnSt4Pm ?? null,
    rn_st_5am: item.rnSt5Am ?? null, rn_st_5pm: item.rnSt5Pm ?? null,
    rn_st_6am: item.rnSt6Am ?? null, rn_st_6pm: item.rnSt6Pm ?? null,
    rn_st_7am: item.rnSt7Am ?? null, rn_st_7pm: item.rnSt7Pm ?? null,
    rn_st_8:   item.rnSt8   ?? null,
    rn_st_9:   item.rnSt9   ?? null,
    rn_st_10:  item.rnSt10  ?? null,
    wf_4am: item.wf4Am ?? null, wf_4pm: item.wf4Pm ?? null,
    wf_5am: item.wf5Am ?? null, wf_5pm: item.wf5Pm ?? null,
    wf_6am: item.wf6Am ?? null, wf_6pm: item.wf6Pm ?? null,
    wf_7am: item.wf7Am ?? null, wf_7pm: item.wf7Pm ?? null,
    wf_8:   item.wf8   ?? null,
    wf_9:   item.wf9   ?? null,
    wf_10:  item.wf10  ?? null,
    fetched_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("forecasts_mid_land")
    .upsert(row, { onConflict: "reg_id,tm_fc" });

  if (error) console.log(regId, "MID-LAND ERROR:", error.message);
  else console.log(regId, "MID-LAND OK");
}

Deno.serve(async (_req) => {
  try {
    const { data, error } = await supabase
      .from("tide_station_regions")
      .select("mid_land_ta_reg_id");

    if (error) throw error;

    // 중복 제거
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