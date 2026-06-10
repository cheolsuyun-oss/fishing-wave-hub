import { useEffect, useState } from "react";
import type { FishingPoint } from "./points";

const STORAGE_KEY = "fishing.custom-points.v1";

type Listener = (pts: FishingPoint[]) => void;
const listeners = new Set<Listener>();
let cache: FishingPoint[] | null = null;

function read(): FishingPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(pts: FishingPoint[]) {
  cache = pts;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pts));
  }
  listeners.forEach((l) => l(pts));
}

export function getCustomPointsSync(): FishingPoint[] {
  if (cache === null) cache = read();
  return cache;
}

export function addCustomPoint(point: FishingPoint) {
  const cur = getCustomPointsSync();
  write([...cur.filter((p) => p.id !== point.id), point]);
}

export function removeCustomPoint(id: string) {
  write(getCustomPointsSync().filter((p) => p.id !== id));
}

export function useCustomPoints() {
  const [pts, setPts] = useState<FishingPoint[]>(() => cache ?? []);
  useEffect(() => {
    if (cache === null) cache = read();
    setPts(cache);
    const l: Listener = (next) => setPts(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return pts;
}
