// DT_0001 ~ DT_0029 조석예보(고저조) 관측소 코드 재시도 스크립트
// 사용법: node check-tide-stations.mjs
// .env 파일의 KMA_API_KEY (또는 VITE_KMA_API_KEY)를 사용합니다.

import fs from "fs";

// .env에서 키 읽기 (간단 파서)
function loadEnvKey() {
  const candidates = ["KMA_API_KEY", "VITE_KMA_API_KEY"];
  try {
    let envText = fs.readFileSync(".env", "utf-8");
    // BOM 제거
    envText = envText.replace(/^\uFEFF/, "");
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (candidates.includes(key) && val) {
        return val;
      }
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
  const now = new Date(Date.now() + 9 * 3600_000); // KST
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

const date = todayYYYYMMDD();

// DT_0001 ~ DT_0029
const codes = [];
for (let i = 1; i <= 29; i++) {
  codes.push(`DT_${String(i).padStart(4, "0")}`);
}

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
      // JSON 파싱 실패 -> XML 에러 응답일 가능성 (서비스키 오류 등)
      return {
        code,
        httpStatus: res.status,
        resultCode: "PARSE_ERROR",
        resultMsg: text.slice(0, 200),
        itemCount: 0,
      };
    }

    const header =
      json?.response?.header ?? json?.header ?? {};
    const body = json?.response?.body ?? json?.body ?? {};
    const itemsWrap = body?.items;
    const raw = itemsWrap?.item;
    const itemCount = Array.isArray(raw) ? raw.length : raw ? 1 : 0;

    return {
      code,
      httpStatus: res.status,
      resultCode: header?.resultCode ?? "?",
      resultMsg: header?.resultMsg ?? "?",
      itemCount,
      sample: itemCount > 0 ? (Array.isArray(raw) ? raw[0] : raw) : null,
    };
  } catch (err) {
    return {
      code,
      httpStatus: "ERR",
      resultCode: "FETCH_ERROR",
      resultMsg: err.message,
      itemCount: 0,
    };
  }
}

(async () => {
  console.log(`날짜: ${date}`);
  console.log("=".repeat(70));
  const results = [];
  for (const code of codes) {
    const r = await checkCode(code);
    results.push(r);
    console.log(
      `${r.code} | HTTP ${r.httpStatus} | resultCode=${r.resultCode} | ${r.resultMsg} | items=${r.itemCount}`
    );
    if (r.sample) {
      console.log(`   sample: ${JSON.stringify(r.sample)}`);
    }
    // API 과호출 방지용 짧은 대기
    await new Promise((res) => setTimeout(res, 150));
  }

  console.log("=".repeat(70));
  const success = results.filter((r) => r.resultCode === "00");
  const fail = results.filter((r) => r.resultCode !== "00");
  console.log(`성공(00 NORMAL_SERVICE): ${success.length}개`);
  console.log(`실패: ${fail.length}개`);

  fs.writeFileSync(
    "tide-stations-dt0001-0029-result.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
  console.log("\n결과 저장: tide-stations-dt0001-0029-result.json");
})();
