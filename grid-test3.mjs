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

async function test(nx, ny) {
  const { baseDate, baseTime } = pickBase();
  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  console.log(`\n=== nx=${nx}, ny=${ny} (base_date=${baseDate}, base_time=${baseTime}) ===`);
  const res = await fetch(url.toString());
  const json = await res.json();
  const items = json.response?.body?.items?.item ?? [];
  console.log("resultCode:", json.response?.header?.resultCode, "items:", items.length);

  // 가장 가까운 시각의 WSD, WAV, TMP, POP만 추출
  const uniqTimes = Array.from(new Set(items.map(i => `${i.fcstDate}${i.fcstTime}`))).sort();
  const targetKey = uniqTimes[0];
  const pick = (cat) => items.find(i => i.category === cat && `${i.fcstDate}${i.fcstTime}` === targetKey)?.fcstValue;
  console.log("targetTime:", targetKey);
  console.log("WSD(풍속):", pick("WSD"), "WAV(파고):", pick("WAV"), "TMP(기온):", pick("TMP"), "POP(강수):", pick("POP"), "VEC(풍향):", pick("VEC"));
}

await test(27, 50);   // 가거도 - 계산된 격자
await test(28, 50);   // 인접 격자 비교용
await test(27, 49);   // 인접 격자 비교용
