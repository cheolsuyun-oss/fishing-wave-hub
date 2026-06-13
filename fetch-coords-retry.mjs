// 좌표 미확보 코드 좌표 수집 (자동 재시도 내장)
// 사용법: node fetch-coords-retry.mjs
// 99 UNKNOWN_ERROR 등 실패 시 코드당 최대 3회까지 자동 재시도

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
const MAX_RETRY = 4; // 코드당 최대 시도 횟수
const RETRY_DELAY_MS = 500;

// 남은 13개
const codes = [
  ["DT_0003","영광"], ["DT_0020","울산"], ["DT_0024","장항"], ["DT_0040","독도"],
  ["DT_0050","태안"], ["DT_0059","백령도"], ["DT_0062","마산"], ["DT_0065","덕적도"],
  ["DT_0092","여호항"], ["SO_0761","녹동항"], ["SO_1250","평도"],
  ["SO_1282","선재도"], ["SO_1284","월포리"],
];

async function callOnce(code) {
  const url = new URL(
    "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService"
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("obsCode", code);
  url.searchParams.set("reqDate", date);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { resultCode: "PARSE_ERROR", lat: null, lng: null };
  }
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

async function checkCodeWithRetry(code, name) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    let r;
    try {
      r = await callOnce(code);
    } catch (err) {
      r = { resultCode: "FETCH_ERROR", resultMsg: err.message, lat: null, lng: null };
    }
    if (r.lat !== null) {
      return { code, name, attempt, ...r };
    }
    if (attempt < MAX_RETRY) {
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    }
  }
  // 최종 실패
  return { code, name, attempt: MAX_RETRY, resultCode: "FAILED_AFTER_RETRY", lat: null, lng: null };
}

(async () => {
  console.log(`날짜: ${date}, 코드당 최대 ${MAX_RETRY}회 시도`);
  console.log("=".repeat(70));
  const results = [];
  for (const [code, name] of codes) {
    const r = await checkCodeWithRetry(code, name);
    results.push(r);
    const status = r.lat !== null ? `성공(${r.attempt}회차)` : "최종실패";
    console.log(
      `${code} (${name}) -> ${status} | resultCode=${r.resultCode} lat=${r.lat} lng=${r.lng} apiName=${r.apiName ?? ""}`
    );
    await new Promise((res) => setTimeout(res, 150));
  }
  console.log("=".repeat(70));

  const success = results.filter((r) => r.lat !== null);
  console.log(`좌표 확보: ${success.length} / ${results.length}`);
  const failed = results.filter((r) => r.lat === null);
  if (failed.length > 0) {
    console.log("최종 실패 코드:", failed.map((r) => `${r.code}(${r.name})`).join(", "));
  }

  fs.writeFileSync(
    "coords-retry-result.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
  console.log("결과 저장: coords-retry-result.json");
})();
