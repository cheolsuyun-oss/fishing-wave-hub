const apiKey = "d65763d0e480e3a1fa5aae419a1a335e36552e14e514c6acfc8035b451aa4aff";

const CODES = [
"DT_0001","DT_0002","DT_0003","DT_0004","DT_0005","DT_0006","DT_0007","DT_0008",
"DT_0010","DT_0011","DT_0012","DT_0013","DT_0014","DT_0016","DT_0017","DT_0018",
"DT_0020","DT_0021","DT_0022","DT_0023","DT_0024","DT_0025","DT_0026","DT_0027",
"DT_0028","DT_0029",
];

function kstDateYYYYMMDD() {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
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
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { code, status: res.status, raw: text.slice(0, 300), json };
  } catch (e) {
    return { code, error: String(e) };
  }
}

for (const code of CODES) {
  const r = await fetchOne(code);
  console.log(`\n=== ${code} ===`);
  console.log(JSON.stringify(r, null, 2).slice(0, 500));
  await new Promise((res) => setTimeout(res, 100));
}
