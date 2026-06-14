import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Fish, User } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertBanner } from "@/components/AlertBanner";
import { PointCard } from "@/components/PointCard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFavoritePoints } from "@/lib/favorites-store";
import { getWeatherWarning } from "@/lib/kma.functions";
import { getVillageForecast } from "@/lib/forecast.functions";
import { formatFcstBasis } from "@/lib/geo";
import { getMulddae } from "@/lib/moonAge";
import { supabase } from "@/lib/supabase";
import type { FishingPoint } from "@/lib/points";
import appIcon from "@/assets/app-icon.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "낚시와바다 - 한국 낚시 포인트 실시간 기상정보" },
      {
        name: "description",
        content:
          "거제, 통영, 여수 등 한국 주요 낚시 포인트의 실시간 풍속, 파고, 물때 정보를 한눈에 확인하세요.",
      },
    ],
  }),
  component: Home,
});

function SortablePointCard({
  point,
  onRemove,
}: {
  point: FishingPoint;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: point.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    scale: isDragging ? "1.03" : "1",
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`transition-shadow transition-transform duration-200 ${isDragging ? "opacity-95" : ""}`}
    >
      <PointCard point={point} onRemove={onRemove} />
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const { points, remove, reorder, isFull, max } = useFavoritePoints();
  const [limitOpen, setLimitOpen] = useState(false);

  // 매직링크 클릭 후 URL 해시에서 세션 토큰 처리
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          // 해시 제거
          window.history.replaceState(null, "", window.location.pathname);
        }
      });
    }
    if (hash && hash.includes("error=access_denied")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorder(String(active.id), String(over.id));
    }
  };

  const { data: warning, isLoading, isError } = useQuery({
    queryKey: ["kma-warning"],
    queryFn: () => getWeatherWarning(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const firstPoint = points[0];
  const { data: fcst } = useQuery({
    queryKey: ["fcst", firstPoint?.nx, firstPoint?.ny],
    queryFn: () => getVillageForecast({ nx: firstPoint!.nx, ny: firstPoint!.ny }),
    enabled: !!firstPoint,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const fcstBasis = formatFcstBasis(fcst?.fcstDate, fcst?.fcstTime);
  const mulddae = getMulddae();

  const handleAdd = () => {
    if (isFull) {
      setLimitOpen(true);
    } else {
      navigate({ to: "/search" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-md px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary">
              <img src={appIcon} alt="낚시와바다" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">낚시와바다</p>
              <p className="text-[10px] text-muted-foreground">The Fisher and the Sea</p>
            </div>
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/fishing-log" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Fish className="w-4 h-4" />
              낚시기록
            </Link>
            <Link to="/mypage" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <User className="w-4 h-4" />
              마이페이지
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pt-6 pb-12">
        {isLoading ? (
          <div className="rounded-xl bg-muted animate-pulse h-12 w-full" />
        ) : !isError && warning?.hasWarning && warning.message ? (
          <AlertBanner message={warning.message} />
        ) : null}

        <section className="mt-6">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-sm font-bold text-foreground">즐겨찾기 포인트</h2>
            <span className="text-xs text-muted-foreground">{points.length}/{max}곳</span>
          </div>
          {(fcstBasis || mulddae) && (
            <p className="text-[11px] text-muted-foreground/70 mb-2">
              {fcstBasis}
              {fcstBasis && mulddae && " · "}
              {mulddae && `${mulddae}`}
            </p>
          )}

          {points.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              아직 추가된 포인트가 없어요.<br />신규 포인트를 추가해보세요 🎣
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={points.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {points.map((p) => (
                    <SortablePointCard key={p.id} point={p} onRemove={remove} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {!isFull && (
            <Button
              type="button"
              variant="outline"
              onClick={handleAdd}
              className="mt-3 w-full h-12 border-dashed"
            >
              <Plus className="w-4 h-4" />
              포인트 추가
            </Button>
          )}
        </section>
      </div>

      <AlertDialog open={limitOpen} onOpenChange={setLimitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>즐겨찾기가 가득 찼습니다</AlertDialogTitle>
            <AlertDialogDescription>
              즐겨찾기 최대 개수({max}개)에 도달했습니다.
              교체를 원하시면 기존 포인트를 먼저 삭제해 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLimitOpen(false)}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}