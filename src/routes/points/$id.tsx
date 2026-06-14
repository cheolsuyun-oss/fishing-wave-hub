import { lazy, Suspense, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Wind,
  Waves,
  CloudRain,
  Thermometer,
  MapPin,
  ExternalLink,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getPoint, RISK_META, type FishingPoint } from "@/lib/points";
import { getCustomPointsSync, useCustomPoints } from "@/lib/custom-points-store";
import { getPointDetail } from "@/lib/point-detail-data";
import { getTidePredict, type TideEvent } from "@/lib/tide.functions";
import { getVillageForecast } from "@/lib/forecast.functions";
import { saveUltraShortForecast } from "@/lib/ultra-short-forecast";
import { formatFcstBasis } from "@/lib/geo";
import type { TideEventProp } from "@/components/detail/TideChart";

const TideChart = lazy(() => import("@/components/detail/TideChart"));
const WeatherCharts = lazy(() => import("@/components/detail/WeatherCharts"));

function resolvePoint(id: string): FishingPoint | undefined {
  return getPoint(id) ?? getCustomPointsSync().find((p) => p.id === id);
}

export const Route = createFileRoute("/points/$id")({
  component: PointDetail,
  loader: ({ params }) => {
    const point = resolvePoint(params.id);
    return { id: params.id, point: point ?? null };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.point?.name ?? "포인트"} - 낚시와바다` },
      {
        name: "description",
        content: `${loaderData?.point?.name ?? ""}의 실시간 풍속, 파고, 물때 정보`,
      },
    ],
  }),
});

function tideSummary(events: TideEvent[]): { type: "high" | "low"; time: string; inText: string } | null {
  if (events.length === 0) return null;
  const nowKst = new Date(Date.now() + 9 * 3600_000);
  const nowMin = nowKst.getUTCHours() * 60 + nowKst.getUTCMinutes();
  const future = events
    .map((e) => {
      const [h, m] = e.time.split(":").map(Number);
      return { e, min: h * 60 + m };
    })
    .filter((x) => x.min >= nowMin)
    .sort((a, b) => a.min - b.min);
  const next = future[0];
  if (!next) return null;
  const diff = next.min - nowMin;
  const hh = Math.floor(diff / 60);
  const mm = diff % 60;
  const inText = hh > 0 ? `${hh}시간 ${mm}분 후` : `${mm}분 후`;
  return { type: next.e.type, time: next.e.time, inText };
}

function computeRange(events: TideEvent[]): number | null {
  if (events.length < 2) return null;
  const levels = events.map((e) => e.level);
  return Math.max(...levels) - Math.min(...levels);
}

function getRiskSummaryMessage(
  windLevel: "safe" | "caution" | "danger",
  waveLevel: "safe" | "caution" | "danger",
  rainLevel: "safe" | "caution" | "danger",
  tempLevel: "safe" | "caution" | "danger"
): string {
  const items = [
    { label: "풍속", level: windLevel },
    { label: "파고", level: waveLevel },
    { label: "강수", level: rainLevel },
    { label: "기온", level: tempLevel },
  ];
  const dangers = items.filter((i) => i.level === "danger").map((i) => i.label);
  const cautions = items.filter((i) => i.level === "caution").map((i) => i.label);
  if (dangers.length > 0) {
    const dangerText = dangers.join(", ");
    const cautionSuffix = cautions.length > 0 ? ` (${cautions.join(", ")}도 주의)` : "";
    return `${dangerText} 때문에 낚시가 불가능한 날씨입니다. 오늘은 안전하게 쉬어가는 게 좋겠습니다.${cautionSuffix}`;
  }
  if (cautions.length > 0) {
    return `${cautions.join(", ")}에 주의가 필요한 날씨입니다. 오늘 출조를 하신다면, 철저하게 준비상황을 다시 점검해 주세요.`;
  }
  return "낚시하기에 좋은 날씨입니다.";
}

function getOverallLevel(
  windLevel: "safe" | "caution" | "danger",
  waveLevel: "safe" | "caution" | "danger",
  rainLevel: "safe" | "caution" | "danger",
  tempLevel: "safe" | "caution" | "danger"
): "safe" | "caution" | "danger" {
  const levels = [windLevel, waveLevel, rainLevel, tempLevel];
  if (levels.includes("danger")) return "danger";
  if (levels.includes("caution")) return "caution";
  return "safe";
}

function PointDetail() {
  const { id, point: ssrPoint } = Route.useLoaderData() as {
    id: string;
    point: FishingPoint | null;
  };
  const customs = useCustomPoints();
  const point = ssrPoint ?? customs.find((p) => p.id === id);

  if (!point) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-lg font-bold">포인트를 찾을 수 없습니다</h1>
          <Link to="/" className="mt-3 inline-block text-sm text-primary underline">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const risk = RISK_META[point.risk];
  const detail = getPointDetail(point.id);
  const firstRain = detail.rain[0]?.value ?? 0;
  const firstTemp = detail.temp[Math.floor(detail.temp.length / 2)]?.value ?? 0;

  const { data: tide, isLoading: tideLoading } = useQuery({
    queryKey: ["tide", point.tideStationCode],
    queryFn: () => getTidePredict({ stationCode: point.tideStationCode }),
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useQuery({
    queryKey: ["ultraShort", point.id, point.nx, point.ny],
    queryFn: () => saveUltraShortForecast({ pointId: point.id, nx: point.nx, ny: point.ny }),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: fcst } = useQuery({
    queryKey: ["fcst", point.nx, point.ny],
    queryFn: () => getVillageForecast({ nx: point.nx, ny: point.ny }),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const windValue = fcst?.wsd != null ? fcst.wsd : point.windSpeed;
  const waveValue = fcst?.wav != null ? fcst.wav : point.waveHeight;
  const windLevel = windValue <= 5.6 ? "safe" : windValue <= 10 ? "caution" : "danger";
  const waveLevel = waveValue <= 0.5 ? "safe" : waveValue <= 1.4 ? "caution" : "danger";
  const rainLevel = firstRain <= 30 ? "safe" : firstRain <= 60 ? "caution" : "danger";
  const tempLevel = (firstTemp >= 15 && firstTemp <= 25) ? "safe" : (firstTemp >= 5 && firstTemp <= 30) ? "caution" : "danger";
  const riskMessage = getRiskSummaryMessage(windLevel, waveLevel, rainLevel, tempLevel);
  const overallLevel = getOverallLevel(windLevel, waveLevel, rainLevel, tempLevel);
  const overallLabel = overallLevel === "danger" ? "불가" : overallLevel === "caution" ? "주의" : "가능";
  const overallColorClass =
    overallLevel === "danger" ? "text-red-600" :
    overallLevel === "caution" ? "text-yellow-600" :
    "text-sky-600";
  const fcstBasis = formatFcstBasis(fcst?.fcstDate, fcst?.fcstTime);

  const apiHighs: TideEventProp[] = tide?.events.filter((e) => e.type === "high") ?? [];
  const apiLows: TideEventProp[] = tide?.events.filter((e) => e.type === "low") ?? [];
  const hasApiTide = apiHighs.length + apiLows.length > 0;

  const tideHighs: TideEventProp[] = hasApiTide
    ? apiHighs
    : detail.highs.map((h) => ({ time: h.time, level: h.level }));
  const tideLows: TideEventProp[] = hasApiTide
    ? apiLows
    : detail.lows.map((l) => ({ time: l.time, level: l.level }));

  const nextEvent = tideSummary(tide?.events ?? []);
  const tideRange = computeRange(tide?.events ?? []);

  const kakaoMapUrl = `https://map.kakao.com/?q=${encodeURIComponent(point.name)}`;

  const MEMO_KEY = `fishing.memo.${point.id}`;
  const [memoText, setMemoText] = useState<string>(
    () => localStorage.getItem(MEMO_KEY) ?? point.memo ?? ""
  );
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");

  const startMemoEdit = () => {
    setMemoDraft(memoText);
    setMemoEditing(true);
  };
  const saveMemo = () => {
    setMemoText(memoDraft);
    localStorage.setItem(MEMO_KEY, memoDraft);
    setMemoEditing(false);
  };
  const cancelMemo = () => {
    setMemoEditing(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="mx-auto max-w-md px-4 pt-3 pb-12">
        {/* 뒤로가기 + 포인트명 */}
        <div className="flex items-center gap-2 -ml-2">
          <Link
            to="/"
            className="p-2 rounded-full hover:bg-muted text-foreground"
            aria-label="뒤로가기"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold flex-1 truncate">{point.name}</h1>
        </div>

        {/* Section 1 - Point info */}
        <Card className="mt-4 p-5 bg-white shadow-md">
          <h2 className="text-sm font-bold mb-3">포인트 정보</h2>
          <dl className="space-y-2 text-sm">
            <Row label="포인트명" value={point.name} />
            <Row label="좌표" value="34.8211° N, 128.5435° E" />
          </dl>
          <Button asChild className="w-full mt-4" variant="outline">
            <a
              href={kakaoMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5"
            >
              <MapPin className="w-4 h-4" />
              카카오맵으로 보기
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </Card>

        {/* Section 2 - Memo + fishing log */}
        <Card className="mt-4 p-5 bg-white shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">포인트 메모</h2>
            {!memoEditing && (
              <button
                type="button"
                onClick={startMemoEdit}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground"
                aria-label="메모 편집"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {memoEditing ? (
            <div className="mb-4">
              <Textarea
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                placeholder="이 포인트에 대한 메모를 입력하세요"
                rows={4}
                maxLength={300}
                className="text-xs"
              />
              <div className="flex gap-2 mt-2 justify-end">
                <button
                  type="button"
                  onClick={cancelMemo}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                >
                  <X className="w-3.5 h-3.5" /> 취소
                </button>
                <button
                  type="button"
                  onClick={saveMemo}
                  className="flex items-center gap-1 text-xs text-primary font-medium hover:text-primary/80 px-2 py-1 rounded"
                >
                  <Check className="w-3.5 h-3.5" /> 저장
                </button>
              </div>
            </div>
          ) : memoText ? (
            <p className="text-xs text-muted-foreground leading-relaxed mb-4 whitespace-pre-wrap">
              {memoText}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/50 leading-relaxed mb-4">
              이 포인트에 대한 메모가 없습니다.
            </p>
          )}
          <div className="text-[11px] text-muted-foreground font-medium mb-2">조과 기록</div>
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            아직 등록된 조과 기록이 없습니다.<br />
            <span className="text-[10px] opacity-70">(최대 3건까지 무료 등록 가능)</span>
          </div>
        </Card>

        {/* Section 3 - Weather charts */}
        <div className="mt-4">
          <Suspense fallback={<ChartSkeleton title="기상 예보" />}>
            <WeatherCharts pointId={point.id} />
          </Suspense>
        </div>

        {/* Section 4 - Tide chart */}
        <div className="mt-4">
          <Suspense fallback={<ChartSkeleton title="물때 / 조수" />}>
            <TideChart
              highs={tideHighs}
              lows={tideLows}
              moon={detail.moon}
              isLoading={tideLoading}
              isFallback={!hasApiTide && !tideLoading}
            />
          </Suspense>
        </div>

        {/* Section 5 - Moon phase + tide */}
        <Card className="mt-4 p-5 bg-white shadow-md">
          <h2 className="text-sm font-bold mb-3">달 위상 & 조수</h2>
          <div className="flex items-center gap-4">
            <div className="text-5xl leading-none">{detail.moon.emoji}</div>
            <div className="flex-1">
              <div className="text-base font-bold">{detail.moon.phase}</div>
              <div className="text-xs text-muted-foreground">
                밝기 {detail.moon.illumination}% · {point.tide}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
            <div className="rounded-lg bg-red-50 border border-red-100 p-2.5">
              <div className="text-red-700 font-semibold mb-1">
                만조{" "}
                {!hasApiTide && !tideLoading && (
                  <span className="text-[10px] font-normal text-amber-500">(예시)</span>
                )}
              </div>
              {tideLoading && <div className="text-muted-foreground">불러오는 중…</div>}
              {!tideLoading && tideHighs.length === 0 && <div className="text-muted-foreground">-</div>}
              {tideHighs.map((h) => (
                <div key={`h-${h.time}`} className="flex justify-between text-foreground">
                  <span>{h.time}</span>
                  <span className="text-muted-foreground">{(h.level / 100).toFixed(2)}m</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5">
              <div className="text-blue-700 font-semibold mb-1">
                간조{" "}
                {!hasApiTide && !tideLoading && (
                  <span className="text-[10px] font-normal text-amber-500">(예시)</span>
                )}
              </div>
              {tideLoading && <div className="text-muted-foreground">불러오는 중…</div>}
              {!tideLoading && tideLows.length === 0 && <div className="text-muted-foreground">-</div>}
              {tideLows.map((l) => (
                <div key={`l-${l.time}`} className="flex justify-between text-foreground">
                  <span>{l.time}</span>
                  <span className="text-muted-foreground">{(l.level / 100).toFixed(2)}m</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  level,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  level?: "safe" | "caution" | "danger";
}) {
  const bg =
    level === "danger" ? "bg-red-100 border-red-300" :
    level === "caution" ? "bg-yellow-100 border-yellow-300" :
    level === "safe" ? "bg-sky-100 border-sky-300" :
    "bg-muted border-border";
  return (
    <div className={`rounded-xl border py-2.5 ${bg}`}>
      <div className="flex items-center justify-center text-primary mb-1">{icon}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground mt-0.5">
        {value}
        <span className="text-[10px] font-medium text-muted-foreground ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <Card className="p-4 bg-white">
      <div className="text-sm font-bold mb-3">{title}</div>
      <Skeleton className="h-48 w-full" />
    </Card>
  );
}