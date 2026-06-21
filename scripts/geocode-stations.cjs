// 172개 조석 관측소 좌표 -> 카카오 좌표/주소 변환 API로 행정구역 일괄 조회
// 사용법: node scripts/geocode-stations.cjs
// .env 파일의 KAKAO_REST_API_KEY를 사용합니다. (VITE_ 접두사 아님 - 서버 전용)

const fs = require("fs");
const path = require("path");

// .env에서 키 읽기 (기존 collect-forecast.cjs와 동일 패턴)
function loadEnvKey(names) {
  try {
    let envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8");
    envText = envText.replace(/^\uFEFF/, "");
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (names.includes(key) && val) return val;
    }
  } catch (e) {
    console.error(".env 파일을 읽을 수 없습니다:", e.message);
  }
  return null;
}

const KAKAO_REST_API_KEY = loadEnvKey(["KAKAO_REST_API_KEY"]);
if (!KAKAO_REST_API_KEY) {
  console.error("KAKAO_REST_API_KEY를 .env에서 찾지 못했습니다.");
  console.error("(.env에 'KAKAO_REST_API_KEY=...' 한 줄 추가 필요, VITE_ 접두사 사용 금지)");
  process.exit(1);
}

// 마스터 파일 로드
const masterPath = path.join(__dirname, "..", "src", "data", "tide-stations-master.json");
const stations = JSON.parse(fs.readFileSync(masterPath, "utf-8"));

console.log(`총 ${stations.length}개 관측소 로드 완료`);

// 카카오 좌표 -> 행정구역 변환 (coord2regioncode)
async function geocodeOne(station) {
  const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
  url.searchParams.set("x", String(station.lng)); // 카카오는 x=경도
  url.searchParams.set("y", String(station.lat)); // y=위도
  url.searchParams.set("input_coord", "WGS84");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    const text = await res.text();

    if (!res.ok) {
      return {
        code: station.code,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
        httpStatus: res.status,
        error: text.slice(0, 200),
      };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        code: station.code,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
        httpStatus: res.status,
        error: "PARSE_ERROR: " + text.slice(0, 200),
      };
    }

    const docs = json.documents || [];
    // region_type "B"=법정동, "H"=행정동. 법정동(B) 기준으로 sido/sigungu/etc 추출
    const region = docs.find((d) => d.region_type === "B") || docs[0];

    if (!region) {
      return {
        code: station.code,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
        httpStatus: res.status,
        error: "NO_REGION (해상/도서 좌표일 가능성 - 행정구역 없음)",
        raw: docs,
      };
    }

    return {
      code: station.code,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      httpStatus: res.status,
      sido: region.region_1depth_name || null,
      sigungu: region.region_2depth_name || null,
      address_etc: region.region_3depth_name || null,
      region_type: region.region_type,
      all_docs: docs, // 검증용 - B/H 둘 다 보존
    };
  } catch (err) {
    return {
      code: station.code,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      httpStatus: "ERR",
      error: err.message,
    };
  }
}

// 10개씩 청크 병렬 처리 (기존 19차 세션 패턴 재사용)
async function processInChunks(items, chunkSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
    console.log(`진행: ${Math.min(i + chunkSize, items.length)}/${items.length}`);
    // 카카오 API rate limit 보호용 짧은 대기
    await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}

(async () => {
  console.log("카카오 좌표->행정구역 변환 시작...\n");
  const results = await processInChunks(stations, 10, geocodeOne);

  const success = results.filter((r) => r.sido);
  const failed = results.filter((r) => !r.sido);

  console.log("\n" + "=".repeat(60));
  console.log(`성공: ${success.length}개`);
  console.log(`실패/미매칭: ${failed.length}개`);

  if (failed.length > 0) {
    console.log("\n실패 목록:");
    for (const f of failed) {
      console.log(`  ${f.code} (${f.name}): ${f.error}`);
    }
  }

  const outPath = path.join(__dirname, "geocode-result.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n결과 저장: ${outPath}`);
})();
