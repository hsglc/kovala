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

type Screen =
  | { k: "home"; error?: string }
  | { k: "quick" }
  | { k: "wardrobe" }
  | { k: "room"; code: string; quick: boolean }
  | { k: "practice"; level: BotLevel; map?: string; squad?: number };

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
          onPractice={(level, map, squad) => setScreen({ k: "practice", level, map, squad })}
          onWardrobe={() => setScreen({ k: "wardrobe" })}
        />
      );
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
      return <Practice key={screen.level + (screen.map ?? "") + (screen.squad ?? 1)} level={screen.level} map={screen.map} squad={screen.squad} onLeave={() => home()} />;
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
      {inMatch ? <GameScreen source={source} state={state} onLeave={() => onLeave()} /> : <Lobby source={source} state={state} onLeave={() => onLeave()} />}
      {status === "reconnecting" && <div className="toast">Bağlantı koptu, yeniden bağlanılıyor…</div>}
    </>
  );
}

function Practice({ level, map, squad, onLeave }: { level: BotLevel; map?: string; squad?: number; onLeave: () => void }) {
  const [source, setSource] = useState<LocalGame | null>(null);
  useEffect(() => {
    const g = new LocalGame(getPid(), getName() || "Sen", level, squad && squad > 1 ? 10 : 16, map ?? "random", squad ?? 1);
    setSource(g);
    return () => g.close();
  }, [level, map, squad]);
  const state = useSourceState(source);
  if (!source || !state) return null;
  const inMatch = state.phase === "countdown" || state.phase === "chase" || state.phase === "result";
  return inMatch ? <GameScreen source={source} state={state} onLeave={onLeave} /> : <Lobby source={source} state={state} onLeave={onLeave} />;
}
