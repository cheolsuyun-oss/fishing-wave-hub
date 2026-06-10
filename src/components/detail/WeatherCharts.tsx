import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
  Area,
} from "recharts";
import { Card } from "@/components/ui/card";
import { getPointDetail, waveColor } from "@/lib/point-detail-data";
import WindChart from "./WindChart";

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
};

export default function WeatherCharts({ pointId }: { pointId: string }) {
  const detail = getPointDetail(pointId);

  // Merge rain + temp into a single dataset by hour
  const combo = detail.rain.map((r, i) => ({
    hour: r.hour,
    label: `${r.hour}시`,
    rain: r.value,
    temp: detail.temp[i]?.value ?? 0,
  }));

  const waveData = detail.wave.map((w) => ({
    hour: w.hour,
    label: `${w.hour}시`,
    wave: w.value,
  }));

  return (
    <div className="space-y-4">
      <WindChart pointId={pointId} />

      <Card className="p-4 bg-white shadow-md">
        <h2 className="text-sm font-bold mb-1">파고 예보</h2>
        <p className="text-[11px] text-muted-foreground mb-2">
          초록 ≤0.5m · 노랑 ≤1.5m · 빨강 &gt;1.5m
        </p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={waveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit="m" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}m`, "파고"]} />
              <Line
                type="monotone"
                dataKey="wave"
                stroke="var(--primary)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props) => {
                  const { cx, cy, payload, index } = props as {
                    cx: number;
                    cy: number;
                    payload: { wave: number };
                    index: number;
                  };
                  return (
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={waveColor(payload.wave)}
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 bg-white shadow-md">
        <h2 className="text-sm font-bold mb-2">강수확률 / 기온</h2>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={combo} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="%" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="°" />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="rain"
                fill="hsl(217 80% 50% / 0.2)"
                stroke="hsl(217 80% 50%)"
                name="강수확률"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="temp"
                stroke="hsl(20 90% 55%)"
                strokeWidth={2}
                name="기온"
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
