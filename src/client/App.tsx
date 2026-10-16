import { useCallback, useEffect, useReducer, useState } from "react";
import type { BotLevel } from "../shared/bot";
import { isValidRoomCode } from "../shared/protocol";
import { GameScreen } from "./game/GameScreen";
import { getName, getPid } from "./lib/identity";
import { LocalGame } from "./net/LocalGame";
import { RoomClient } from "./net/RoomClient";
import type { GameSource } from "./net/types";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { QuickMatch } from "./screens/QuickMatch";
import { Wardrobe } from "./screens/Wardrobe";
import { recordChase, recordMatch } from "./lib/progress";
import { ProgressToasts } from "./ui/ProgressToasts";
import { InviteLayer } from "./ui/Invites";
import { presence, startPresence } from "./net/presence";
import { getProgress } from "./lib/progress";
import type { PresenceStatus } from "../shared/presence";
import { useRef } from "react";
import type { PublicState } from "../shared/engine";
import { Career } from "./screens/Career";
import { PLAYER_ID, forfeitCareerMatch, load as loadCareer, matchRoster, nextMatch, recordCareerMatch } from "./lib/career";
import { setTeamNames } from "./lib/text";
import { alertInvite, setupNotifications } from "./lib/notify";

type Screen =
  | { k: "home"; error?: string }
  | { k: "quick" }
  | { k: "wardrobe" }
  | { k: "room"; code: string; quick: boolean }
  | { k: "practice"; level: BotLevel; map?: string; squad?: number; venue?: string }
  | { k: "survival"; n: number }
  | { k: "career"; last?: CareerLast | null }
  | { k: "careerMatch"; n: number };

type CareerLast = { mine: number; theirs: number; won: boolean; opp: string };

/** Önizleme derlemesinde (artifact) sunucu yok: sadece botla antrenman. */
const OFFLINE = import.meta.env.VITE_OFFLINE === "1";

const wsBase = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

function inviteFromUrl(): string | null {
  if (OFFLINE) return null;
  const c = new URLSearchParams(location.search).get("oda")?.toUpperCase() ?? null;
  return c && isValidRoomCode(c) ? c : null;
}

function setUrlRoom(code: string | null) {
  if (OFFLINE) return;
  const url = new URL(location.href);
  if (code) url.searchParams.set("oda", code);
  else url.searchParams.delete("oda");
  history.replaceState(null, "", url);
}

export function App() {
  return (
    <>
      <AppScreens />
      <ProgressToasts />
      {!OFFLINE && <InviteLayer />}
    </>
  );
}

/** Chase ve maç sonuçlarını ilerlemeye işler. */
function useProgressTracker(selfId: string | undefined, state: PublicState | null) {
  const seen = useRef<string>("");
  const fin = useRef<string>("");
  useEffect(() => {
    if (!state || !selfId) return;
    const r = state.last;
    if (r && (state.phase === "result" || state.phase === "finished")) {
      const k = `${r.n}-${r.sd}-${r.chaser}-${r.ticks}`;
      if (seen.current !== k) {
        seen.current = k;
        if (state.phase === "result") recordChase(r, selfId, state.layoutId);
      }
    }
    if (state.phase === "finished" && state.winner !== null) {
      if (!fin.current) {
        fin.current = "1";
        recordMatch(state, selfId);
      }
    }
    if (state.phase === "countdown" && state.history.length === 0) fin.current = "";
  }, [state, selfId]);
}

function AppScreens() {
  const [invite, setInvite] = useState(inviteFromUrl);
  const [screen, setScreen] = useState<Screen>(() =>
    invite && getName() ? { k: "room", code: invite, quick: false } : { k: "home" },
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrlRoom(screen.k === "room" && !screen.quick ? screen.code : null);
  }, [screen]);

  const home = useCallback((error?: string) => {
    setInvite(null);
    setScreen({ k: "home", error });
  }, []);

  const onMatched = useCallback((code: string) => setScreen({ k: "room", code, quick: true }), []);

  // Çevrimiçi: uygulama açıkken bağlı kal; ekran değiştikçe durumu bildir; davet kabul edilince odaya geç
  useEffect(() => {
    if (OFFLINE) return;
    const p = startPresence(wsBase(), getPid(), { n: getName(), l: getProgress().level, s: "menu" });
    p.onGo = (code) => setScreen({ k: "room", code, quick: false });
    p.onInvite = (from) => alertInvite(from);
    setupNotifications();
  }, []);
  useEffect(() => {
    const st: PresenceStatus =
      screen.k === "practice" || screen.k === "survival" || screen.k === "careerMatch" ? "practice" : screen.k === "quick" ? "queue" : screen.k === "room" ? "room" : "menu";
    presence()?.update({ s: st, n: getName(), l: getProgress().level });
  }, [screen]);

  switch (screen.k) {
    case "home":
      return (
        <Home
          offline={OFFLINE}
          initialCode={invite ?? undefined}
          busy={busy}
          error={screen.error}
          onQuick={() => setScreen({ k: "quick" })}
          onCreate={async () => {
            setBusy(true);
            try {
              const r = await fetch("/api/room", { method: "POST" });
              const { code } = await r.json();
              setScreen({ k: "room", code, quick: false });
            } catch {
              setScreen({ k: "home", error: "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et." });
            } finally {
              setBusy(false);
            }
          }}
          onJoin={(code) => setScreen({ k: "room", code, quick: false })}
          onPractice={(level, map, squad, venue) => setScreen({ k: "practice", level, map, squad, venue })}
          onWardrobe={() => setScreen({ k: "wardrobe" })}
          onSurvival={() => setScreen({ k: "survival", n: Date.now() })}
          onCareer={() => setScreen({ k: "career" })}
        />
      );
    case "career":
      return <Career last={screen.last} onBack={() => home()} onPlay={() => setScreen({ k: "careerMatch", n: Date.now() })} />;
    case "careerMatch":
      return <CareerMatch key={screen.n} onDone={(last) => setScreen({ k: "career", last })} />;
    case "survival":
      return <Survival key={screen.n} onLeave={() => home()} />;
    case "wardrobe":
      return <Wardrobe onBack={() => home()} />;
    case "quick":
      return (
        <QuickMatch
          wsBase={wsBase()}
          pid={getPid()}
          name={getName()}
          onMatched={onMatched}
          onCancel={() => home()}
          onPractice={() => setScreen({ k: "practice", level: "orta" })}
        />
      );
    case "room":
      return <OnlineRoom key={screen.code} code={screen.code} quick={screen.quick} onLeave={home} />;
    case "practice":
      return <Practice key={screen.level + (screen.map ?? "") + (screen.squad ?? 1) + (screen.venue ?? "")} level={screen.level} map={screen.map} squad={screen.squad} venue={screen.venue} onLeave={() => home()} />;
  }
}

function useSourceState(source: GameSource | null) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => (source ? source.subscribe(force) : undefined), [source]);
  return source?.getState() ?? null;
}

function OnlineRoom({ code, quick, onLeave }: { code: string; quick: boolean; onLeave: (error?: string) => void }) {
  const [source, setSource] = useState<RoomClient | null>(null);
  useEffect(() => {
    const c = new RoomClient({ wsBase: wsBase(), code, pid: getPid(), name: getName() || "Oyuncu", quick });
    setSource(c);
    return () => c.close();
  }, [code, quick]);
  const state = useSourceState(source);
  useProgressTracker(source?.selfId, state);

  if (!source) return null;
  const status = source.getStatus();
  if (status === "closed") {
    return (
      <div className="page center-page">
        <h2>Bağlantı kapandı</h2>
        <p className="muted">{source.getError() ?? "Odaya bağlanılamadı."}</p>
        <button className="btn primary" onClick={() => onLeave()}>
          Ana menü
        </button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="page center-page">
        <div className="spinner" />
        <p className="muted">{status === "reconnecting" ? "Yeniden bağlanılıyor…" : "Odaya bağlanılıyor…"}</p>
      </div>
    );
  }
  const inMatch = state.phase === "countdown" || state.phase === "chase" || state.phase === "result";
  return (
    <>
      <PresenceStatusSync s={inMatch ? "match" : "room"} />
      {inMatch ? <GameScreen source={source} state={state} onLeave={() => onLeave()} /> : <Lobby source={source} state={state} onLeave={() => onLeave()} />}
      {status === "reconnecting" && <div className="toast">Bağlantı koptu, yeniden bağlanılıyor…</div>}
    </>
  );
}

function Survival({ onLeave }: { onLeave: () => void }) {
  const [source, setSource] = useState<LocalGame | null>(null);
  useEffect(() => {
    const g = new LocalGame(getPid(), getName() || "Sen", "kolay", 99, "isinma", 1, "survival");
    setSource(g);
    return () => g.close();
  }, []);
  const state = useSourceState(source);
  useProgressTracker(source?.selfId, state);
  if (!source || !state) return null;
  const inMatch = state.phase === "countdown" || state.phase === "chase" || state.phase === "result";
  return inMatch ? <GameScreen source={source} state={state} onLeave={onLeave} /> : <Lobby source={source} state={state} onLeave={onLeave} />;
}

function Practice({ level, map, squad, venue, onLeave }: { level: BotLevel; map?: string; squad?: number; venue?: string; onLeave: () => void }) {
  const [source, setSource] = useState<LocalGame | null>(null);
  useEffect(() => {
    const g = new LocalGame(getPid(), getName() || "Sen", level, squad && squad > 1 ? 10 : 16, map ?? "random", squad ?? 1, "match", venue ?? "arena");
    setSource(g);
    return () => g.close();
  }, [level, map, squad, venue]);
  const state = useSourceState(source);
  useProgressTracker(source?.selfId, state);
  if (!source || !state) return null;
  const inMatch = state.phase === "countdown" || state.phase === "chase" || state.phase === "result";
  return inMatch ? <GameScreen source={source} state={state} onLeave={onLeave} /> : <Lobby source={source} state={state} onLeave={onLeave} />;
}

/** Kariyer maçı: 3'e 3, gerçek takım adları; bitince sonuç kariyere işlenir. Çıkış hükmen mağlubiyettir. */
function CareerMatch({ onDone }: { onDone: (last: CareerLast | null) => void }) {
  const [source, setSource] = useState<LocalGame | null>(null);
  const [opp, setOpp] = useState("");
  const recorded = useRef(false);
  useEffect(() => {
    const d = loadCareer();
    const f = d ? nextMatch(d) : null;
    if (!d || !f) {
      onDone(null);
      return;
    }
    const m = matchRoster(d, f);
    setOpp(m.opp.id);
    setTeamNames([d.teamName, m.opp.name]);
    const g = new LocalGame(getPid(), getName() || "Sen", "orta", m.chases, "random", 3, "match", m.venue, m.roster);
    g.setRest("quick");
    setSource(g);
    return () => {
      g.close();
      setTeamNames(null);
    };
  }, []);
  const state = useSourceState(source);
  useProgressTracker(source?.selfId, state);
  useEffect(() => {
    if (!state || !source || recorded.current || state.phase !== "finished" || state.winner === null) return;
    recorded.current = true;
    const me = source.selfId;
    const st = { evAtt: 0, ev: 0, chAtt: 0, tag: 0 };
    for (const r of state.history) {
      if (r.reason === "forfeit") continue;
      if (r.evader === me) {
        st.evAtt++;
        if (r.winner === "evader") st.ev++;
      }
      if (r.chaser === me) {
        st.chAtt++;
        if (r.winner === "chaser" && r.reason === "tag") st.tag++;
      }
    }
    const mine = state.scores[0];
    const theirs = state.scores[1];
    recordCareerMatch(mine, theirs, mine === theirs ? state.winner === 0 : null, st);
    onDone({ mine, theirs, won: state.winner === 0, opp });
  }, [state, source, opp, onDone]);
  if (!source || !state) return null;
  const leave = () => {
    if (!recorded.current) {
      recorded.current = true;
      forfeitCareerMatch();
      onDone({ mine: 0, theirs: 3, won: false, opp });
    }
  };
  return (
    <GameScreen
      source={source}
      state={state}
      onLeave={leave}
      leaveText={{ title: "Maçtan çık?", body: "Kariyer maçından çıkarsan hükmen 0–3 kaybedersin ve tabloya mağlubiyet yazılır." }}
    />
  );
}
void PLAYER_ID;

/** Oda içinde lobi/maç durumunu çevrimiçi listesine bildirir. */
function PresenceStatusSync({ s }: { s: PresenceStatus }) {
  useEffect(() => {
    presence()?.update({ s });
  }, [s]);
  return null;
}
