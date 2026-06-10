import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus } from "lucide-react";
import { AlertBanner } from "@/components/AlertBanner";
import { BottomNav } from "@/components/BottomNav";
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

function Home() {
  const navigate = useNavigate();
  const { points, remove, isFull, max } = useFavoritePoints();
  const [limitOpen, setLimitOpen] = useState(false);

  const fetchWarning = useServerFn(getWeatherWarning);
  const { data: warning, isLoading, isError } = useQuery({
    queryKey: ["kma-warning"],
    queryFn: () => fetchWarning(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleAdd = () => {
    if (isFull) {
      setLimitOpen(true);
    } else {
      navigate({ to: "/search" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="mx-auto max-w-md px-4 pt-6 pb-12">
        <header className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-primary">
            <img src={appIcon} alt="낚시와바다" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">
              낚시와바다
            </h1>
            <p className="text-xs text-muted-foreground">The Fisher and the Sea</p>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-xl bg-muted animate-pulse h-12 w-full" />
        ) : !isError && warning?.hasWarning && warning.message ? (
          <AlertBanner message={warning.message} />
        ) : null}

        <section className="mt-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground">
              즐겨찾기 포인트
            </h2>
            <span className="text-xs text-muted-foreground">
              {points.length}/{max}곳
            </span>
          </div>

          <div className="space-y-3">
            {points.map((p) => (
              <PointCard key={p.id} point={p} onRemove={remove} />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleAdd}
            className="mt-3 w-full h-12 border-dashed"
          >
            <Plus className="w-4 h-4" />
            포인트 추가
          </Button>
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

      <BottomNav />
    </div>
  );
}