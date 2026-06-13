// 좌표 미확보 33개 관측소 좌표 수집
// 사용법: node fetch-missing-coords.mjs
// 결과: missing-coords-result.json 에 {code, name, lat, lng, resultCode} 배열 저장

import fs from "fs";

function loadEnvKey() {
  const candidates = ["KMA_API_KEY", "VITE_KMA_API_KEY"];
  try {
    let envText = fs.readFileSync(".env", "utf-8");
    envText = envText.replace(/^\uFEFF/, "");
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (candidates.includes(key) && val) return val;
    }
  } catch (e) {
    console.error(".env 파일을 읽을 수 없습니다:", e.message);
  }
  return null;
}

const apiKey = loadEnvKey();
if (!apiKey) {
  console.error("KMA_API_KEY를 .env에서 찾지 못했습니다.");
  process.exit(1);
}

function todayYYYYMMDD() {
  const now = new Date(Date.now() + 9 * 3600_000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

const date = todayYYYYMMDD();

// 좌표 미확보 33개 코드 (코드명은 tide-stations-master.json 참조용으로 같이 둠)
const codes = [
  ["DT_0003","영광"], ["DT_0020","울산"], ["DT_0024","장항"], ["DT_0040","독도"],
  ["DT_0047","도농탄"], ["DT_0050","태안"], ["DT_0054","진해"], ["DT_0059","백령도"],
  ["DT_0062","마산"], ["DT_0065","덕적도"], ["DT_0092","여호항"],
  ["SO_0537","벽파진"], ["SO_0540","호산항"], ["SO_0569","남포항"], ["SO_0578","소매물도"],
  ["SO_0703","땅끝항"], ["SO_0706","청산도"], ["SO_0707","시산항"], ["SO_0739","도장항"],
  ["SO_0740","보옥항"], ["SO_0754","평호리"], ["SO_0761","녹동항"], ["SO_1250","평도"],
  ["SO_1253","상왕등도"], ["SO_1259","자월도"], ["SO_1267","구룡포항"], ["SO_1268","궁평항"],
  ["SO_1273","장호항"], ["SO_1274","거진항"], ["SO_1275","공현진항"], ["SO_1279","어란진항"],
  ["SO_1282","선재도"], ["SO_1284","월포리"],
];

async function checkCode(code) {
  const url = new URL(
    "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService"
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("obsCode", code);
  url.searchParams.set("reqDate", date);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    const text = await res.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { code, resultCode: "PARSE_ERROR", lat: null, lng: null };
    }

    const header = json?.response?.header ?? json?.header ?? {};
    const body = json?.response?.body ?? json?.body ?? {};
    const raw = body?.items?.item;
    const sample = Array.isArray(raw) ? raw[0] : raw;

    return {
      code,
      resultCode: header?.resultCode ?? "?",
      resultMsg: header?.resultMsg ?? "?",
      lat: sample?.lat ?? null,
      lng: sample?.lot ?? null,
      apiName: sample?.obsvtrNm ?? null,
    };
  } catch (err) {
    return { code, resultCode: "FETCH_ERROR", resultMsg: err.message, lat: null, lng: null };
  }
}

(async () => {
  console.log(`날짜: ${date}`);
  console.log("=".repeat(70));
  const results = [];
  for (const [code, name] of codes) {
    const r = await checkCode(code);
    r.name = name;
    results.push(r);
    console.log(
      `${code} (${name}) -> ${r.resultCode} ${r.resultMsg ?? ""} | lat=${r.lat} lng=${r.lng} apiName=${r.apiName ?? ""}`
    );
    await new Promise((res) => setTimeout(res, 150));
  }
  console.log("=".repeat(70));

  const success = results.filter((r) => r.lat !== null);
  console.log(`좌표 확보: ${success.length} / ${results.length}`);

  fs.writeFileSync(
    "missing-coords-result.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
  console.log("결과 저장: missing-coords-result.json");
})();
