// numOfRows=1000 (실제 forecast.functions.ts와 동일 설정)으로 재현 테스트
const apiKey = "d65763d0e480e3a1fa5aae419a1a335e36552e14e514c6acfc8035b451aa4aff";

function pickBase() {
  const nowKst = new Date(Date.now() + 9 * 3600_000 - 15 * 60_000);
  const slots = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = nowKst.getUTCHours();
  let baseHour = slots.find((s) => s <= h);
  const date = new Date(nowKst);
  if (baseHour === undefined) {
    baseHour = 23;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return {
    baseDate: `${yyyy}${mm}${dd}`,
    baseTime: `${String(baseHour).padStart(2, "0")}00`,
  };
}

async function test(nx, ny, numOfRows) {
  const { baseDate, baseTime } = pickBase();
  const url = new URL(
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  console.log(`\n=== nx=${nx}, ny=${ny}, numOfRows=${numOfRows} (base_date=${baseDate}, base_time=${baseTime}) ===`);

  try {
    const start = Date.now();
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    const elapsed = Date.now() - start;
    console.log("HTTP status:", res.status, `(${elapsed}ms)`);
    const json = await res.json();
    const header = json.response?.header;
    console.log("resultCode/Msg:", header?.resultCode, header?.resultMsg);
    const items = json.response?.body?.items?.item ?? [];
    console.log("item count:", items.length);
    if (items.length === 0) {
      console.log("FULL RESPONSE (truncated):", JSON.stringify(json).slice(0, 1000));
    }
  } catch (err) {
    console.error("ERROR:", err.name, err.message);
  }
}

await test(102, 100, 1000); // 묵호항, 실제 코드와 동일 설정
await test(102, 100, 20);
