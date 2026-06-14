import { useEffect, useState, useCallback } from "react";
import { POINTS, type FishingPoint } from "./points";
import {
  addCustomPoint,
  removeCustomPoint,
  useCustomPoints,
  getCustomPointsSync,
} from "./custom-points-store";

const STORAGE_KEY = "fishing.favorites.v1";
const MAX_FAVORITES = 3;
const DEFAULT_IDS = POINTS.map((p) => p.id);

type Listener = (ids: string[]) => void;
const listeners = new Set<Listener>();
let current: string[] | null = null;

function read(): string[] {
  if (typeof window === "undefined") return DEFAULT_IDS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_IDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_IDS;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return DEFAULT_IDS;
  }
}

function write(ids: string[]) {
  current = ids;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }
  listeners.forEach((l) => l(ids));
}

export function useFavoritePoints() {
  const [ids, setIds] = useState<string[]>(() => current ?? DEFAULT_IDS);
  const customs = useCustomPoints();

  useEffect(() => {
    if (current === null) current = read();
    setIds(current);
    const l: Listener = (next) => setIds(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const remove = useCallback((id: string) => {
    const next = (current ?? read()).filter((x) => x !== id);
    write(next);
    removeCustomPoint(id);
  }, []);

  const add = useCallback((id: string) => {
    const cur = current ?? read();
    if (cur.includes(id) || cur.length >= MAX_FAVORITES) return false;
    write([...cur, id]);
    return true;
  }, []);

  const addPoint = useCallback((point: FishingPoint) => {
    const cur = current ?? read();
    if (cur.length >= MAX_FAVORITES) return false;
    addCustomPoint(point);
    if (!cur.includes(point.id)) write([...cur, point.id]);
    return true;
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    const cur = current ?? read();
    const from = cur.indexOf(fromId);
    const to = cur.indexOf(toId);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...cur];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    write(next);
  }, []);

  const all: FishingPoint[] = [...POINTS, ...customs];
  const points: FishingPoint[] = ids
    .map((id) => all.find((p) => p.id === id))
    .filter((p): p is FishingPoint => Boolean(p));

  return {
    ids,
    points,
    remove,
    add,
    addPoint,
    reorder,
    isFull: ids.length >= MAX_FAVORITES,
    max: MAX_FAVORITES,
  };
}

export function getAllPointsSync(): FishingPoint[] {
  return [...POINTS, ...getCustomPointsSync()];
}