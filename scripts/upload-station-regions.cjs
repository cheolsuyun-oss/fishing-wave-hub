// 3단계: tide-station-regions-final.json(172건) -> Supabase tide_station_regions 테이블 upsert
// + app_data_versions의 tide_stations 버전 +1 자동 증가
// 사용법: node scripts/upload-station-regions.cjs
// .env의 SUPABASE_URL, SUPABASE_SERVICE_KEY 사용 (collect-forecast.cjs와 동일 패턴)

const fs = require("fs");
const path = require("path");

function loadEnvKey(names) {
  try {
    let envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8");
    envText = envText.replace(/^\uFEFF/, "");
    const found = {};
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (names.includes(key) && val) {
        found[key] = val;
      }
    }
    // names 배열 순서대로 우선순위 적용 (먼저 등장한 줄이 아니라, candidates 우선순위 순)
    for (const name of names) {
      if (found[name]) return found[name];
    }
  } catch (e) {
    console.error(".env 파일을 읽을 수 없습니다:", e.message);
  }
  return null;
}

// 18~19차 세션과 동일한 폴백 패턴 (VITE_ 접두사 없을 수도 있음 대비)
const SUPABASE_URL = loadEnvKey(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
const SUPABASE_SERVICE_KEY = loadEnvKey(["SUPABASE_SERVICE_KEY", "VITE_SUPABASE_ANON_KEY"]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL 또는 SUPABASE_SERVICE_KEY를 .env에서 찾지 못했습니다.");
  process.exit(1);
}

const finalDataPath = path.join(__dirname, "tide-station-regions-final.json");
const rows = JSON.parse(fs.readFileSync(finalDataPath, "utf-8"));

// Supabase 테이블 컬럼에 맞게 정리 (name은 master.json에 이미 있으므로 제외)
const payload = rows.map((r) => ({
  station_code: r.station_code,
  lat: r.lat,
  lng: r.lng,
  nx: r.nx,
  ny: r.ny,
  sido: r.sido,
  sigungu: r.sigungu,
  address_etc: r.address_etc,
  sea: r.sea,
  sea_etc: r.sea_etc,
  mid_land_ta_reg_id: r.mid_land_ta_reg_id,
  mid_sea_reg_id: r.mid_sea_reg_id,
  note: r.note,
}));

async function upsertStationRegions() {
  const url = `${SUPABASE_URL}/rest/v1/tide_station_regions?on_conflict=station_code`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`업로드 실패 (HTTP ${res.status}):`, text.slice(0, 500));
    process.exit(1);
  }
  console.log(`tide_station_regions 업로드 완료: ${payload.length}건`);
}

async function bumpDataVersion() {
  // 현재 버전 조회
  const getUrl = `${SUPABASE_URL}/rest/v1/app_data_versions?key=eq.tide_stations&select=version`;
  const getRes = await fetch(getUrl, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const current = await getRes.json();
  const currentVersion = current?.[0]?.version ?? 0;
  const newVersion = currentVersion + 1;

  const patchUrl = `${SUPABASE_URL}/rest/v1/app_data_versions?key=eq.tide_stations`;
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      version: newVersion,
      updated_at: new Date().toISOString(),
      note: `172개 관측소 regId 매핑 적용 (28차 세션)`,
    }),
  });

  if (!patchRes.ok) {
    const text = await patchRes.text();
    console.error(`버전 업데이트 실패 (HTTP ${patchRes.status}):`, text.slice(0, 500));
    process.exit(1);
  }
  console.log(`app_data_versions.tide_stations: ${currentVersion} -> ${newVersion}`);
}

(async () => {
  console.log(`총 ${payload.length}건 업로드 시작...`);
  await upsertStationRegions();
  await bumpDataVersion();
  console.log("\n완료. Supabase 대시보드에서 tide_station_regions 테이블을 확인하세요.");
})();
