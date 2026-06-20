import { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { windColor, WIND_COLORS, SUN_BAND_COLORS, TIMELINE_COLORS } from "@/lib/chart-colors";
import { getSunInfo } from "@/lib/sun.functions";
import { buildSunBands, bandFill, bandOpacity } from "@/lib/sun-bands";
import { getVillageForecastTimeline, getVillageForecast, type VillageForecastHour } from "@/lib/forecast.functions";
import { useQuery } from "@tanstack/react-query";
import { getPoint } from "@/lib/points";
import { getCustomPointsSync } from "@/lib/custom-points-store";
import { nearestStationCodeByGrid } from "@/lib/geo";
import { supabase } from "@/lib/supabase";

type Range = 1 | 3;

const ZONE_COLORS = {
  past: "hsl(0 0% 15%)",
  near: "hsl(217 91% 45%)",
  far: "hsl(199 80% 65%)",
} as const;

interface ChartPoint {
  t: number;
  hourOfDay: number;
  speed: number;
  speedPast: number | null;
  speedNear: number | null;
  speedFar: number | null;
  gust: number;
  dir: number;
  dirLabel: string;
  source: "ultra" | "short";
}

function degToLabel(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function buildData(timeline: VillageForecastHour[], nowT: number): ChartPoint[] {
  const filtered = timeline.filter((h) => h.wsd != null);

  const zoneOf = (t: number): "past" | "near" | "far" => {
    if (t < nowT) return "past";
    if (t < nowT + 6) return "near";
    return "far";
  };

  const zones = filtered.map((h) => zoneOf(h.hour));

  return filtered.map((h, i) => {
    const speed = h.wsd ?? 0;
    const zone = zones[i];
    const prevZone = i > 0 ? zones[i - 1] : zone;
    const nextZone = i < zones.length - 1 ? zones[i + 1] : zone;

    const inPast = zone === "past" || (zone === "near" && prevZone === "past");
    const inNear = zone === "near" || (zone === "past" && nextZone === "near") || (zone === "far" && prevZone === "near");
    const inFar = zone === "far" || (zone === "near" && nextZone === "far");

    return {
      t: h.hour,
      hourOfDay: h.hour % 24,
      speed,
      speedPast: inPast ? speed : null,
      speedNear: inNear ? speed : null,
      speedFar: inFar ? speed : null,
      gust: Math.round((speed * 1.3) * 10) / 10,
      dir: h.vec ?? 0,
      dirLabel: degToLabel(h.vec ?? 0),
      source: h.source,
    };
  });
}

function nowHour(): number {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return kst.getUTCHours() + kst.getUTCMinutes() / 60;
}

async function traceClientRender(stationCode: string, windSpeed: number | null) {
  try {
    const kst = new Date(Date.now() + 9 * 3600_000);
    const hourSlot = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}T${String(kst.getUTCHours()).padStart(2, "0")}:00:00+09:00`;
    await supabase.from("debug_trace").insert({
      trace_key: `${stationCode}|${hourSlot}`,
      node: "client_render",
      wind_speed: windSpeed,
      note: "screen render",
    });
  } catch {
    // ignore trace failure
  }
}

function WindPropeller({ speed }: { speed: number }) {
  const duration =
    speed <= 0.5 ? 6 :
    speed <= 2 ? 4 :
    speed <= 5 ? 2 :
    speed <= 10 ? 1 :
    0.4;

  const bladeFill =
    speed <= 5.6 ? "hsl(199 80% 75%)" :
    speed <= 10  ? "hsl(25 90% 70%)" :
                   "hsl(0 80% 72%)";
  const bladeStroke =
    speed <= 5.6 ? "hsl(199 70% 58%)" :
    speed <= 10  ? "hsl(25 80% 55%)" :
                   "hsl(0 70% 58%)";
  const hubFill =
    speed <= 5.6 ? "hsl(199 75% 68%)" :
    speed <= 10  ? "hsl(25 85% 62%)" :
                   "hsl(0 75% 62%)";
  const hubInner =
    speed <= 5.6 ? "hsl(199 70% 55%)" :
    speed <= 10  ? "hsl(25 80% 50%)" :
                   "hsl(0 70% 50%)";

  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 38 38"
      style={{ animation: `windSpin ${duration}s linear infinite`, flexShrink: 0 }}
    >
      <style>{`@keyframes windSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {[0, 120, 240].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 19 19)`}>
          <path
            d="M19,19 C16,16 15,10 17,4 C18,1 20,1 21,4 C23,10 22,16 19,19 Z"
            fill={bladeFill}
            stroke={bladeStroke}
            strokeWidth="0.5"
          />
        </g>
      ))}
      <circle cx="19" cy="19" r="3.5" fill={hubFill} stroke={bladeStroke} strokeWidth="0.8" />
      <circle cx="19" cy="19" r="1.5" fill={hubInner} />
    </svg>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export default function WindChart({ pointId }: { pointId: string }) {
  const [range, setRange] = useState<Range>(1);
  const [sunInfo, setSunInfo] = useState<{ sunrise: number; sunset: number } | null>(null);
  const [activeT, setActiveT] = useState<number>(nowHour());
  const [isDragging, setIsDragging] = useState(false);

  const point = useMemo(() => {
    return getPoint(pointId) ?? getCustomPointsSync().find((p) => p.id === pointId);
  }, [pointId]);

  const { data: timeline = [] } = useQuery({
    queryKey: ["fcstTimeline", point?.nx, point?.ny],
    queryFn: () => getVillageForecastTimeline({ nx: point!.nx, ny: point!.ny }),
    enabled: !!point,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: currentFcst } = useQuery({
    queryKey: ["fcst", point?.nx, point?.ny],
    queryFn: () => getVillageForecast({ nx: point!.nx, ny: point!.ny }),
    enabled: !!point,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const currentNow = nowHour();

  const data = useMemo(() => {
    const built = buildData(timeline, currentNow);
    return built.filter((d) => d.t < range * 24);
  }, [timeline, range, currentNow]);

  useEffect(() => {
    if (point) getSunInfo(point.lat, point.lng).then(setSunInfo);
  }, [point]);

  useEffect(() => {
    setActiveT(nowHour());
    setIsDragging(false);
  }, [range]);

  const sunBands = useMemo(() => {
    const sr = sunInfo?.sunrise ?? 5.5;
    const ss = sunInfo?.sunset ?? 19.0;
    return buildSunBands(sr, ss, range);
  }, [sunInfo, range]);

  const arrowEvery = range === 1 ? 1 : 2;

  const activePoint = useMemo(() => {
    if (isDragging || !currentFcst?.wsd) {
      if (!data.length) return null;
      return data.reduce(
        (best, p) => Math.abs(p.t - activeT) < Math.abs(best.t - activeT) ? p : best,
        data[0],
      );
    }
    return {
      t: currentNow,
      hourOfDay: Math.floor(currentNow),
      speed: currentFcst.wsd,
      gust: Math.round((currentFcst.wsd * 1.3) * 10) / 10,
      dir: currentFcst.vec ?? 0,
      dirLabel: degToLabel(currentFcst.vec ?? 0),
      source: "ultra" as const,
    };
  }, [isDragging, currentFcst, data, activeT, currentNow]);

  useEffect(() => {
    if (isDragging || !point || !activePoint) return;
    const stationCode = nearestStationCodeByGrid(point.nx, point.ny);
    traceClientRender(stationCode, activePoint.speed);
  }, [isDragging, point, activePoint]);

  const handleMove = (state: { activeLabel?: string | number }) => {
    if (state?.activeLabel !== undefined && state.activeLabel !== null) {
      const v = Number(state.activeLabel);
      if (!Number.isNaN(v)) {
        setActiveT(v);
        setIsDragging(true);
      }
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setActiveT(nowHour());
  };

  const activeHourInt = Math.floor(activeT);
  const activeMin = Math.round((activeT - activeHourInt) * 60);
  const activeTimeStr = `${String(activeHourInt).padStart(2, "0")}:${String(activeMin).padStart(2, "0")}`;

  const renderDot = (props: unknown, zoneKey: "speedPast" | "speedNear" | "speedFar", color: string) => {
    const { cx, cy, payload, index } = props as {
      cx: number; cy: number; payload: ChartPoint; index: number;
    };
    if (index % arrowEvery !== 0) return <g key={index} />;
    if (!payload[zoneKey]) return <g key={index} />;
    return (
      <g key={index} transform={`translate(${cx}, ${cy}) rotate(${payload.dir + 180})`}>
        <path
          d="M0,-5 L3.5,4 L0,2 L-3.5,4 Z"
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </g>
    );
  };

  return (
    <Card className="p-4 bg-white shadow-md overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold">바람</h2>
        <div className="flex rounded-full bg-muted p-0.5 text-xs">
          {([1, 3] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-full font-medium transition ${
                r === range
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {r}일
            </button>
          ))}
        </div>
      </div>

      {activePoint && (
        <div className="flex items-center gap-2 mb-1">
          <WindPropeller speed={activePoint.speed} />
          <span className="text-3xl font-bold text-foreground leading-none">
            {activePoint.speed}
          </span>
          <span className="text-sm text-muted-foreground">m/s</span>
          <span
            className="inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: windColor(activePoint.speed) }}
          >
            <Navigation
              className="w-4 h-4"
              style={{ transform: `rotate(${activePoint.dir + 180}deg)` }}
              fill="currentColor"
            />
            {activePoint.dirLabel}
          </span>
          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            돌풍 <span className="font-semibold text-foreground">{activePoint.gust} m/s</span>
          </span>
        </div>
      )}

      {!activePoint && (
        <div className="h-10 flex items-center text-xs text-muted-foreground">불러오는 중…</div>
      )}

      <div className="mb-3" />

      <div
        className="h-56 w-full -mx-2 touch-pan-y select-none"
        onMouseLeave={handleMouseLeave}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 28, right: 12, left: -10, bottom: 0 }}
            onMouseMove={handleMove}
            onMouseDown={handleMove}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            {sunBands.map((b, i) => (
              <ReferenceArea
                key={i}
                x1={b.x1}
                x2={b.x2}
                fill={bandFill(b.type)}
                fillOpacity={bandOpacity(b.type)}
                stroke="none"
              />
            ))}
            {Array.from({ length: range }, (_, d) => {
              const today = new Date(Date.now() + 9 * 3600_000);
              today.setUTCDate(today.getUTCDate() + d);
              const label = `${today.getUTCMonth() + 1}월 ${today.getUTCDate()}일`;
              return (
                <ReferenceLine
                  key={`date-${d}`}
                  x={d * 24 + 12}
                  stroke="transparent"
                  label={{
                    value: label,
                    position: "insideTop",
                    fontSize: 10,
                    fill: "hsl(0 0% 50%)",
                    dy: -20,
                  }}
                />
              );
            })}
            <ReferenceLine
              x={currentNow}
              stroke={TIMELINE_COLORS.current}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <ReferenceLine
              x={activeT}
              stroke={TIMELINE_COLORS.active}
              strokeWidth={2}
              label={(props: { viewBox?: { x?: number; y?: number } }) => {
                const x = props.viewBox?.x ?? 0;
                const y = (props.viewBox?.y ?? 0) + 8;
                const w = 44;
                const h = 18;
                return (
                  <g>
                    <rect x={x - w / 2} y={y} width={w} height={h} rx={9} ry={9} fill={TIMELINE_COLORS.active} />
                    <text x={x} y={y + h / 2 + 4} textAnchor="middle" fontSize={10} fontWeight="600" fill="white">
                      {activeTimeStr}
                    </text>
                  </g>
                );
              }}
            />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, range * 24]}
              ticks={
                range === 1
                  ? [0, 6, 12, 18]
                  : Array.from({ length: range }, (_, d) => d * 24 + 12)
              }
              tickFormatter={(t: number) => {
                if (range === 1) return `${t}시`;
                return `D${Math.floor(t / 24) + 1}`;
              }}
              tick={{ fontSize: 10 }}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              unit=" m/s"
              stroke="var(--muted-foreground)"
              width={48}
              domain={[0, "dataMax + 3"]}
            />
            <Tooltip content={() => null} isAnimationActive={false} cursor={false} />

            <Line
              type="monotone"
              dataKey="speedPast"
              stroke={ZONE_COLORS.past}
              strokeWidth={2.5}
              isAnimationActive={false}
              activeDot={false}
              connectNulls={false}
              dot={(props) => renderDot(props, "speedPast", ZONE_COLORS.past)}
            />
            <Line
              type="monotone"
              dataKey="speedNear"
              stroke={ZONE_COLORS.near}
              strokeWidth={2.5}
              isAnimationActive={false}
              activeDot={false}
              connectNulls={false}
              dot={(props) => renderDot(props, "speedNear", ZONE_COLORS.near)}
            />
            <Line
              type="monotone"
              dataKey="speedFar"
              stroke={ZONE_COLORS.far}
              strokeWidth={2.5}
              isAnimationActive={false}
              activeDot={false}
              connectNulls={false}
              dot={(props) => renderDot(props, "speedFar", ZONE_COLORS.far)}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
        <LegendDot color={ZONE_COLORS.past} label="과거~현재" />
        <LegendDot color={ZONE_COLORS.near} label="현재~+6시간" />
        <LegendDot color={ZONE_COLORS.far} label="그 이후" />
        <span className="flex items-center gap-1">
          <span className="flex overflow-hidden rounded" style={{ width: "24px", height: "12px" }}>
            <span className="flex-1" style={{ background: `${SUN_BAND_COLORS.dawn}80` }} />
            <span className="flex-1" style={{ background: `${SUN_BAND_COLORS.dusk}80` }} />
          </span>
          일출/일몰
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border border-border" style={{ background: "hsl(270 60% 55% / 0.3)" }} />
          야간
        </span>
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: TIMELINE_COLORS.current }} />
            현재
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 border-t-2" style={{ borderColor: TIMELINE_COLORS.active }} />
            탐색
          </span>
        </span>
      </div>
    </Card>
  );
}