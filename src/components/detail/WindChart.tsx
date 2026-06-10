import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
} from "recharts";
import { Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getPointDetail, windColor, type WindHour } from "@/lib/point-detail-data";

type Range = 1 | 3 | 5;

interface ChartPoint {
  t: number; // hour offset from start
  hourOfDay: number;
  dayIdx: number;
  speed: number; // m/s
  speedKmh: number;
  gust: number; // m/s
  gustKmh: number;
  dir: number;
  dirLabel: string;
  label: string;
}

function buildData(base: WindHour[], days: Range): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let d = 0; d < days; d += 1) {
    base.forEach((w, i) => {
      // Mild day-over-day variation so 3d/5d feels different
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

export default function WindChart({ pointId }: { pointId: string }) {
  const [range, setRange] = useState<Range>(1);
  const detail = getPointDetail(pointId);
  const data = useMemo(() => buildData(detail.wind, range), [detail.wind, range]);
  const current = data[0];

  const nightBands = useMemo(() => {
    const bands: { x1: number; x2: number }[] = [];
    for (let d = 0; d < range; d += 1) {
      bands.push({ x1: d * 24, x2: d * 24 + 6 });
      bands.push({ x1: d * 24 + 19, x2: d * 24 + 24 });
    }
    return bands;
  }, [range]);

  const arrowEvery = range === 1 ? 1 : range === 3 ? 2 : 3;

  return (
    <Card className="p-4 bg-white shadow-md overflow-hidden">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold mb-2">바람</h2>
          <div className="flex items-end gap-2 flex-wrap">
            <span className="text-3xl font-bold text-foreground leading-none">
              {current.speedKmh}
            </span>
            <span className="text-sm text-muted-foreground pb-1">km/h</span>
            <span
              className="inline-flex items-center gap-1 text-sm font-semibold pb-1"
              style={{ color: windColor(current.speed) }}
            >
              <Navigation
                className="w-4 h-4"
                style={{ transform: `rotate(${current.dir + 180}deg)` }}
                fill="currentColor"
              />
              {current.dirLabel}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            돌풍{" "}
            <span className="font-semibold text-foreground">{current.gustKmh} km/h</span>
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

      <div className="h-56 w-full -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 28, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            {nightBands.map((b, i) => (
              <ReferenceArea
                key={i}
                x1={b.x1}
                x2={b.x2}
                fill="hsl(220 30% 50%)"
                fillOpacity={0.08}
                stroke="none"
              />
            ))}
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
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
                padding: "8px 10px",
              }}
              labelFormatter={(t: number) => {
                const p = data.find((d) => d.t === t);
                if (!p) return "";
                return range === 1
                  ? `${String(p.hourOfDay).padStart(2, "0")}:00`
                  : `D${p.dayIdx + 1} ${String(p.hourOfDay).padStart(2, "0")}:00`;
              }}
              formatter={(_v: number, _n, item) => {
                const p = item.payload as ChartPoint;
                return [`${p.speed} m/s · ${p.dirLabel}`, "풍속"];
              }}
            />
            <Line
              type="monotone"
              dataKey="speed"
              stroke="var(--primary)"
              strokeWidth={2.5}
              isAnimationActive={false}
              activeDot={{ r: 5, fill: "var(--primary)" }}
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
        <span className="ml-auto flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[hsl(220_30%_50%)]/10 border border-border" />
          야간
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
