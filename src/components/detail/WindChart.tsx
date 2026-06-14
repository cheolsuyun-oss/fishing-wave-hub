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
import { getPointDetail, windColor, type WindHour } from "@/lib/point-detail-data";
import { getSunInfo } from "@/lib/sun.functions";
import { buildSunBands, bandFill, bandOpacity } from "@/lib/sun-bands";

type Range = 1 | 3 | 5;

interface ChartPoint {
  t: number;
  hourOfDay: number;
  dayIdx: number;
  speed: number;
  speedKmh: number;
  gust: number;
  gustKmh: number;
  dir: number;
  dirLabel: string;
  label: string;
}

function buildData(base: WindHour[], days: Range): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let d = 0; d < days; d += 1) {
    base.forEach((w, i) => {
      const drift = d === 0 ? 0 : Math.sin(d + i) * 0.8;
      const speed = Math.max(1, Math.round((w.speed + drift) * 10) / 10);
      const gust = Math.max(speed + 1, Math.round((w.gust + drift) * 10) / 10);
      out.push({
        t: d * 24 + w.hour,
        hourOfDay: w.hour,
        dayIdx: d,
        speed,
        speedKmh: Math.round(speed * 3.6 * 10) / 10,
        gust,
        gustKmh: Math.round(gust * 3.6 * 10) / 10,
        dir: w.dir,
        dirLabel: w.dirLabel,
        label: days === 1 ? `${w.hour}시` : `D${d + 1} ${w.hour}시`,
      });
    });
  }
  return out;
}

function nowHour(): number {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return kst.getUTCHours() + kst.getUTCMinutes() / 60;
}

export default function WindChart({ pointId }: { pointId: string }) {
  const [range, setRange] = useState<Range>(1);
  const [sunInfo, setSunInfo] = useState<{ sunrise: number; sunset: number } | null>(null);
  const [activeT, setActiveT] = useState<number>(nowHour());

  const detail = getPointDetail(pointId);
  const data = useMemo(() => buildData(detail.wind, range), [detail.wind, range]);
  const currentNow = nowHour();

  useEffect(() => {
    import("@/lib/points").then(({ getPoint, POINTS }) => {
      const pt = getPoint(pointId) ?? POINTS.find((p) => p.id === pointId);
      if (pt) getSunInfo(pt.lat, pt.lng).then(setSunInfo);
    });
  }, [pointId]);

  // range 바뀌면 activeT 현재시각으로 리셋
  useEffect(() => {
    setActiveT(nowHour());
  }, [range]);

  const sunBands = useMemo(() => {
    const sr = sunInfo?.sunrise ?? 5.5;
    const ss = sunInfo?.sunset ?? 19.5;
    return buildSunBands(sr, ss, range);
  }, [sunInfo, range]);

  const arrowEvery = range === 1 ? 1 : range === 3 ? 2 : 3;

  // activeT 기준 가장 가까운 데이터 포인트
  const activePoint = data.reduce(
    (best, p) =>
      Math.abs(p.t - activeT) < Math.abs(best.t - activeT) ? p : best,
    data[0],
  );

  const handleMove = (state: { activeLabel?: string | number }) => {
    if (state?.activeLabel !== undefined && state.activeLabel !== null) {
      const v = Number(state.activeLabel);
      if (!Number.isNaN(v)) setActiveT(v);
    }
  };

  // activeT → 시:분 표시
  const activeHourInt = Math.floor(activeT);
  const activeMin = Math.round((activeT - activeHourInt) * 60);
  const activeTimeStr = `${String(activeHourInt).padStart(2, "0")}:${String(activeMin).padStart(2, "0")}`;

  return (
    <Card className="p-4 bg-white shadow-md overflow-hidden">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold mb-2">바람</h2>
          <div className="flex items-end gap-2 flex-wrap">
            <span className="text-3xl font-bold text-foreground leading-none">
              {activePoint.speedKmh}
            </span>
            <span className="text-sm text-muted-foreground pb-1">km/h</span>
            <span
              className="inline-flex items-center gap-1 text-sm font-semibold pb-1"
              style={{ color: windColor(activePoint.speed) }}
            >
              <Navigation
                className="w-4 h-4"
                style={{ transform: `rotate(${activePoint.dir + 180}deg)` }}
                fill="currentColor"
              />
              {activePoint.dirLabel}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            돌풍{" "}
            <span className="font-semibold text-foreground">{activePoint.gustKmh} km/h</span>
            <span className="ml-2 text-muted-foreground">{activeTimeStr} 기준</span>
          </div>
        </div>

        <div className="flex rounded-full bg-muted p-0.5 text-xs h-fit">
          {([1, 3, 5] as Range[]).map((r) => (
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

      <div className="h-56 w-full -mx-2 touch-pan-y select-none">
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
            {/* 현재시각 고정선 (검정) */}
            <ReferenceLine
              x={currentNow}
              stroke="hsl(0 0% 15%)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {/* 탐색선 (파랑) */}
            <ReferenceLine
              x={activeT}
              stroke="hsl(217 80% 50%)"
              strokeWidth={2}
            />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, range * 24 - 3]}
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
            <Tooltip
              content={() => null}
              isAnimationActive={false}
              cursor={false}
            />
            <Line
              type="monotone"
              dataKey="speed"
              stroke="var(--primary)"
              strokeWidth={2.5}
              isAnimationActive={false}
              activeDot={false}
              dot={(props) => {
                const { cx, cy, payload, index } = props as {
                  cx: number;
                  cy: number;
                  payload: ChartPoint;
                  index: number;
                };
                if (index % arrowEvery !== 0) return <g key={index} />;
                const color = windColor(payload.speed);
                return (
                  <g
                    key={index}
                    transform={`translate(${cx}, ${cy - 16}) rotate(${payload.dir + 180})`}
                  >
                    <circle r={9} fill="white" stroke={color} strokeWidth={1.5} />
                    <path
                      d="M0,-5 L3.5,4 L0,2 L-3.5,4 Z"
                      fill={color}
                      stroke={color}
                      strokeWidth={1}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
        <LegendDot color="hsl(142 70% 40%)" label="≤7m/s" />
        <LegendDot color="hsl(40 95% 50%)" label="≤14m/s" />
        <LegendDot color="hsl(0 75% 52%)" label=">14m/s" />
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[hsl(45_95%_65%)]/40" />
          일출/일몰
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-muted-foreground/20 border border-border" />
          야간
        </span>
        <span className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-4 border-t-2 border-dashed border-foreground/40" />
            현재
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 border-t-2 border-[hsl(217_80%_50%)]" />
            탐색
          </span>
        </span>
      </div>
    </Card>
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