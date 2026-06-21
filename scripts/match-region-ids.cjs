// 2단계: geocode-result.json(시/도, 시/군/구 확보) -> regId 매칭
// 사용법: node scripts/match-region-ids.cjs
// 입력: scripts/geocode-result.json, src/data/tide-stations-master.json,
//       src/data/tide-stations-grid.json, scripts/mid-fcst-region-codes.json
// 출력: scripts/tide-station-regions-final.json (Supabase upsert 직전 데이터)

const fs = require("fs");
const path = require("path");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

const geocodeResults = readJson(path.join(__dirname, "geocode-result.json"));
const master = readJson(path.join(__dirname, "..", "src", "data", "tide-stations-master.json"));
const grid = readJson(path.join(__dirname, "..", "src", "data", "tide-stations-grid.json"));
const regionCodes = readJson(path.join(__dirname, "mid-fcst-region-codes.json")).entries;

// station_code -> nx/ny 매핑
const gridByCode = {};
for (const g of grid) gridByCode[g.code] = { nx: g.nx, ny: g.ny };

// station_code -> master 원본 sea(4분류, 27차 수정본) 매핑
const masterByCode = {};
for (const m of master) masterByCode[m.code] = m;

// ===== 1. 육상/기온 regId 매칭 (sido + sigungu 텍스트 매칭) =====
// 코드표의 sigungu는 종종 괄호 메모가 붙어있으므로(예: "고성군(강원 동해안)") 정확매칭 우선,
// 실패 시 sigungu 앞부분(시/군/구 이름)만 비교하는 느슨한 매칭으로 폴백
function findLandTaRegId(sido, sigungu) {
  if (!sido || !sigungu) return { code: null, matchType: "no_address" };

  // 정확매칭
  let hit = regionCodes.find((r) => r.sido === sido && r.sigungu === sigungu);
  if (hit) return { code: hit.code, matchType: "exact" };

  // "포항시 북구" 같은 구 단위 sigungu -> 코드표엔 "포항시"만 있는 경우 앞부분만 비교
  const baseSigungu = sigungu.split(" ")[0]; // "포항시 북구" -> "포항시"
  hit = regionCodes.find((r) => r.sido === sido && r.sigungu === baseSigungu);
  if (hit) return { code: hit.code, matchType: "base_sigungu" };

  // 코드표 쪽에 괄호 메모가 있는 경우 괄호 제거 후 비교 (예: "제주시(추자)" vs "제주시")
  hit = regionCodes.find(
    (r) => r.sido === sido && r.sigungu.replace(/\(.*\)/, "") === sigungu
  );
  if (hit) return { code: hit.code, matchType: "paren_stripped" };

  // 광역시(인천/부산/울산 등) 산하 구 단위 - 코드표엔 광역시 전체 코드 1개만 있고
  // 개별 구 코드가 없는 경우, 광역시 전체 코드로 폴백
  // (코드표의 sigungu가 시/도 이름과 동일한 경우 = "광역시 전체 커버" 코드)
  hit = regionCodes.find((r) => r.sido === sido && r.sigungu === sido.replace(/(광역시|특별시|특별자치시)$/, ""));
  if (hit) return { code: hit.code, matchType: "metro_fallback" };

  return { code: null, matchType: "no_match" };
}

// ===== 2. 해상 regId 매칭 (좌표 기반 8개 세부해역) =====
// 기상청 중기해상예보구역(2025-12 코드표) 대략 경계. 정밀 폴리곤이 아닌 좌표 박스 근사치.
function findSeaRegion(lat, lng, masterSea) {
  // 제주 (제주도해상)
  if (masterSea === "제주") {
    return { sea: "jeju", sea_etc: null, code: "12B10500", name: "제주도해상" };
  }

  // 동해 (북부/중부/남부) - 위도 기준 분할
  if (masterSea === "동해") {
    if (lat >= 37.8) return { sea: "east", sea_etc: "N", code: "12C30000", name: "동해북부" };
    if (lat >= 36.5) return { sea: "east", sea_etc: "C", code: "12C20000", name: "동해중부" };
    return { sea: "east", sea_etc: "S", code: "12C10000", name: "동해남부" };
  }

  // 서해 (중부/남부) - 위도 기준 분할 (서해북부는 172개 관측소 중 해당없음 가정)
  if (masterSea === "서해") {
    if (lat >= 35.0) return { sea: "west", sea_etc: "C", code: "12A20000", name: "서해중부" };
    return { sea: "west", sea_etc: "S", code: "12A30000", name: "서해남부" };
  }

  // 남해 (서부/동부) - 경도 기준 분할 (대략 통영 인근 128.4도를 경계로)
  if (masterSea === "남해") {
    if (lng < 128.4) return { sea: "south", sea_etc: "W", code: "12B10000", name: "남해서부" };
    return { sea: "south", sea_etc: "E", code: "12B20000", name: "남해동부" };
  }

  // master sea가 null인 경우(27차 30건 미정) - 좌표만으로 추정 (전남 서남해안)
  // 잠정: 서해/남해 경계는 해남 땅끝(126.6E) 기준 근사
  if (masterSea === null) {
    if (lng < 126.6) return { sea: "west", sea_etc: "S", code: "12A30000", name: "서해남부(추정)" };
    return { sea: "south", sea_etc: "W", code: "12B10000", name: "남해서부(추정)" };
  }

  return { sea: null, sea_etc: null, code: null, name: null };
}

// ===== 메인 처리 =====
const final = [];
const unmatchedLand = [];

for (const g of geocodeResults) {
  const m = masterByCode[g.code] || {};
  const gr = gridByCode[g.code] || {};

  const landTa = findLandTaRegId(g.sido, g.sigungu);
  if (!landTa.code) unmatchedLand.push({ code: g.code, name: g.name, sido: g.sido, sigungu: g.sigungu, reason: landTa.matchType });

  const seaInfo = findSeaRegion(g.lat, g.lng, m.sea ?? null);

  final.push({
    station_code: g.code,
    name: g.name, // 검증용, Supabase 테이블엔 미포함 (마스터에 이미 있음)
    lat: g.lat,
    lng: g.lng,
    nx: gr.nx ?? null,
    ny: gr.ny ?? null,
    sido: g.sido,
    sigungu: g.sigungu,
    address_etc: g.address_etc,
    sea: seaInfo.sea,
    sea_etc: seaInfo.sea_etc,
    mid_land_ta_reg_id: landTa.code,
    mid_sea_reg_id: seaInfo.code,
    note: [
      !g.sido ? "행정구역 없음(외해 암초/수중초)" : null,
      landTa.matchType === "no_match" ? "육상/기온 regId 매칭 실패 - 수작업 확인 필요" : null,
      m.sea === null ? "27차 sea 미정(서남해안 경계 애매) - 좌표 추정치 적용됨" : null,
    ].filter(Boolean).join("; ") || null,
  });
}

console.log(`총 ${final.length}건 처리 완료`);
console.log(`육상/기온 regId 매칭 실패: ${unmatchedLand.length}건`);
if (unmatchedLand.length > 0) {
  console.log("\n매칭 실패 목록:");
  for (const u of unmatchedLand) {
    console.log(`  ${u.code} (${u.name}): sido="${u.sido}" sigungu="${u.sigungu}" reason=${u.reason}`);
  }
}

const noteCount = final.filter((f) => f.note).length;
console.log(`\nnote 표시된 건수(수작업 검토 대상): ${noteCount}`);

const outPath = path.join(__dirname, "tide-station-regions-final.json");
fs.writeFileSync(outPath, JSON.stringify(final, null, 2), "utf-8");
console.log(`\n결과 저장: ${outPath}`);
