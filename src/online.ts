import {
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
} from "firebase/database";
import { db } from "./firebase";
import {
  type Cell,
  type GameState,
  type Mode,
  type PlayerId,
  type ThemeId,
  newGame,
  pick as enginePick,
  randomStartingPlayer,
  timeout as engineTimeout,
} from "./game";

export type MatchPick = {
  by: PlayerId;
  cell: Cell;
  at: number;
  type?: "pick" | "timeout";
};

export type MatchDoc = {
  mode: Mode;
  theme: ThemeId;
  players: { p1: { uid: string; name: string }; p2: { uid: string; name: string } };
  picks?: Record<string, MatchPick>;
  createdAt: number;
  startingPlayer?: PlayerId;
};

export type MatchInfo = { matchId: string; myPlayerId: PlayerId; uid: string };

const queueKeyOf = (mode: Mode, theme: ThemeId) => `${mode}_${theme}`;
const log = (...args: unknown[]) => console.log("[matchmaking]", ...args);

export type FindHandle = {
  promise: Promise<MatchInfo>;
  cancel: () => void;
};

type QueueEntry = { name: string; joinedAt: number };

export function findMatch(
  uid: string,
  name: string,
  mode: Mode,
  theme: ThemeId,
): FindHandle {
  let cancelled = false;
  let cleanup: (() => void) | null = null;

  const promise = (async (): Promise<MatchInfo> => {
    const queueKey = queueKeyOf(mode, theme);
    const queueRef = ref(db, `queue/${queueKey}`);
    const myEntryRef = ref(db, `queue/${queueKey}/${uid}`);
    const myActiveRef = ref(db, `userActive/${uid}`);

    log("uid", uid, "queueKey", queueKey);

    await remove(myActiveRef).catch(() => {});
    await set(myEntryRef, { name, joinedAt: Date.now() });
    onDisconnect(myEntryRef).remove();
    onDisconnect(myActiveRef).remove();
    log("self enqueued");

    let resolved = false;

    return new Promise<MatchInfo>((resolve, reject) => {
      // Listener 1: someone else paired with us → userActive gets set
      const unsubActive = onValue(
        myActiveRef,
        async (s) => {
          const matchId = s.val();
          if (typeof matchId !== "string" || resolved) return;
          log("userActive set", matchId);
          resolved = true;
          unsubActive();
          unsubQueue();
          const playersSnap = await get(ref(db, `matches/${matchId}/players`));
          const players = playersSnap.val() as MatchDoc["players"];
          const myPlayerId: PlayerId = players.p1.uid === uid ? "p1" : "p2";
          resolve({ matchId, myPlayerId, uid });
        },
        (err) => log("userActive listener ERROR:", err.message),
      );

      // Listener 2: queue changes → if I'm "host" (smallest uid), pair with anyone present
      const unsubQueue = onValue(
        queueRef,
        async (snap) => {
        if (resolved) return;
        const queue = (snap.val() as Record<string, QueueEntry> | null) || {};
        const others = Object.keys(queue).filter((u) => u !== uid);
        if (others.length === 0) {
          log("queue: only me");
          return;
        }
        // Deterministic host = smallest uid among present players
        const allUids = [uid, ...others].sort();
        if (allUids[0] !== uid) {
          log("queue: I'm not host, waiting", { others });
          return;
        }
        // I'm host. Try to claim the next smallest other uid.
        const targetUid = others.sort()[0];
        log("queue: I'm host, claiming", targetUid);
        const targetRef = ref(db, `queue/${queueKey}/${targetUid}`);
        const tx = await runTransaction(targetRef, (current) => {
          if (current === null) return;
          return null;
        });
        if (!tx.committed || tx.snapshot.val() !== null) {
          log("claim failed (already taken)");
          return;
        }
        // Also remove self from queue
        await remove(myEntryRef).catch(() => {});
        // Create match
        const targetName = queue[targetUid]?.name ?? "Player";
        const matchRef = push(ref(db, "matches"));
        const matchId = matchRef.key!;
        const doc: MatchDoc = {
          mode,
          theme,
          players: {
            p1: { uid, name },                          // host = p1
            p2: { uid: targetUid, name: targetName },   // claimed = p2
          },
          createdAt: Date.now(),
          startingPlayer: randomStartingPlayer(),
        };
        await set(matchRef, doc);
        log("match created", matchId);
        await set(ref(db, `userActive/${targetUid}`), matchId);
        await set(myActiveRef, matchId);
        // userActive listener above will fire and resolve us
      },
      (err) => log("queue listener ERROR:", err.message),
      );

      cleanup = () => {
        unsubActive();
        unsubQueue();
        remove(myEntryRef).catch(() => {});
        remove(myActiveRef).catch(() => {});
        reject(new Error("cancelled"));
      };
      if (cancelled && cleanup) cleanup();
    });
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (cleanup) cleanup();
    },
  };
}

export function subscribeMatch(
  matchId: string,
  onChange: (state: GameState | null, doc: MatchDoc | null) => void,
): () => void {
  const matchRef = ref(db, `matches/${matchId}`);
  const unsub = onValue(matchRef, (snap) => {
    const doc = snap.val() as MatchDoc | null;
    if (!doc) {
      onChange(null, null);
      return;
    }
    onChange(deriveState(doc), doc);
  });
  return unsub;
}

function deriveState(doc: MatchDoc): GameState {
  const initial = newGame(
    doc.mode,
    doc.theme,
    doc.players.p1.name,
    { name: doc.players.p2.name, isBot: false },
    doc.startingPlayer ?? "p1",
  );
  const entries = Object.entries(doc.picks || {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return entries.reduce<GameState>((s, [, p]) => {
    if (p.type === "timeout") return engineTimeout(s);
    return enginePick(s, p.cell);
  }, initial);
}

export async function writePick(matchId: string, by: PlayerId, cell: Cell): Promise<void> {
  await push(ref(db, `matches/${matchId}/picks`), {
    by,
    cell,
    at: Date.now(),
    type: "pick",
  } satisfies MatchPick);
}

export async function writeTimeout(matchId: string, by: PlayerId): Promise<void> {
  await push(ref(db, `matches/${matchId}/picks`), {
    by,
    cell: 1,
    at: Date.now(),
    type: "timeout",
  } satisfies MatchPick);
}

export async function leaveMatch(_matchId: string, uid: string): Promise<void> {
  await remove(ref(db, `userActive/${uid}`)).catch(() => {});
}

/* ---------- Rematch ---------- */

export async function voteRematch(matchId: string, uid: string): Promise<void> {
  await set(ref(db, `matches/${matchId}/rematchVotes/${uid}`), true);
}

export async function clearRematchVote(matchId: string, uid: string): Promise<void> {
  await remove(ref(db, `matches/${matchId}/rematchVotes/${uid}`)).catch(() => {});
}

export type RematchUpdate =
  | { kind: "votes"; mine: boolean; theirs: boolean }
  | { kind: "ready"; nextMatchId: string; myPlayerId: PlayerId };

export function watchRematch(
  matchId: string,
  myUid: string,
  myPlayerId: PlayerId,
  onUpdate: (u: RematchUpdate) => void,
): () => void {
  const matchRef = ref(db, `matches/${matchId}`);
  const unsub = onValue(matchRef, async (snap) => {
    const doc = snap.val() as (MatchDoc & {
      rematchVotes?: Record<string, boolean>;
      nextMatchId?: string;
    }) | null;
    if (!doc) return;

    if (doc.nextMatchId) {
      const nextSnap = await get(ref(db, `matches/${doc.nextMatchId}/players`));
      const players = nextSnap.val() as MatchDoc["players"] | null;
      if (!players) return;
      const nextPlayerId: PlayerId = players.p1.uid === myUid ? "p1" : "p2";
      onUpdate({ kind: "ready", nextMatchId: doc.nextMatchId, myPlayerId: nextPlayerId });
      return;
    }

    const votes = doc.rematchVotes || {};
    const otherUid = myPlayerId === "p1" ? doc.players.p2.uid : doc.players.p1.uid;
    const mine = !!votes[myUid];
    const theirs = !!votes[otherUid];

    if (mine && theirs) {
      // Both voted. Host (p1) creates the next match.
      if (myPlayerId === "p1") {
        const newMatchRef = push(ref(db, "matches"));
        const newMatchId = newMatchRef.key!;
        const newDoc: MatchDoc = {
          mode: doc.mode,
          theme: doc.theme,
          players: doc.players, // same player slots
          createdAt: Date.now(),
          startingPlayer: randomStartingPlayer(),
        };
        await set(newMatchRef, newDoc);
        await set(ref(db, `matches/${matchId}/nextMatchId`), newMatchId);
        await set(ref(db, `userActive/${doc.players.p1.uid}`), newMatchId);
        await set(ref(db, `userActive/${doc.players.p2.uid}`), newMatchId);
      }
      // The next iteration of this listener will pick up nextMatchId and resolve.
      return;
    }

    onUpdate({ kind: "votes", mine, theirs });
  });
  return unsub;
}
