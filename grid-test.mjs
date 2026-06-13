// 기상청 단기예보 API로 (106,96) vs (107,97) 비교 테스트
// 실행: node grid-test.mjs  (프로젝트 루트에서)

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
  const url = new URL(
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "20");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  console.log(`\n=== nx=${nx}, ny=${ny} (base_date=${baseDate}, base_time=${baseTime}) ===`);
  console.log("URL:", url.toString());

  try {
    const res = await fetch(url.toString());
    console.log("HTTP status:", res.status);
    const json = await res.json();
    const header = json.response?.header;
    console.log("resultCode/Msg:", header?.resultCode, header?.resultMsg);
    const items = json.response?.body?.items?.item ?? [];
    console.log("item count:", items.length);
    if (items.length > 0) {
      console.log("sample items:", items.slice(0, 6));
    }
  } catch (err) {
    console.error("ERROR:", err);
  }
}

await test(106, 96); // 호미곶 - 기존 코드 결과
await test(107, 97); // 호미곶 - 9차 세션 "정답"
