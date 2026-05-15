export type Mode = "survival" | "score";
export type PlayerId = "p1" | "p2";
export type Cell = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const CELLS: Cell[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export type ThemeId = "numbers" | "fruits" | "cars" | "cities";

export const THEMES: Record<ThemeId, { label: string; emoji: string; items: string[] }> = {
  numbers: { label: "Numbers", emoji: "🔢", items: ["1","2","3","4","5","6","7","8","9"] },
  fruits:  { label: "Fruits",  emoji: "🍎", items: ["Apple","Banana","Mango","Grape","Orange","Pear","Kiwi","Peach","Plum"] },
  cars:    { label: "Cars",    emoji: "🚗", items: ["Tesla","BMW","Ford","Audi","Honda","Toyota","Kia","Mazda","Volvo"] },
  cities:  { label: "Cities",  emoji: "🏙️", items: ["NYC","Tokyo","Paris","London","Dubai","Mumbai","Rome","Sydney","Cairo"] },
};

export function labelFor(theme: ThemeId, cell: Cell): string {
  return THEMES[theme].items[cell - 1];
}

export type Player = { id: PlayerId; name: string; isBot: boolean };
export type EndReason = "collision" | "board_full" | "timeout";

export type GameState = {
  mode: Mode;
  theme: ThemeId;
  players: Record<PlayerId, Player>;
  board: Record<Cell, PlayerId | null>;
  // Cells that have been revealed to both players (always includes own picks; opponent picks only after collision/end)
  revealed: Record<Cell, boolean>;
  turn: PlayerId;
  status: "active" | "ended";
  winner: PlayerId | "draw" | null;
  endReason: EndReason | null;
  // transient: last collision info (for UI flash)
  lastCollision: { by: PlayerId; cell: Cell } | null;
};

export const TURN_SECONDS = 15;

function emptyBoard<T>(v: T): Record<Cell, T> {
  return { 1: v, 2: v, 3: v, 4: v, 5: v, 6: v, 7: v, 8: v, 9: v };
}

export function newGame(
  mode: Mode,
  theme: ThemeId,
  p1Name: string,
  p2: { name: string; isBot: boolean },
): GameState {
  return {
    mode,
    theme: mode === "score" ? "numbers" : theme,
    players: {
      p1: { id: "p1", name: p1Name, isBot: false },
      p2: { id: "p2", name: p2.name, isBot: p2.isBot },
    },
    board: emptyBoard<PlayerId | null>(null),
    revealed: emptyBoard(false),
    turn: "p1",
    status: "active",
    winner: null,
    endReason: null,
    lastCollision: null,
  };
}

export function availableCells(s: GameState): Cell[] {
  return CELLS.filter((c) => s.board[c] === null);
}

export function scoreOf(s: GameState, p: PlayerId): number {
  return CELLS.reduce((sum, c) => (s.board[c] === p ? sum + c : sum), 0);
}

function other(p: PlayerId): PlayerId {
  return p === "p1" ? "p2" : "p1";
}

function revealAll(): Record<Cell, boolean> {
  return emptyBoard(true);
}

export function pick(s: GameState, cell: Cell): GameState {
  if (s.status !== "active") return s;
  const current = s.turn;
  const owner = s.board[cell];

  // Collision: cell already taken
  if (owner !== null) {
    if (s.mode === "survival") {
      return {
        ...s,
        revealed: revealAll(),
        status: "ended",
        winner: other(current),
        endReason: "collision",
        lastCollision: { by: current, cell },
      };
    }
    // score mode: reveal that cell, lose turn, no points
    return {
      ...s,
      revealed: { ...s.revealed, [cell]: true },
      turn: other(current),
      lastCollision: { by: current, cell },
    };
  }

  // Valid pick: assign cell, reveal to picker only (handled at UI by checking owner === viewer)
  const board = { ...s.board, [cell]: current };
  const full = CELLS.every((c) => board[c] !== null);

  if (full) {
    if (s.mode === "score") {
      const next: GameState = {
        ...s,
        board,
        revealed: revealAll(),
        status: "ended",
        endReason: "board_full",
        winner: null,
        lastCollision: null,
      };
      const s1 = scoreOf(next, "p1");
      const s2 = scoreOf(next, "p2");
      next.winner = s1 === s2 ? "draw" : s1 > s2 ? "p1" : "p2";
      return next;
    }
    // survival board_full = draw
    return {
      ...s,
      board,
      revealed: revealAll(),
      status: "ended",
      winner: "draw",
      endReason: "board_full",
      lastCollision: null,
    };
  }

  return { ...s, board, turn: other(current), lastCollision: null };
}

export function timeout(s: GameState): GameState {
  if (s.status !== "active") return s;
  return {
    ...s,
    revealed: revealAll(),
    status: "ended",
    winner: other(s.turn),
    endReason: "timeout",
  };
}

export function botPick(s: GameState): Cell {
  // Bot only knows what it has picked + cells it has seen revealed (collisions).
  // It avoids its own picks and revealed cells, and otherwise picks randomly.
  const known = CELLS.filter((c) => s.board[c] === "p2" || s.revealed[c]);
  const candidates = CELLS.filter((c) => !known.includes(c));
  const pool = candidates.length > 0 ? candidates : availableCells(s);
  return pool[Math.floor(Math.random() * pool.length)];
}
