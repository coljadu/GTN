import { useEffect, useMemo, useRef, useState } from "react";
import {
  CELLS,
  type Cell,
  type GameState,
  type Mode,
  type PlayerId,
  type ThemeId,
  TURN_SECONDS,
  labelFor,
  newGame,
  pick,
  randomStartingPlayer,
  scoreOf,
  timeout,
} from "./game";
import { ensureSignedIn } from "./firebase";
import {
  type MatchInfo,
  clearRematchVote,
  findMatch,
  leaveMatch,
  subscribeMatch,
  voteRematch,
  watchRematch,
  writePick,
  writeTimeout,
} from "./online";
import {
  isMuted,
  soundCollision,
  soundLose,
  soundPick,
  soundWin,
  toggleMute,
} from "./sounds";

type Opponent = "online" | "local";
type Screen = "home" | "matchmaking" | "intermission" | "game" | "online" | "result";

const NAME_STORAGE_KEY = "nd_player_name";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode] = useState<Mode>("score");
  const [theme] = useState<ThemeId>("numbers");
  const [opponent, setOpponent] = useState<Opponent>("online");
  const [myName, setMyName] = useState<string>(
    () => localStorage.getItem(NAME_STORAGE_KEY) || "Player 1",
  );
  const [p2Name, setP2Name] = useState<string>("Player 2");
  const [game, setGame] = useState<GameState | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);

  useEffect(() => {
    localStorage.setItem(NAME_STORAGE_KEY, myName);
  }, [myName]);

  function startLocal() {
    setGame(newGame(mode, theme, myName || "Player 1", { name: p2Name || "Player 2", isBot: false }, randomStartingPlayer()));
    setScreen("intermission");
  }

  function start() {
    if (opponent === "online") setScreen("matchmaking");
    else startLocal();
  }

  function startNewMatch(info: MatchInfo) {
    setMatchInfo(info);
    setGame(null);
    setScreen("online");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <MuteButton />
      {screen === "home" && (
        <Home
          opponent={opponent} setOpponent={setOpponent}
          myName={myName} setMyName={setMyName}
          p2Name={p2Name} setP2Name={setP2Name}
          onStart={start}
        />
      )}
      {screen === "matchmaking" && (
        <Matchmaking
          mode={mode}
          theme={theme}
          myName={myName || "Player"}
          onMatched={(info) => {
            setMatchInfo(info);
            setScreen("online");
          }}
          onCancel={() => setScreen("home")}
        />
      )}
      {screen === "intermission" && game && (
        <Intermission
          playerName={game.players[game.turn].name}
          onReady={() => setScreen("game")}
        />
      )}
      {screen === "game" && game && (
        <LocalGame
          state={game}
          setState={setGame}
          onTurnEnd={(g) => { setGame(g); setScreen("intermission"); }}
          onEnd={(g) => { setGame(g); setScreen("result"); }}
          onQuit={() => setScreen("home")}
          isHotSeat={opponent === "local"}
        />
      )}
      {screen === "online" && matchInfo && (
        <OnlineGame
          matchInfo={matchInfo}
          onEnd={(g) => { setGame(g); setScreen("result"); }}
          onQuit={() => {
            void leaveMatch(matchInfo.matchId, matchInfo.uid);
            setMatchInfo(null);
            setScreen("home");
          }}
        />
      )}
      {screen === "result" && game && (
        <Result
          game={game}
          matchInfo={matchInfo}
          onLocalRematch={() => { setMatchInfo(null); start(); }}
          onOnlineNextMatch={(info) => startNewMatch(info)}
          onHome={() => {
            if (matchInfo) {
              void clearRematchVote(matchInfo.matchId, matchInfo.uid);
              void leaveMatch(matchInfo.matchId, matchInfo.uid);
            }
            setMatchInfo(null);
            setScreen("home");
          }}
        />
      )}
    </div>
  );
}

/* ---------- Mute toggle ---------- */

function MuteButton() {
  const [m, setM] = useState(isMuted());
  return (
    <button
      onClick={() => setM(toggleMute())}
      className="absolute top-3 right-3 w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-lg"
      title={m ? "Unmute" : "Mute"}
    >
      {m ? "🔇" : "🔊"}
    </button>
  );
}

/* ---------- Home ---------- */

function Home(props: {
  opponent: Opponent; setOpponent: (o: Opponent) => void;
  myName: string; setMyName: (n: string) => void;
  p2Name: string; setP2Name: (n: string) => void;
  onStart: () => void;
}) {
  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-xl">
      <h1 className="text-3xl font-bold text-center mb-2">Number Duel</h1>
      <p className="text-slate-400 text-center mb-6 text-sm">
        Pick numbers. Highest total wins — but don't pick what your opponent already secretly picked.
      </p>

      <Section label="Your Name">
        <input
          value={props.myName}
          onChange={(e) => props.setMyName(e.target.value.slice(0, 20))}
          placeholder="Player 1"
          className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-emerald-400 outline-none"
        />
      </Section>

      <Section label="Mode">
        <div className="grid grid-cols-2 gap-2">
          <OptionBtn active={true} onClick={() => {}} title="Score" sub="Highest sum wins" />
          <OptionBtn active={false} onClick={() => {}} title="Coming Soon" sub="New mode incoming" disabled />
        </div>
      </Section>

      <Section label="Opponent">
        <div className="grid grid-cols-2 gap-2">
          <OptionBtn active={props.opponent === "online"} onClick={() => props.setOpponent("online")} title="Find Player" sub="Online match" />
          <OptionBtn active={props.opponent === "local"} onClick={() => props.setOpponent("local")} title="Local 2P" sub="Same device" />
        </div>
      </Section>

      {props.opponent === "local" && (
        <Section label="Player 2 Name">
          <input
            value={props.p2Name}
            onChange={(e) => props.setP2Name(e.target.value.slice(0, 20))}
            placeholder="Player 2"
            className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-emerald-400 outline-none"
          />
        </Section>
      )}

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
    <div className="mb-5">
      <div className="text-sm text-slate-300 mb-2">{p.label}</div>
      {p.children}
    </div>
  );
}

function OptionBtn(p: { active: boolean; onClick: () => void; title: string; sub: string; disabled?: boolean }) {
  return (
    <button
      onClick={p.onClick}
      disabled={p.disabled}
      className={`p-3 rounded-xl border-2 text-left transition ${
        p.disabled
          ? "border-slate-800 bg-slate-900/40 opacity-50 cursor-not-allowed"
          : p.active
          ? "border-emerald-400 bg-emerald-500/10"
          : "border-slate-700 hover:border-slate-600"
      }`}
    >
      <div className="font-semibold text-sm">{p.title}</div>
      <div className="text-xs text-slate-400 truncate">{p.sub}</div>
    </button>
  );
}

/* ---------- Matchmaking ---------- */

function Matchmaking(props: {
  mode: Mode;
  theme: ThemeId;
  myName: string;
  onMatched: (info: MatchInfo) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        setStatus("Signing in…");
        const user = await ensureSignedIn();
        if (stopped) return;
        setStatus("Searching for opponent…");
        const handle = findMatch(user.uid, props.myName, props.mode, props.theme);
        cancelRef.current = handle.cancel;
        const info = await handle.promise;
        if (stopped) return;
        props.onMatched(info);
      } catch (e: unknown) {
        if (stopped) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== "cancelled") setError(msg);
      }
    })();
    return () => { stopped = true; };
  }, []);

  function handleCancel() {
    cancelRef.current?.();
    props.onCancel();
  }

  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-10 text-center shadow-xl">
      {error ? (
        <>
          <h1 className="text-2xl font-bold mb-2 text-rose-300">Connection error</h1>
          <p className="text-slate-400 mb-6 text-sm break-all">{error}</p>
          <button onClick={props.onCancel} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-xl">
            Back
          </button>
        </>
      ) : (
        <>
          <div className="mb-6 flex justify-center">
            <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{status}</h1>
          <p className="text-slate-400 mb-8 text-sm">Score mode</p>
          <button onClick={handleCancel} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-xl">
            Cancel
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- Intermission ---------- */

function Intermission(p: { playerName: string; onReady: () => void }) {
  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-10 text-center shadow-xl">
      <div className="text-sm text-slate-400 mb-2">Pass the device to</div>
      <h1 className="text-4xl font-bold mb-8">{p.playerName}</h1>
      <button onClick={p.onReady} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 rounded-xl transition">
        I'm Ready
      </button>
    </div>
  );
}

/* ---------- Local Game ---------- */

const COLLISION_TURN_DELAY = 1800;

function LocalGame(props: {
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
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    if (state.status !== "active" || frozen) return;
    setSecondsLeft(TURN_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(id); setState(timeout(stateRef.current)); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.turn, state.status, frozen]);

  const collisionKey = state.lastCollision ? `${state.lastCollision.by}-${state.lastCollision.cell}` : null;
  useEffect(() => {
    if (!collisionKey) return;
    soundCollision();
    setFrozen(true);
    const t = setTimeout(() => setFrozen(false), COLLISION_TURN_DELAY);
    return () => clearTimeout(t);
  }, [collisionKey]);

  useEffect(() => {
    if (state.status !== "ended") return;
    const delay = 700;
    const id = setTimeout(() => props.onEnd(stateRef.current), delay);
    return () => clearTimeout(id);
  }, [state.status, state.endReason]);

  useEffect(() => {
    const turnChanged = prevTurnRef.current !== state.turn;
    prevTurnRef.current = state.turn;
    if (!turnChanged || state.status !== "active" || !props.isHotSeat) return;
    const delay = state.lastCollision ? COLLISION_TURN_DELAY : 200;
    const id = setTimeout(() => props.onTurnEnd(stateRef.current), delay);
    return () => clearTimeout(id);
  }, [state.turn]);

  function handleTap(c: Cell) {
    if (state.status !== "active" || frozen) return;
    if (state.board[c] === null) soundPick();
    setState(pick(state, c));
  }

  const viewer: PlayerId = state.turn;
  return (
    <Board
      state={state}
      viewer={viewer}
      secondsLeft={secondsLeft}
      collisionVisible={!!state.lastCollision && (frozen || state.status === "ended")}
      onTap={handleTap}
      onQuit={props.onQuit}
    />
  );
}

/* ---------- Online Game ---------- */

function OnlineGame(props: {
  matchInfo: MatchInfo;
  onEnd: (g: GameState) => void;
  onQuit: () => void;
}) {
  const { matchInfo } = props;
  const [state, setState] = useState<GameState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  const [frozen, setFrozen] = useState(false);
  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    const unsub = subscribeMatch(matchInfo.matchId, (s) => setState(s));
    return unsub;
  }, [matchInfo.matchId]);

  useEffect(() => {
    if (!state || state.status !== "active" || frozen) return;
    setSecondsLeft(TURN_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          if (stateRef.current && stateRef.current.turn === matchInfo.myPlayerId) {
            void writeTimeout(matchInfo.matchId, stateRef.current.turn);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state?.turn, state?.status, frozen, matchInfo]);

  const collisionKey = state?.lastCollision
    ? `${state.lastCollision.by}-${state.lastCollision.cell}`
    : null;
  useEffect(() => {
    if (!collisionKey) return;
    soundCollision();
    setFrozen(true);
    const t = setTimeout(() => setFrozen(false), COLLISION_TURN_DELAY);
    return () => clearTimeout(t);
  }, [collisionKey]);

  useEffect(() => {
    if (!state || state.status !== "ended") return;
    const delay = 700;
    const id = setTimeout(() => props.onEnd(stateRef.current!), delay);
    return () => clearTimeout(id);
  }, [state?.status, state?.endReason]);

  if (!state) {
    return (
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-10 text-center shadow-xl">
        <div className="w-12 h-12 mx-auto border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-slate-300">Loading match…</div>
      </div>
    );
  }

  function handleTap(c: Cell) {
    if (!state || state.status !== "active" || frozen) return;
    if (state.turn !== matchInfo.myPlayerId) return;
    if (state.board[c] === null) soundPick();
    void writePick(matchInfo.matchId, matchInfo.myPlayerId, c);
  }

  return (
    <Board
      state={state}
      viewer={matchInfo.myPlayerId}
      secondsLeft={secondsLeft}
      collisionVisible={!!state.lastCollision && (frozen || state.status === "ended")}
      onTap={handleTap}
      onQuit={props.onQuit}
    />
  );
}

/* ---------- Shared Board ---------- */

function Board(props: {
  state: GameState;
  viewer: PlayerId;
  secondsLeft: number;
  collisionVisible: boolean;
  onTap: (c: Cell) => void;
  onQuit: () => void;
}) {
  const { state, viewer, secondsLeft, collisionVisible } = props;
  const current = state.players[state.turn];
  const timerPct = (secondsLeft / TURN_SECONDS) * 100;

  let oppStatus: "Leading" | "Trailing" | "Tied" | undefined;
  if (state.mode === "score") {
    const opp: PlayerId = viewer === "p1" ? "p2" : "p1";
    const me = scoreOf(state, viewer);
    const them = scoreOf(state, opp);
    oppStatus = them > me ? "Leading" : them < me ? "Trailing" : "Tied";
  }

  const collidingCell = state.lastCollision?.cell ?? null;

  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <PlayerBadge
          player={state.players.p1}
          active={state.turn === "p1" && state.status === "active"}
          score={state.mode === "score" && viewer === "p1" ? scoreOf(state, "p1") : undefined}
          oppStatus={state.mode === "score" && viewer !== "p1" ? oppStatus : undefined}
          isYou={viewer === "p1"}
        />
        <div className="text-slate-500 text-xs uppercase tracking-wider">vs</div>
        <PlayerBadge
          player={state.players.p2}
          active={state.turn === "p2" && state.status === "active"}
          score={state.mode === "score" && viewer === "p2" ? scoreOf(state, "p2") : undefined}
          oppStatus={state.mode === "score" && viewer !== "p2" ? oppStatus : undefined}
          isYou={viewer === "p2"}
        />
      </div>

      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full transition-all duration-1000 linear ${secondsLeft <= 5 ? "bg-rose-500" : "bg-emerald-400"}`}
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
          const isOppRevealed = owner !== null && owner !== viewer && state.revealed[c];
          let cls = "bg-slate-700 hover:bg-slate-600 border-2 border-transparent";
          if (isMine) cls = "bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200";
          else if (isOppRevealed) cls = "bg-rose-500/20 border-2 border-rose-400 text-rose-200";
          const isColliding = c === collidingCell && collisionVisible;
          return (
            <button
              key={c}
              onClick={() => props.onTap(c)}
              className={`aspect-square rounded-xl text-lg font-bold transition flex items-center justify-center text-center px-1 ${cls} ${isColliding ? "collision-shake" : ""}`}
            >
              {labelFor(state.theme, c)}
            </button>
          );
        })}
      </div>

      <button onClick={props.onQuit} className="w-full text-slate-400 hover:text-slate-200 text-sm py-2">Quit</button>
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
  isYou?: boolean;
}) {
  return (
    <div className={`flex-1 p-2 rounded-lg text-center ${p.active ? "ring-2 ring-emerald-400" : "opacity-60"}`}>
      <div className="flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="font-medium text-sm truncate">{p.player.name}{p.isYou ? " (you)" : ""}</span>
      </div>
      {p.score !== undefined && <div className="text-2xl font-bold mt-1">{p.score}</div>}
      {p.oppStatus !== undefined && (
        <div className={`text-xs font-semibold mt-1 ${
          p.oppStatus === "Leading" ? "text-rose-300" :
          p.oppStatus === "Trailing" ? "text-emerald-300" : "text-slate-400"
        }`}>{p.oppStatus}</div>
      )}
    </div>
  );
}

/* ---------- Confetti ---------- */

function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(() => {
    const colors = ["#34d399", "#f43f5e", "#fbbf24", "#60a5fa", "#a78bfa"];
    return Array.from({ length: count }).map((_, i) => ({
      key: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotate: Math.random() * 360,
    }));
  }, [count]);
  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.key}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}

/* ---------- Result ---------- */

function Result(props: {
  game: GameState;
  matchInfo: MatchInfo | null;
  onLocalRematch: () => void;
  onOnlineNextMatch: (info: MatchInfo) => void;
  onHome: () => void;
}) {
  const { game, matchInfo } = props;
  const winnerName =
    game.winner === "draw" || game.winner === null
      ? null
      : game.players[game.winner as PlayerId].name;

  // Detect if I won — only meaningful in online (we know our player slot)
  const myPlayerId = matchInfo?.myPlayerId;
  const iWon = myPlayerId !== undefined && game.winner === myPlayerId;
  const iLost = myPlayerId !== undefined && game.winner !== "draw" && game.winner !== null && game.winner !== myPlayerId;

  // Sounds on mount
  useEffect(() => {
    if (game.winner === "draw" || game.winner === null) return;
    if (matchInfo) {
      if (iWon) soundWin();
      else if (iLost) soundLose();
    } else {
      // local: just play win sound
      soundWin();
    }
  }, []);

  const detail =
    game.endReason === "timeout"
      ? `${game.players[game.turn].name} ran out of time.`
      : "All cells picked.";

  const showConfetti = iWon || (matchInfo === null && winnerName !== null);

  return (
    <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-xl text-center relative overflow-hidden">
      {showConfetti && <Confetti />}
      <div className="text-sm text-slate-400 uppercase tracking-wider mb-2">Score mode</div>
      <h1 className="text-4xl font-bold mb-2 pop-in">
        {winnerName ? `${winnerName} wins!` : "Draw"}
      </h1>
      <div className="text-slate-400 mb-6 text-sm">{detail}</div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <ScoreCard name={game.players.p1.name} score={scoreOf(game, "p1")} loser={game.winner === "p2"} />
        <ScoreCard name={game.players.p2.name} score={scoreOf(game, "p2")} loser={game.winner === "p1"} />
      </div>

      {matchInfo ? (
        <OnlineRematchControls
          matchInfo={matchInfo}
          onNextMatch={props.onOnlineNextMatch}
          onHome={props.onHome}
        />
      ) : (
        <div className="space-y-2">
          <button onClick={props.onLocalRematch} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 rounded-xl transition">
            New Game
          </button>
          <button onClick={props.onHome} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-xl transition">
            Home
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreCard(p: { name: string; score: number; loser: boolean }) {
  const cls = p.loser
    ? "bg-rose-500/10 border-rose-400/30 text-rose-300"
    : "bg-emerald-500/10 border-emerald-400/30 text-emerald-300";
  return (
    <div className={`rounded-xl p-4 border ${cls}`}>
      <div className="text-xs text-slate-400">{p.name}</div>
      <div className="text-3xl font-bold">{p.score}</div>
    </div>
  );
}

function OnlineRematchControls(props: {
  matchInfo: MatchInfo;
  onNextMatch: (info: MatchInfo) => void;
  onHome: () => void;
}) {
  const { matchInfo } = props;
  const [mine, setMine] = useState(false);
  const [theirs, setTheirs] = useState(false);

  useEffect(() => {
    const unsub = watchRematch(
      matchInfo.matchId,
      matchInfo.uid,
      matchInfo.myPlayerId,
      (u) => {
        if (u.kind === "ready") {
          props.onNextMatch({
            matchId: u.nextMatchId,
            myPlayerId: u.myPlayerId,
            uid: matchInfo.uid,
          });
        } else {
          setMine(u.mine);
          setTheirs(u.theirs);
        }
      },
    );
    return unsub;
  }, [matchInfo.matchId]);

  function vote() {
    void voteRematch(matchInfo.matchId, matchInfo.uid);
  }

  let buttonLabel = "Rematch";
  if (mine && !theirs) buttonLabel = "Waiting for opponent…";
  else if (theirs && !mine) buttonLabel = "Accept Rematch";

  return (
    <div className="space-y-2">
      <button
        onClick={vote}
        disabled={mine}
        className={`w-full font-bold py-3 rounded-xl transition ${
          mine
            ? "bg-slate-700 text-slate-400 cursor-not-allowed"
            : theirs
            ? "bg-amber-400 hover:bg-amber-300 text-slate-900 animate-pulse"
            : "bg-emerald-500 hover:bg-emerald-400 text-slate-900"
        }`}
      >
        {buttonLabel}
      </button>
      <button onClick={props.onHome} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-xl transition">
        Home
      </button>
    </div>
  );
}
