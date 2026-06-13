// DT_0040(독도) 단독 재시도
// 사용법: node retry-dokdo.mjs

import fs from "fs";

function loadEnvKey() {
  const candidates = ["KMA_API_KEY", "VITE_KMA_API_KEY"];
  let envText = fs.readFileSync(".env", "utf-8").replace(/^\uFEFF/, "");
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (candidates.includes(key) && val) return val;
  }
  return null;
}

const apiKey = loadEnvKey();
function todayYYYYMMDD() {
  const now = new Date(Date.now() + 9 * 3600_000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
const date = todayYYYYMMDD();

async function callOnce() {
  const url = new URL("https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("obsCode", "DT_0040");
  url.searchParams.set("reqDate", date);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { return { resultCode: "PARSE_ERROR", lat: null, lng: null }; }
  const header = json?.response?.header ?? json?.header ?? {};
  const body = json?.response?.body ?? json?.body ?? {};
  const raw = body?.items?.item;
  const sample = Array.isArray(raw) ? raw[0] : raw;
  return {
    resultCode: header?.resultCode ?? "?",
    resultMsg: header?.resultMsg ?? "?",
    lat: sample?.lat ?? null,
    lng: sample?.lot ?? null,
    apiName: sample?.obsvtrNm ?? null,
  };
}

(async () => {
  for (let i = 1; i <= 5; i++) {
    const r = await callOnce();
    console.log(`시도 ${i}: ${r.resultCode} ${r.resultMsg ?? ""} lat=${r.lat} lng=${r.lng} apiName=${r.apiName ?? ""}`);
    if (r.lat !== null) {
      fs.writeFileSync("dokdo-result.json", JSON.stringify({code:"DT_0040",name:"독도",...r}, null, 2), "utf-8");
      console.log("성공! dokdo-result.json 저장");
      return;
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  console.log("5회 모두 실패");
})();
