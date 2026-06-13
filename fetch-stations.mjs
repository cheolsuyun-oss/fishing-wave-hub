// 전국 조석예보 관측소 코드 → 위도/경도 수집
// 실행: node fetch-stations.mjs
// 결과: stations-output.json 및 콘솔에 TypeScript 배열 형태로 출력

const apiKey = "d65763d0e480e3a1fa5aae419a1a335e36552e14e514c6acfc8035b451aa4aff";

const CODES = [
"DT_0001","DT_0002","DT_0003","DT_0004","DT_0005","DT_0006","DT_0007","DT_0008",
"DT_0010","DT_0011","DT_0012","DT_0013","DT_0014","DT_0016","DT_0017","DT_0018",
"DT_0020","DT_0021","DT_0022","DT_0023","DT_0024","DT_0025","DT_0026","DT_0027",
"DT_0028","DT_0029","DT_0031","DT_0032","DT_0035","DT_0036","DT_0037","DT_0038",
"DT_0039","DT_0040","DT_0041","DT_0042","DT_0043","DT_0044","DT_0046","DT_0047",
"DT_0048","DT_0049","DT_0050","DT_0051","DT_0052","DT_0054","DT_0056","DT_0057",
"DT_0058","DT_0059","DT_0060","DT_0061","DT_0062","DT_0063","DT_0064","DT_0065",
"DT_0067","DT_0068","DT_0091","DT_0092","DT_0093","DT_0094",
"IE_0060","IE_0061","IE_0062",
"SO_0326","SO_0537","SO_0538","SO_0539","SO_0540","SO_0547","SO_0548","SO_0549",
"SO_0550","SO_0551","SO_0552","SO_0553","SO_0554","SO_0555","SO_0562","SO_0563",
"SO_0564","SO_0565","SO_0566","SO_0567","SO_0568","SO_0569","SO_0570","SO_0571",
"SO_0572","SO_0573","SO_0574","SO_0576","SO_0577","SO_0578","SO_0581","SO_0631",
"SO_0699","SO_0700","SO_0701","SO_0702","SO_0703","SO_0704","SO_0705","SO_0706",
"SO_0707","SO_0708","SO_0709","SO_0710","SO_0711","SO_0712","SO_0731","SO_0732",
"SO_0733","SO_0734","SO_0735","SO_0736","SO_0737","SO_0739","SO_0740","SO_0752",
"SO_0753","SO_0754","SO_0755","SO_0756","SO_0757","SO_0758","SO_0759","SO_0760",
"SO_0761","SO_1248","SO_1249","SO_1250","SO_1251","SO_1252","SO_1253","SO_1254",
"SO_1255","SO_1256","SO_1257","SO_1258","SO_1259","SO_1260","SO_1261","SO_1262",
"SO_1263","SO_1264","SO_1265","SO_1266","SO_1267","SO_1268","SO_1269","SO_1270",
"SO_1271","SO_1272","SO_1273","SO_1274","SO_1275","SO_1276","SO_1277","SO_1278",
"SO_1279","SO_1280","SO_1281","SO_1282","SO_1283","SO_1284","SO_1285","SO_1286",
"SO_1287","SO_1288","SO_1289",
];

function kstDateYYYYMMDD() {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// 위경도로 동/서/남해 추정 (geo.ts의 inferSea와 동일 로직)
function inferSea(lat, lng) {
  if (lng < 127.3) return "서해";
  if (lng > 128.7 && lat > 35.5) return "동해";
  return "남해";
}

async function fetchOne(code) {
  const url = new URL("https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("type", "json");
  url.searchParams.set("numOfRows", "1");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("obsCode", code);
  url.searchParams.set("reqDate", kstDateYYYYMMDD());

  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const body = json.body ?? json.response?.body;
    const items = body?.items;
    const item = Array.isArray(items?.item) ? items.item[0] : items?.item;
    if (!item) return null;
    const lat = Number(item.lat);
    const lng = Number(item.lot);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { code, name: item.obsvtrNm ?? "", lat, lng, sea: inferSea(lat, lng) };
  } catch (e) {
    return null;
  }
}

const results = [];
for (const code of CODES) {
  const r = await fetchOne(code);
  if (r) {
    results.push(r);
    console.log(`OK   ${code}  ${r.name}  (${r.lat}, ${r.lng})  ${r.sea}`);
  } else {
    console.log(`FAIL ${code}`);
  }
  // rate limit 보호용 약간의 대기
  await new Promise((res) => setTimeout(res, 80));
}

console.log(`\n총 ${results.length}/${CODES.length}개 성공\n`);

// TypeScript 배열 형태로 출력
const tsLines = results.map(
  (r) => `  { code: "${r.code}", lat: ${r.lat}, lng: ${r.lng}, sea: "${r.sea}" }, // ${r.name}`
);
console.log("// ===== TIDE_STATIONS (paste below) =====");
console.log(tsLines.join("\n"));

// 파일로도 저장
import { writeFileSync } from "fs";
writeFileSync("stations-output.json", JSON.stringify(results, null, 2), "utf-8");
writeFileSync("stations-output.ts", tsLines.join("\n"), "utf-8");
console.log("\n저장됨: stations-output.json, stations-output.ts");
