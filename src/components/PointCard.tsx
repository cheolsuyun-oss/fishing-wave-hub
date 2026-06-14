import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wind, Waves, CloudRain, Thermometer, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { type FishingPoint, RISK_META } from "@/lib/points";
import { getVillageForecast } from "@/lib/forecast.functions";
import { getTidePredict, type TideEvent } from "@/lib/tide.functions";
import { getPointDetail } from "@/lib/point-detail-data";

type Level = "safe" | "caution" | "danger";

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

function getOverallLevel(windLevel: Level, waveLevel: Level, rainLevel: Level, tempLevel: Level): Level {
  const levels = [windLevel, waveLevel, rainLevel, tempLevel];
  if (levels.includes("danger")) return "danger";
  if (levels.includes("caution")) return "caution";
  return "safe";
}

export function PointCard({
  point,
  onRemove,
}: {
  point: FishingPoint;
  onRemove?: (id: string) => void;
}) {
  const { data: fcst } = useQuery({
    queryKey: ["fcst", point.nx, point.ny],
    queryFn: () => getVillageForecast({ nx: point.nx, ny: point.ny }),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: tide, isLoading: tideLoading } = useQuery({
    queryKey: ["tide", point.tideStationCode],
    queryFn: () => getTidePredict({ stationCode: point.tideStationCode }),
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const detail = getPointDetail(point.id);
  const firstRain = detail.rain[0]?.value ?? 0;
  const firstTemp = detail.temp[Math.floor(detail.temp.length / 2)]?.value ?? 0;

  const windValue = fcst?.wsd != null ? fcst.wsd : point.windSpeed;
  const waveValue = fcst?.wav != null ? fcst.wav : point.waveHeight;

  const windLevel: Level = windValue <= 5.6 ? "safe" : windValue <= 10 ? "caution" : "danger";
  const waveLevel: Level = waveValue <= 0.5 ? "safe" : waveValue <= 1.4 ? "caution" : "danger";
  const rainLevel: Level = firstRain <= 30 ? "safe" : firstRain <= 60 ? "caution" : "danger";
  const tempLevel: Level =
    firstTemp >= 15 && firstTemp <= 25 ? "safe" : firstTemp >= 5 && firstTemp <= 30 ? "caution" : "danger";

  const overallLevel = getOverallLevel(windLevel, waveLevel, rainLevel, tempLevel);
  const risk = RISK_META[overallLevel];

  const apiHighs = tide?.events.filter((e) => e.type === "high") ?? [];
  const apiLows = tide?.events.filter((e) => e.type === "low") ?? [];
  const hasApiTide = apiHighs.length + apiLows.length > 0;

  const tideHighs = hasApiTide ? apiHighs : detail.highs.map((h) => ({ time: h.time, level: h.level, type: "high" as const }));
  const tideLows = hasApiTide ? apiLows : detail.lows.map((l) => ({ time: l.time, level: l.level, type: "low" as const }));

  const nextEvent = tideSummary(tide?.events ?? []);
  const tideRange = computeRange(tide?.events ?? []);

  return (
    <div className="relative">
      <Link
        to="/points/$id"
        params={{ id: point.id }}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
      >
        <Card className="p-4 bg-white shadow-md hover:shadow-lg transition-shadow active:scale-[0.99]">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="text-base font-semibold text-foreground pr-6">
              {point.name}
            </h3>
            <Badge
              variant="outline"
              className={`${risk.className} font-semibold px-2.5 py-0.5 mr-7 whitespace-nowrap`}
            >
              {risk.label}
            </Badge>
          </div>
        

          <p className="text-xs text-muted-foreground mb-3">{
            overallLevel === "danger"
              ? "출조가 불가능한 날씨입니다."
              : overallLevel === "caution"
              ? "출조 시 주의가 필요한 날씨입니다."
              : "낚시하기에 좋은 날씨입니다."
          }</p>

          <div className="grid grid-cols-4 gap-2 text-center">
            <Metric icon={<Wind className="w-4 h-4" />} label="풍속" value={`${windValue}`} unit="m/s" level={windLevel} />
            <Metric icon={<Waves className="w-4 h-4" />} label="파고" value={`${waveValue}`} unit="m" level={waveLevel} />
            <Metric icon={<CloudRain className="w-4 h-4" />} label="강수" value={`${firstRain}`} unit="%" level={rainLevel} />
            <Metric icon={<Thermometer className="w-4 h-4" />} label="기온" value={`${firstTemp}`} unit="°" level={tempLevel} />
          </div>

          <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-red-50 px-3 py-2">
              <span className="text-red-700 font-semibold">만조</span>{" "}
              <span className="text-foreground">
                {tideLoading ? "…" : (tideHighs[0]?.time ?? "-")}
              </span>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2">
              <span className="text-blue-700 font-semibold">간조</span>{" "}
              <span className="text-foreground">
                {tideLoading ? "…" : (tideLows[0]?.time ?? "-")}
              </span>
            </div>
          </div>

          {(nextEvent || tideRange) && (
            <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
              {nextEvent && (
                <span>
                  다음 {nextEvent.type === "high" ? "만조" : "간조"} {nextEvent.time}
                  {" "}
                  <span className="text-foreground/70">({nextEvent.inText})</span>
                </span>
              )}
              {tideRange && (
                <span>
                  조수차{" "}
                  <span className="font-semibold text-foreground">
                    {(tideRange / 100).toFixed(2)}m
                  </span>
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end text-xs text-primary font-medium">
            상세보기 <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </Card>
      </Link>

      {onRemove && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              aria-label="즐겨찾기 삭제"
              className="absolute top-2.5 right-2.5 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>즐겨찾기 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                "{point.name}" 을 즐겨찾기에서 삭제할까요?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRemove(point.id)}>
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
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
  level?: Level;
}) {
  const bg =
    level === "danger" ? "bg-red-100 border-red-300" :
    level === "caution" ? "bg-yellow-100 border-yellow-300" :
    level === "safe" ? "bg-sky-100 border-sky-300" :
    "bg-muted border-border";
  return (
    <div className={`rounded-xl border py-2.5 ${bg}`}>
      <div className="flex items-center justify-center text-primary mb-1">
        {icon}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground mt-0.5">
        {value}
        <span className="text-[10px] font-medium text-muted-foreground ml-0.5">{unit}</span>
      </div>
    </div>
  );
}
