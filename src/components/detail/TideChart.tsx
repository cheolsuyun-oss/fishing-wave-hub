import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { buildTideCurve } from "@/lib/point-detail-data";

export interface TideEventProp {
  time: string;
  level: number;
}

export interface MoonInfoProp {
  phase: string;
  emoji: string;
  illumination: number;
}

interface TideChartProps {
  highs: TideEventProp[];
  lows: TideEventProp[];
  moon?: MoonInfoProp;
  isLoading?: boolean;
  isFallback?: boolean;
}

export default function TideChart({
  highs,
  lows,
  moon,
  isLoading = false,
  isFallback = false,
}: TideChartProps) {
  const curve = useMemo(
    () => buildTideCurve(highs, lows),
    [highs, lows],
  );
  const maxLevel = useMemo(
    () => (curve.length > 0 ? Math.max(...curve.map((p) => p.level)) : 0),
    [curve],
  );

  const [activeHour, setActiveHour] = useState<number>(12);

  const activePoint = curve.length > 0
    ? curve.reduce(
        (best, p) =>
          Math.abs(p.hour - activeHour) < Math.abs(best.hour - activeHour)
            ? p
            : best,
        curve[0],
      )
    : null;

  const hour = Math.floor(activeHour);
  const minute = Math.round((activeHour - hour) * 60);
  const isPM = hour >= 12;
  const displayHour = hour === 0 || hour === 12 ? 12 : hour % 12;
  const timeStr = `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const ampm = isPM ? "오후" : "오전";
  const heightM = activePoint ? (activePoint.level / 100).toFixed(1) : "-";

  const handleMove = (state: { activeLabel?: string | number }) => {
    if (state?.activeLabel !== undefined && state.activeLabel !== null) {
      const v = Number(state.activeLabel);
      if (!Number.isNaN(v)) setActiveHour(v);
    }
  };

  return (
    <Card className="p-4 bg-white shadow-md">
      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-bold">
            물때 / 조수
            {isFallback && (
              <span className="ml-1.5 text-[10px] font-normal text-amber-500">(예시)</span>
            )}
          </h2>
          <span className="text-[10px] text-muted-foreground">
            좌우로 슬라이드해서 시간 이동
          </span>
        </div>

        {isLoading ? (
          <div className="rounded-xl bg-muted/60 border border-border px-3 py-2.5 text-sm text-muted-foreground">
            조석 데이터 불러오는 중…
          </div>
        ) : (
          <div className="rounded-xl bg-muted/60 border border-border px-3 py-2.5 flex items-center gap-2 flex-wrap text-sm">
            <span className="font-bold text-foreground tabular-nums">
              {timeStr}
            </span>
            <span className="text-xs text-muted-foreground">{ampm}</span>
            <span className="font-bold text-primary text-base ml-1 tabular-nums">
              {heightM}m
            </span>
            {moon && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                {moon.illumination}% {moon.phase}
                <span className="text-base leading-none">{moon.emoji}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="h-60 w-full -mx-2 touch-pan-y select-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={curve}
            margin={{ top: 18, right: 12, left: -16, bottom: 0 }}
            onMouseMove={handleMove}
            onMouseDown={handleMove}
          >
            <defs>
              <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <ReferenceArea x1={0} x2={5.5} fill="var(--muted-foreground)" fillOpacity={0.14} ifOverflow="extendDomain" />
            <ReferenceArea x1={18.5} x2={24} fill="var(--muted-foreground)" fillOpacity={0.14} ifOverflow="extendDomain" />
            <ReferenceArea x1={5.5} x2={6.5} fill="hsl(45 95% 65%)" fillOpacity={0.3} />
            <ReferenceArea x1={17.5} x2={18.5} fill="hsl(30 90% 60%)" fillOpacity={0.3} />

            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 24]}
              ticks={[0, 6, 12, 18, 24]}
              tickFormatter={(h: number) => `${h}시`}
              tick={{ fontSize: 10 }}
              stroke="var(--muted-foreground)"
              allowDataOverflow
            />
            <YAxis tick={{ fontSize: 10 }} unit="cm" stroke="var(--muted-foreground)" width={48} />

            {maxLevel > 0 && (
              <ReferenceLine
                y={maxLevel}
                stroke="hsl(0 70% 55%)"
                strokeDasharray="5 4"
                strokeWidth={1.2}
                label={{
                  value: `Max ${maxLevel}cm`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "hsl(0 70% 45%)",
                }}
              />
            )}

            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeWidth: 2, strokeOpacity: 0.9 }}
              content={() => null}
              isAnimationActive={false}
            />

            <Area
              type="monotone"
              dataKey="level"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#tideFill)"
              isAnimationActive={false}
              activeDot={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
        <div className="rounded-lg bg-red-50 border border-red-100 p-2.5">
          <div className="font-semibold text-red-700 mb-1">만조</div>
          {isLoading && <div className="text-muted-foreground">…</div>}
          {!isLoading && highs.length === 0 && <div className="text-muted-foreground">-</div>}
          {highs.map((h) => (
            <div key={h.time} className="text-foreground">
              {h.time} <span className="text-muted-foreground">({h.level}cm)</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5">
          <div className="font-semibold text-blue-700 mb-1">간조</div>
          {isLoading && <div className="text-muted-foreground">…</div>}
          {!isLoading && lows.length === 0 && <div className="text-muted-foreground">-</div>}
          {lows.map((l) => (
            <div key={l.time} className="text-foreground">
              {l.time} <span className="text-muted-foreground">({l.level}cm)</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[hsl(45_95%_65%)]/40" />
          일출/일몰
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-muted-foreground/20" />
          야간
        </span>
      </div>
    </Card>
  );
}