import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, Search, MapPin, LocateFixed, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { loadKakaoMaps } from "@/lib/kakao-loader";
import { useFavoritePoints } from "@/lib/favorites-store";
import {
  haversine,
  latLngToGrid,
  nearestTideStation,
  inferSea,
} from "@/lib/geo";
import type { FishingPoint } from "@/lib/points";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

type Pick = { lat: number; lng: number; label?: string };
type KakaoPlace = {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name?: string;
  x: string;
  y: string;
};

function SearchPage() {
  const navigate = useNavigate();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const kakaoRef = useRef<any>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);

  const [picked, setPicked] = useState<Pick | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [alias, setAlias] = useState("");
  const [memo, setMemo] = useState("");
  const [limitOpen, setLimitOpen] = useState(false);
  const [nearOpen, setNearOpen] = useState(false);

  const { points, addPoint, isFull, max } = useFavoritePoints();

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !mapEl.current) return;
        kakaoRef.current = kakao;
        const center = new kakao.maps.LatLng(36.5, 127.8);
        const map = new kakao.maps.Map(mapEl.current, {
          center,
          level: 13,
        });
        mapRef.current = map;
        setReady(true);

        kakao.maps.event.addListener(map, "rightclick", (e: any) => {
          const ll = e?.latLng;
          if (!ll) return;
          const lat = ll.getLat();
          const lng = ll.getLng();
          placeMarker(lat, lng);
          setPicked({ lat, lng });
        });

        const el = mapEl.current;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let startX = 0;
        let startY = 0;
        const clear = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        };
        const onTouchStart = (ev: TouchEvent) => {
          if (ev.touches.length !== 1) return clear();
          const t = ev.touches[0];
          startX = t.clientX;
          startY = t.clientY;
          clear();
          timer = setTimeout(() => {
            const rect = el?.getBoundingClientRect();
            if (!rect || !mapRef.current) return;
            const x = startX - rect.left;
            const y = startY - rect.top;
            const point = new kakao.maps.Point(x, y);
            const projection = mapRef.current.getProjection();
            const ll = projection.coordsFromContainerPoint(point);
            const lat = ll.getLat();
            const lng = ll.getLng();
            placeMarker(lat, lng);
            setPicked({ lat, lng });
          }, 550);
        };
        const onTouchMove = (ev: TouchEvent) => {
          if (ev.touches.length !== 1) return clear();
          const t = ev.touches[0];
          if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
            clear();
          }
        };
        el?.addEventListener("touchstart", onTouchStart, { passive: true });
        el?.addEventListener("touchmove", onTouchMove, { passive: true });
        el?.addEventListener("touchend", clear);
        el?.addEventListener("touchcancel", clear);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(err?.message ?? "지도를 불러오지 못했습니다");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const placeMarker = useCallback((lat: number, lng: number) => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map) return;
    const pos = new kakao.maps.LatLng(lat, lng);
    if (markerRef.current) {
      markerRef.current.setPosition(pos);
    } else {
      markerRef.current = new kakao.maps.Marker({ position: pos });
      markerRef.current.setMap(map);
    }
    map.panTo(pos);
  }, []);

  const runSearch = useCallback(() => {
    const kakao = kakaoRef.current;
    console.log("runSearch called", { kakao: !!kakao, query });
    if (!kakao || !query.trim()) return;
    const ps = new kakao.maps.services.Places();
    setSearching(true);
    ps.keywordSearch(query.trim(), (data: KakaoPlace[], status: string) => {
      console.log("search result", { status, dataLength: data?.length });
      setSearching(false);
      if (status === kakao.maps.services.Status.OK) {
        setResults(data);
        setResultsOpen(true);
      } else {
        setResults([]);
        setResultsOpen(true);
      }
    });
  }, [query]);

  const onPickResult = (p: KakaoPlace) => {
    const lat = Number(p.y);
    const lng = Number(p.x);
    placeMarker(lat, lng);
    setPicked({ lat, lng, label: p.place_name });
    setResultsOpen(false);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("이 기기에서는 위치를 사용할 수 없습니다");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        placeMarker(latitude, longitude);
        setPicked({ lat: latitude, lng: longitude, label: "현재 위치" });
      },
      (err) => {
        toast.error(`위치를 가져오지 못했습니다: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const openSave = () => {
    if (!picked) return;
    const near = points.find(
      (p) => haversine(p.lat, p.lng, picked.lat, picked.lng) < 100,
    );
    if (near) {
      setNearOpen(true);
      return;
    }
    if (isFull) {
      setLimitOpen(true);
      return;
    }
    setAlias(picked.label ?? "");
    setMemo("");
    setSaveOpen(true);
  };

  const handleSave = () => {
    if (!picked) return;
    const trimmed = alias.trim();
    if (!trimmed) {
      toast.error("별칭을 입력해주세요");
      return;
    }
    if (isFull) {
      setSaveOpen(false);
      setLimitOpen(true);
      return;
    }
    const { nx, ny } = latLngToGrid(picked.lat, picked.lng);
    const station = nearestTideStation(picked.lat, picked.lng);
    const sea = inferSea(picked.lat, picked.lng);
    const point: FishingPoint = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      memo: memo.trim() || undefined,
      sea,
      risk: "safe",
      windSpeed: 0,
      waveHeight: 0,
      tide: "-",
      nx,
      ny,
      tideStationCode: station.code,
      lat: picked.lat,
      lng: picked.lng,
    };
    const ok = addPoint(point);
    if (!ok) {
      setSaveOpen(false);
      setLimitOpen(true);
      return;
    }
    setSaveOpen(false);
    toast.success("저장되었습니다");
    navigate({ to: "/" });
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-border bg-background z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            aria-label="뒤로가기"
            className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="장소명을 입력하세요"
              className="pl-9 h-10"
            />
          </div>
          <Button
            type="button"
            onClick={runSearch}
            disabled={!ready || searching || !query.trim()}
            className="h-10"
          >
            검색
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
          지도를 길게 누르면 해당 위치에 핀이 생성됩니다
        </p>
      </div>

      <div className="relative flex-1">
        <div ref={mapEl} className="absolute inset-0 bg-muted" />
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-background/90 text-center">
            <div>
              <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">지도를 불러오지 못했습니다</p>
              <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
            </div>
          </div>
        )}
        {!ready && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <p className="text-sm text-muted-foreground">지도 불러오는 중…</p>
          </div>
        )}

        {resultsOpen && (
          <div className="absolute left-2 right-2 bottom-2 max-h-[45%] rounded-xl bg-background border border-border shadow-xl flex flex-col overflow-hidden z-50">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-foreground">
                검색 결과 {results.length}건
              </span>
              <button
                type="button"
                onClick={() => setResultsOpen(false)}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto">
              {results.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">
                  결과가 없습니다
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onPickResult(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/50 active:bg-muted"
                      >
                        <div className="text-sm font-medium text-foreground truncate">
                          {p.place_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {p.road_address_name || p.address_name}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background p-3 space-y-2">
        {picked && !resultsOpen && (
          <div className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
            <div className="font-semibold truncate">
              {picked.label ?? "선택된 위치"}
            </div>
            <div className="text-muted-foreground">
              {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
            </div>
          </div>
        )}
        {picked ? (
          <Button type="button" onClick={openSave} className="w-full h-12">
            이 위치를 포인트로 저장
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={useCurrentLocation}
            disabled={!ready}
            className="w-full h-12"
          >
            <LocateFixed className="w-4 h-4" />
            현재 위치로 등록
          </Button>
        )}
      </div>

      <Sheet open={saveOpen} onOpenChange={setSaveOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>포인트 저장</SheetTitle>
            <SheetDescription>
              {picked
                ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`
                : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="alias">
                별칭 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="예: 대광어 출몰지"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memo">메모 (선택)</Label>
              <Textarea
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="날씨, 채비, 기록 등"
                rows={3}
                maxLength={200}
              />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveOpen(false)}
              className="flex-1"
            >
              취소
            </Button>
            <Button type="button" onClick={handleSave} className="flex-1">
              저장
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={limitOpen} onOpenChange={setLimitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>즐겨찾기가 가득 찼습니다</AlertDialogTitle>
            <AlertDialogDescription>
              즐겨찾기 최대 개수({max}개)에 도달했습니다.
              기존 포인트를 삭제 후 추가해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLimitOpen(false)}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={nearOpen} onOpenChange={setNearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이미 등록된 포인트 근처입니다</AlertDialogTitle>
            <AlertDialogDescription>
              반경 100m 이내에 이미 즐겨찾기한 포인트가 있습니다.
              계속 진행하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setNearOpen(false);
                if (isFull) {
                  setLimitOpen(true);
                  return;
                }
                setAlias(picked?.label ?? "");
                setMemo("");
                setSaveOpen(true);
              }}
            >
              계속 저장
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}