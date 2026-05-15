import { useEffect, useRef, useState } from "react";
import {
  CELLS,
  type Cell,
  type GameState,
  type Mode,
  type PlayerId,
  type ThemeId,
  THEMES,
  TURN_SECONDS,
  botPick,
  labelFor,
  newGame,
  pick,
  scoreOf,
  timeout,
} from "./game";

type Screen = "home" | "intermission" | "game" | "result";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("survival");
  const [theme, setTheme] = useState<ThemeId>("numbers");
  const [vsBot, setVsBot] = useState(true);
  const [game, setGame] = useState<GameState | null>(null);

  function start() {
    const opp = vsBot
      ? { name: "Bot", isBot: true }
      : { name: "Player 2", isBot: false };
    const g = newGame(mode, theme, "Player 1", opp);
    setGame(g);
    setScreen(vsBot ? "game" : "intermission");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {screen === "home" && (
        <Home
          mode={mode}
          setMode={setMode}
          theme={theme}
          setTheme={setTheme}
          vsBot={vsBot}
          setVsBot={setVsBot}
          onStart={start}
        />
      )}
      {screen === "intermission" && game && (
        <Intermission
          playerName={game.players[game.turn].name}
          onReady={() => setScreen("game")}
        />
      )}
      {screen === "game" && game && (
        <Game
          state={game}
          setState={setGame}
          onTurnEnd={(g) => {
            setGame(g);
            setScreen("intermission");
          }}
          onEnd={(g) => {
            setGame(g);
            setScreen("result");
          }}
          onQuit={() => setScreen("home")}
          isHotSeat={!vsBot}
        />
      )}
      {screen === "result" && game && (
        <Result
          game={game}
          onRematch={start}
          onHome={() => setScreen("home")}
        />
      )}
    </div>
  );
}

function Home(props: {
  mode: Mode;
  setMode: (m: Mode) => void;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  vsBot: boolean;
  setVsBot: (v: boolean) => void;
  onStart: () => void;
}) {
  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-xl">
      <h1 className="text-3xl font-bold text-center mb-2">Number Duel</h1>
      <p className="text-slate-400 text-center mb-8 text-sm">
        Pick a cell. Don't pick what your opponent secretly picked.
      </p>

      <Section label="Mode">
        <div className="grid grid-cols-2 gap-2">
          <OptionBtn active={props.mode === "survival"} onClick={() => props.setMode("survival")} title="Survival" sub="Collide = lose" />
          <OptionBtn active={props.mode === "score"} onClick={() => props.setMode("score")} title="Score" sub="Highest sum wins" />
        </div>
      </Section>

      {props.mode === "survival" && (
        <Section label="Theme">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(THEMES) as ThemeId[]).map((id) => (
              <OptionBtn
                key={id}
                active={props.theme === id}
                onClick={() => props.setTheme(id)}
                title={`${THEMES[id].emoji} ${THEMES[id].label}`}
                sub={THEMES[id].items.slice(0, 2).join(", ") + "..."}
              />
            ))}
          </div>
        </Section>
      )}

      <Section label="Opponent">
        <div className="grid grid-cols-2 gap-2">
          <OptionBtn active={props.vsBot} onClick={() => props.setVsBot(true)} title="Computer" sub="Random bot" />
          <OptionBtn active={!props.vsBot} onClick={() => props.setVsBot(false)} title="Find Player" sub="Local 2-player" />
        </div>
      </Section>

      <button
        onClick={props.onStart}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 rounded-xl transition mt-2"
      >
        Start Game
      </button>
    </div>
  );
}

function Section(p: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-sm text-slate-300 mb-2">{p.label}</div>
      {p.children}
    </div>
  );
}

function OptionBtn(p: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={p.onClick}
      className={`p-3 rounded-xl border-2 text-left transition ${
        p.active ? "border-emerald-400 bg-emerald-500/10" : "border-slate-700 hover:border-slate-600"
      }`}
    >
      <div className="font-semibold text-sm">{p.title}</div>
      <div className="text-xs text-slate-400 truncate">{p.sub}</div>
    </button>
  );
}

function Intermission(p: { playerName: string; onReady: () => void }) {
  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-10 text-center shadow-xl">
      <div className="text-sm text-slate-400 mb-2">Pass the device to</div>
      <h1 className="text-4xl font-bold mb-8">{p.playerName}</h1>
      <button
        onClick={p.onReady}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 rounded-xl transition"
      >
        I'm Ready
      </button>
    </div>
  );
}

const COLLISION_END_DELAY = 2800;
const COLLISION_TURN_DELAY = 1800;

function Game(props: {
  state: GameState;
  setState: (g: GameState) => void;
  onTurnEnd: (g: GameState) => void;
  onEnd: (g: GameState) => void;
  onQuit: () => void;
  isHotSeat: boolean;
}) {
  const { state, setState } = props;
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  const stateRef = useRef(state);
  stateRef.current = state;
  const prevTurnRef = useRef(state.turn);
  const [frozen, setFrozen] = useState(false); // pauses bot/timer while collision banner is showing

  // turn timer
  useEffect(() => {
    if (state.status !== "active" || frozen) return;
    setSecondsLeft(TURN_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          setState(timeout(stateRef.current));
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.turn, state.status, frozen]);

  // bot move
  useEffect(() => {
    if (state.status !== "active" || frozen) return;
    const current = state.players[state.turn];
    if (!current.isBot) return;
    const delay = 700 + Math.random() * 800;
    const id = setTimeout(() => {
      const cell = botPick(stateRef.current);
      setState(pick(stateRef.current, cell));
    }, delay);
    return () => clearTimeout(id);
  }, [state.turn, state.status, frozen]);

  // detect collision and pause for banner
  const collisionKey = state.lastCollision
    ? `${state.lastCollision.by}-${state.lastCollision.cell}`
    : null;
  useEffect(() => {
    if (!collisionKey) return;
    setFrozen(true);
    const t = setTimeout(() => setFrozen(false), COLLISION_TURN_DELAY);
    return () => clearTimeout(t);
  }, [collisionKey]);

  // schedule end transition (delayed when collision so users see what happened)
  useEffect(() => {
    if (state.status !== "ended") return;
    const delay = state.endReason === "collision" ? COLLISION_END_DELAY : 700;
    const id = setTimeout(() => props.onEnd(stateRef.current), delay);
    return () => clearTimeout(id);
  }, [state.status, state.endReason]);

  // schedule hot-seat intermission on turn flip
  useEffect(() => {
    const turnChanged = prevTurnRef.current !== state.turn;
    prevTurnRef.current = state.turn;
    if (!turnChanged || state.status !== "active" || !props.isHotSeat) return;
    // if turn flipped due to collision, hold the screen so the player sees the banner
    const delay = state.lastCollision ? COLLISION_TURN_DELAY : 200;
    const id = setTimeout(() => props.onTurnEnd(stateRef.current), delay);
    return () => clearTimeout(id);
  }, [state.turn]);

  function handleTap(c: Cell) {
    if (state.status !== "active" || frozen) return;
    if (state.players[state.turn].isBot) return;
    setState(pick(state, c));
  }

  const viewer: PlayerId = state.players[state.turn].isBot ? "p1" : state.turn;
  const current = state.players[state.turn];
  const timerPct = (secondsLeft / TURN_SECONDS) * 100;

  // score-mode "Leading / Trailing / Tied" — hide opponent's exact score
  let oppStatus: "Leading" | "Trailing" | "Tied" | undefined;
  if (state.mode === "score") {
    const opp: PlayerId = viewer === "p1" ? "p2" : "p1";
    const me = scoreOf(state, viewer);
    const them = scoreOf(state, opp);
    oppStatus = them > me ? "Leading" : them < me ? "Trailing" : "Tied";
  }

  const collidingCell = state.lastCollision?.cell ?? null;
  const collisionVisible = !!state.lastCollision && (frozen || state.status === "ended");

  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <PlayerBadge
          player={state.players.p1}
          active={state.turn === "p1" && state.status === "active"}
          score={state.mode === "score" && viewer === "p1" ? scoreOf(state, "p1") : undefined}
          oppStatus={state.mode === "score" && viewer !== "p1" ? oppStatus : undefined}
          color="emerald"
        />
        <div className="text-slate-500 text-xs uppercase tracking-wider">vs</div>
        <PlayerBadge
          player={state.players.p2}
          active={state.turn === "p2" && state.status === "active"}
          score={state.mode === "score" && viewer === "p2" ? scoreOf(state, "p2") : undefined}
          oppStatus={state.mode === "score" && viewer !== "p2" ? oppStatus : undefined}
          color="rose"
        />
      </div>

      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full transition-all duration-1000 linear ${
            secondsLeft <= 5 ? "bg-rose-500" : "bg-emerald-400"
          }`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      <div className="text-center text-sm mb-4 h-6">
        {collisionVisible && state.lastCollision ? (
          <CollisionBanner state={state} />
        ) : state.status === "active" ? (
          <span className="text-slate-300">{current.name}'s turn — {secondsLeft}s</span>
        ) : (
          <span className="text-slate-300">Game over</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {CELLS.map((c) => {
          const owner = state.board[c];
          const isMine = owner === viewer;
          const isRevealed = state.revealed[c];
          const showColored = isMine || isRevealed;
          const ownerColor = owner === "p1" ? "emerald" : owner === "p2" ? "rose" : null;

          let cls = "bg-slate-700 hover:bg-slate-600 border-2 border-transparent";
          if (showColored && ownerColor === "emerald") {
            cls = "bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200";
          } else if (showColored && ownerColor === "rose") {
            cls = "bg-rose-500/20 border-2 border-rose-400 text-rose-200";
          }

          const isColliding = c === collidingCell && collisionVisible;

          return (
            <button
              key={c}
              onClick={() => handleTap(c)}
              className={`aspect-square rounded-xl text-lg font-bold transition flex items-center justify-center text-center px-1 ${cls} ${
                isColliding ? "collision-shake" : ""
              }`}
            >
              {labelFor(state.theme, c)}
            </button>
          );
        })}
      </div>

      <button onClick={props.onQuit} className="w-full text-slate-400 hover:text-slate-200 text-sm py-2">
        Quit
      </button>
    </div>
  );
}

function CollisionBanner({ state }: { state: GameState }) {
  const c = state.lastCollision!;
  const picker = state.players[c.by].name;
  const ownerId = state.board[c.cell] as PlayerId;
  const owner = state.players[ownerId].name;
  const label = labelFor(state.theme, c.cell);
  return (
    <span className="fade-in text-rose-300 font-medium">
      💥 {picker} picked <span className="font-bold">{label}</span> — already taken by {owner}!
    </span>
  );
}

function PlayerBadge(p: {
  player: { name: string };
  active: boolean;
  score?: number;
  oppStatus?: "Leading" | "Trailing" | "Tied";
  color: "emerald" | "rose";
}) {
  const ring = p.color === "emerald" ? "ring-emerald-400" : "ring-rose-400";
  const dot = p.color === "emerald" ? "bg-emerald-400" : "bg-rose-400";
  return (
    <div className={`flex-1 p-2 rounded-lg text-center ${p.active ? `ring-2 ${ring}` : "opacity-60"}`}>
      <div className="flex items-center justify-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="font-medium text-sm">{p.player.name}</span>
      </div>
      {p.score !== undefined && <div className="text-2xl font-bold mt-1">{p.score}</div>}
      {p.oppStatus !== undefined && (
        <div
          className={`text-xs font-semibold mt-1 ${
            p.oppStatus === "Leading"
              ? "text-rose-300"
              : p.oppStatus === "Trailing"
              ? "text-emerald-300"
              : "text-slate-400"
          }`}
        >
          {p.oppStatus}
        </div>
      )}
    </div>
  );
}

function Result(props: { game: GameState; onRematch: () => void; onHome: () => void }) {
  const { game } = props;
  const winnerName =
    game.winner === "draw" || game.winner === null
      ? null
      : game.players[game.winner as PlayerId].name;

  let detail: string;
  if (game.endReason === "collision" && game.lastCollision) {
    const c = game.lastCollision;
    const picker = game.players[c.by].name;
    const ownerId = game.board[c.cell] as PlayerId;
    const owner = game.players[ownerId].name;
    const label = labelFor(game.theme, c.cell);
    detail = `${picker} picked ${label}, which was already taken by ${owner}.`;
  } else if (game.endReason === "timeout") {
    detail = `${game.players[game.turn].name} ran out of time.`;
  } else {
    detail = "All cells picked.";
  }

  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-xl text-center">
      <div className="text-sm text-slate-400 uppercase tracking-wider mb-2">
        {game.mode === "survival" ? "Survival" : "Score"} mode
      </div>
      <h1 className="text-4xl font-bold mb-2">{winnerName ? `${winnerName} wins!` : "Draw"}</h1>
      <div className="text-slate-400 mb-6 text-sm">{detail}</div>

      {game.mode === "score" && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-4">
            <div className="text-xs text-slate-400">{game.players.p1.name}</div>
            <div className="text-3xl font-bold text-emerald-300">{scoreOf(game, "p1")}</div>
          </div>
          <div className="bg-rose-500/10 border border-rose-400/30 rounded-xl p-4">
            <div className="text-xs text-slate-400">{game.players.p2.name}</div>
            <div className="text-3xl font-bold text-rose-300">{scoreOf(game, "p2")}</div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={props.onRematch}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 rounded-xl transition"
        >
          Rematch
        </button>
        <button onClick={props.onHome} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-xl transition">
          Home
        </button>
      </div>
    </div>
  );
}
