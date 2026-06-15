const fs = require("fs");
const path = require("path");

const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0;
const OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
const DEGRAD = Math.PI / 180.0;

function latLngToGrid(lat, lng) {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

const stations = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/data/tide-stations-master.json"), "utf8")
);

const result = stations.map((s) => {
  const { nx, ny } = latLngToGrid(s.lat, s.lng);
  return { code: s.code, name: s.name, lat: s.lat, lng: s.lng, nx, ny, sea: s.sea };
});

fs.writeFileSync(
  path.join(__dirname, "../src/data/tide-stations-grid.json"),
  JSON.stringify(result, null, 2),
  "utf8"
);

console.log(`완료: ${result.length}개 관측소 nx/ny 변환`);
result.slice(0, 5).forEach((r) => console.log(r));