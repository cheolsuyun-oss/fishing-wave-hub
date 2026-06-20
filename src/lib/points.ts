export type RiskLevel = "safe" | "caution" | "danger";

export interface FishingPoint {
  id: string;
  name: string;
  memo?: string;
  sea: "동해" | "서해" | "남해" | "제주";
  risk: RiskLevel;
  windSpeed: number;
  waveHeight: number;
  tide: string;
  nx: number;
  ny: number;
  tideStationCode: string;
  lat: number;
  lng: number;
}

export const POINTS: FishingPoint[] = [
  {
    id: "mukho-breakwater",
    name: "강원 묵호항 방파제",
    sea: "동해",
    risk: "safe",
    windSpeed: 4,
    waveHeight: 0.4,
    tide: "3물",
    nx: 102,
    ny: 100,
    tideStationCode: "DT_0006",
    lat: 37.5486,
    lng: 129.1169,
  },
  {
    id: "daecheon-breakwater",
    name: "충남 대천항 방파제",
    sea: "서해",
    risk: "caution",
    windSpeed: 8,
    waveHeight: 0.7,
    tide: "5물",
    nx: 54,
    ny: 100,
    tideStationCode: "DT_0025",
    lat: 36.3297,
    lng: 126.4867,
  },
  {
    id: "tongyeong-breakwater",
    name: "경남 통영항 방파제",
    sea: "남해",
    risk: "safe",
    windSpeed: 5,
    waveHeight: 0.5,
    tide: "4물",
    nx: 97,
    ny: 66,
    tideStationCode: "DT_0014",
    lat: 34.8544,
    lng: 128.4337,
  },
];

export const RISK_META: Record<RiskLevel, { label: string; className: string }> = {
  safe: {
    label: "출조가능",
    className: "bg-sky-100 text-blue-600 border-blue-300",
  },
  caution: {
    label: "주의",
    className: "bg-yellow-100 text-orange-600 border-orange-300",
  },
  danger: {
    label: "출조불가",
    className: "bg-pink-100 text-red-600 border-red-300",
  },
};

export function getPoint(id: string) {
  return POINTS.find((p) => p.id === id);
}