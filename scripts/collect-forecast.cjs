const POINTS = require("../src/data/tide-stations-grid.json");

const KMA_KEY = process.env.KMA_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function kstNow() {
  return new Date(Date.now() + 9 * 3600000);
}

function baseTime() {
  const now = kstNow();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const bh = m >= 30 ? h : h - 1;
  const safeH = ((bh % 24) + 24) % 24;
  const date = new Date(now);
  if (m < 30 && h === 0) date.setUTCDate(date.getUTCDate() - 1);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return {
    date: yyyy + mm + dd,
    time: String(safeH).padStart(2, "0") + "30",
  };
}

async function collectPoint(point) {
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
  const json = await res.json();
  const items = json?.response?.body?.items?.item ?? [];
  if (!items.length) {
    console.log("no items for", point.code);
    return;
  }

  const byTime = new Map();
  for (const item of items) {
    const key = item.fcstDate + "_" + item.fcstTime;
    if (!byTime.has(key)) byTime.set(key, {});
    byTime.get(key)[item.category] = item.fcstValue;
  }

  const rows = Array.from(byTime.entries()).map(([key, cats]) => {
    const [d, t] = key.split("_");
    const dt = d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T" + t.slice(0,2) + ":" + t.slice(2,4) + ":00+09:00";
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

  const sbRes = await fetch(SB_URL + "/rest/v1/ultra_short_forecasts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  const result = await sbRes.json();
  console.log(point.code, sbRes.status, JSON.stringify(result).slice(0, 100));
}

async function collectChunk(chunk) {
  await Promise.all(chunk.map(point => collectPoint(point).catch(e => {
    console.error(point.code, e.message);
  })));
}

(async () => {
  const CHUNK_SIZE = 10;
  for (let i = 0; i < POINTS.length; i += CHUNK_SIZE) {
    const chunk = POINTS.slice(i, i + CHUNK_SIZE);
    await collectChunk(chunk);
    console.log(`${i + chunk.length}/${POINTS.length} 완료`);
  }
  console.log("전체 완료");
})();