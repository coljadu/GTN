import { CELLS, type Cell } from "./game";

export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVELS: Level[] = [1, 2, 3, 4, 5];

export const LEVEL_REVEAL_SECONDS: Record<Level, number> = {
  1: 6,
  2: 4.5,
  3: 3,
  4: 2,
  5: 1.2,
};

export const MAX_STRIKES = 3;

export type MemoryStatus = "memorize" | "hunt" | "won" | "lost";

export type LastResult =
  | { kind: "correct"; cell: Cell; number: number }
  | { kind: "wrong"; cell: Cell; number: number }
  | null;

export type MemoryState = {
  level: Level;
  layout: Record<Cell, number>;
  found: Record<Cell, boolean>;
  queue: number[]; // remaining numbers to find, front = current prompt
  strikes: number;
  status: MemoryStatus;
  lastResult: LastResult;
};

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newMemoryGame(level: Level): MemoryState {
  const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const layout = Object.fromEntries(CELLS.map((c, i) => [c, numbers[i]])) as Record<Cell, number>;
  return {
    level,
    layout,
    found: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false },
    queue: shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    strikes: 0,
    status: "memorize",
    lastResult: null,
  };
}

export function startHunt(s: MemoryState): MemoryState {
  return { ...s, status: "hunt" };
}

export function tapCell(s: MemoryState, cell: Cell): MemoryState {
  if (s.status !== "hunt") return s;
  if (s.found[cell]) return s;
  if (s.lastResult !== null) return s; // input disabled during feedback
  const target = s.queue[0];

  if (s.layout[cell] === target) {
    const found = { ...s.found, [cell]: true };
    const queue = s.queue.slice(1);
    const status: MemoryStatus = queue.length === 0 ? "won" : "hunt";
    return {
      ...s,
      found,
      queue,
      status,
      lastResult: { kind: "correct", cell, number: target },
    };
  }

  // wrong: rotate target to back of queue, increment strikes
  const queue = [...s.queue.slice(1), target];
  const strikes = s.strikes + 1;
  const status: MemoryStatus = strikes >= MAX_STRIKES ? "lost" : "hunt";
  return {
    ...s,
    queue,
    strikes,
    status,
    lastResult: { kind: "wrong", cell, number: target },
  };
}

export function clearLastResult(s: MemoryState): MemoryState {
  return { ...s, lastResult: null };
}

const BEST_KEY = "nd_memory_best";

export function bestLevel(): Level | 0 {
  const v = parseInt(localStorage.getItem(BEST_KEY) || "0", 10);
  return (v >= 1 && v <= 5 ? (v as Level) : 0);
}

export function saveBestLevel(level: Level): void {
  if (level > bestLevel()) localStorage.setItem(BEST_KEY, String(level));
}

export function stars(strikes: number): 0 | 1 | 2 | 3 {
  if (strikes >= 3) return 0;
  return (3 - strikes) as 1 | 2 | 3;
}
