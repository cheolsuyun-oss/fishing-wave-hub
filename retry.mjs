import fs from "fs";

const envText = fs.readFileSync(".env", "utf-8");
const apiKey = envText
  .split(/\r?\n/)
  .map((l) => l.trim())
  .find((l) => l.startsWith("KMA_API_KEY="))
  .split("=")[1];

const codes = ["DT_0003", "DT_0009", "DT_0015", "DT_0019", "DT_0020", "DT_0024"];

for (const code of codes) {
  const url = new URL("https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("obsCode", code);
  url.searchParams.set("reqDate", "20260613");

  const text = await fetch(url).then((r) => r.text());
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(code, "-> PARSE_ERROR:", text.slice(0, 100));
    continue;
  }
  const header = json?.response?.header ?? json?.header ?? {};
  const items = json?.response?.body?.items?.item ?? json?.body?.items?.item;
  const sample = Array.isArray(items) ? items[0] : items;
  console.log(code, "->", header.resultCode, header.resultMsg, sample ? sample.obsvtrNm : "");
}