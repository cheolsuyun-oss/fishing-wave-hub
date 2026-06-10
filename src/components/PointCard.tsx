import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wind, Waves, Moon, ChevronRight, X } from "lucide-react";
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

const DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
function degToCompass(deg: number) {
  return DIRS[Math.round(deg / 22.5) % 16];
}

export function PointCard({
  point,
  onRemove,
}: {
  point: FishingPoint;
  onRemove?: (id: string) => void;
}) {
  const fetchFcst = useServerFn(getVillageForecast);
  const { data: fcst } = useQuery({
    queryKey: ["fcst", point.nx, point.ny],
    queryFn: () => fetchFcst({ data: { nx: point.nx, ny: point.ny } }),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const wsd = fcst?.wsd ?? point.windSpeed;
  const wav = fcst?.wav ?? point.waveHeight;
  const riskLevel = (wsd > 14 || wav > 3.0) ? "danger" : (wsd > 7 || wav > 1.5) ? "caution" : "safe";
  const risk = RISK_META[riskLevel];

  const windText = fcst?.wsd != null
    ? `${fcst?.vec != null ? degToCompass(fcst.vec) + " " : ""}${fcst.wsd}m/s`
    : `${point.windSpeed}m/s`;
  const waveText = fcst?.wav != null ? `${fcst.wav}m` : `${point.waveHeight}m`;

  return (
    <div className="relative">
      <Link
        to="/points/$id"
        params={{ id: point.id }}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
      >
        <Card className="p-4 bg-white shadow-md hover:shadow-lg transition-shadow active:scale-[0.99]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-foreground pr-6">
                {point.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {point.region}
              </p>
            </div>
            <Badge
              variant="outline"
              className={`${risk.className} font-semibold px-2.5 py-0.5 mr-7 whitespace-nowrap`}
            >
              {risk.label}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric icon={<Wind className="w-4 h-4" />} label="풍속" value={windText} />
            <Metric icon={<Waves className="w-4 h-4" />} label="파고" value={waveText} />
            <Metric icon={<Moon className="w-4 h-4" />} label="물때" value={point.tide} />
          </div>

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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-muted border border-border py-2.5 px-1">
      <div className="flex items-center justify-center text-primary mb-1">
        {icon}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
