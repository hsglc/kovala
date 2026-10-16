import { getFit } from "../lib/identity";
import { TICK_RATE } from "../../shared/constants";
import { Bot, type BotLevel } from "../../shared/bot";
import { MatchEngine, type PublicState, type TickInput } from "../../shared/engine";
import { LAYOUTS, type QuadLayout } from "../../shared/maps";
import { clonePlayer, quantizeInput, type PlayerState } from "../../shared/sim";
import type { ConnStatus, FrameData, GameSource } from "./types";

const TICK_MS = 1000 / TICK_RATE;
const BOT_ID = "bot-evade";

const BOT_NAMES: Record<BotLevel, string> = { kolay: "Çaylak Bot", orta: "Bot", zor: "Usta Bot" };

/** Botla antrenman: aynı maç motoru tarayıcıda çalışır, ağ yok. */
const BOT_FITS: Record<BotLevel, string> = { kolay: "41000", orta: "12321", zor: "25443" };

/** 3'e 3 antrenmanda sırayla: rakip, takım arkadaşı, rakip, takım arkadaşı, rakip */
const SQUAD = [
  { name: "Kaan", fit: "25443" },
  { name: "Deniz", fit: "13104" },
  { name: "Ece", fit: "32212" },
  { name: "Arda", fit: "40331" },
  { name: "Mert", fit: "01420" },
];

export class LocalGame implements GameSource {
  readonly kind = "local" as const;
  readonly selfId: string;
  private engine = new MatchEngine();
  private bots = new Map<string, Bot>();
  private state: PublicState;
  private listeners = new Set<() => void>();
  private acc = 0;
  private last = 0;
  private prev = new Map<string, PlayerState>();
  private move = { mx: 0, my: 0 };
  private act = false;
  private act2 = false;
  private paused = false;

  /** Hayatta kal modu: hep sen kaçarsın, her kaçışta bot güçlenir ve saha değişir; yakalanınca biter. */
  readonly survival: { streak: number; best: number; over: boolean } | null;

  constructor(pid: string, name: string, level: BotLevel, chases = 16, layoutId = "random", teamSize = 1, mode: "match" | "survival" = "match") {
    this.selfId = pid;
    this.survival = mode === "survival" ? { streak: 0, best: getBest(), over: false } : null;
    this.engine.join(pid, name, getFit());
    if (teamSize <= 1) {
      this.engine.join(BOT_ID, BOT_NAMES[level], BOT_FITS[level]);
      this.bots.set(BOT_ID, new Bot(level));
    } else {
      for (let i = 0; i < teamSize * 2 - 1; i++) {
        const id = `bot-${i + 1}`;
        this.engine.join(id, SQUAD[i].name, SQUAD[i].fit);
        this.bots.set(id, new Bot(level));
      }
    }
    this.engine.setChases(pid, chases);
    this.engine.layoutChoice = layoutId;
    if (this.survival) this.startSurvival();
    else this.engine.start(pid);
    this.state = this.engine.publicState();
  }

  private stepOnce() {
    const e = this.engine;
    const inputs = new Map<string, TickInput>();
    if (e.phase === "chase") {
      const cid = e.chaserId!;
      const vid = e.evaderId!;
      const cp = e.players.get(cid)!;
      const vp = e.players.get(vid)!;
      for (const [id, role, self, opp] of [
        [cid, "chaser", cp, vp],
        [vid, "evader", vp, cp],
      ] as const) {
        if (id === this.selfId) inputs.set(id, { input: quantizeInput(this.move.mx, this.move.my, this.act, this.act2) });
        else inputs.set(id, { input: this.bots.get(id)!.think(role, self, opp, e.layout) });
      }
      this.act = false;
      this.act2 = false;
    } else {
      this.act = false;
      this.act2 = false;
    }
    this.prev = new Map([...e.players].map(([id, p]) => [id, clonePlayer(p)]));
    const v = e.version;
    const events = e.step(inputs);
    if (events.some((x) => x.type === "chaseStart")) for (const b of this.bots.values()) b.reset();
    if (this.survival) {
      for (const ev of events) {
        if (ev.type !== "chaseEnd") continue;
        const sv = this.survival;
        if (ev.record.winner === "evader" && ev.record.evader === this.selfId) {
          sv.streak++;
          if (sv.streak > sv.best) {
            sv.best = sv.streak;
            setBest(sv.best);
          }
          this.bots.get(BOT_ID)?.tune(sv.streak / 7);
          // Bir sonraki chase farklı bir sahada
          const pool = LAYOUTS.filter((l) => l.id !== e.layout.id);
          e.layout = pool[Math.floor(Math.random() * pool.length)];
        } else {
          sv.over = true;
          e.endMatch(e.member(BOT_ID)!.team);
        }
      }
    }
    if (e.version !== v) {
      this.state = e.publicState();
      this.emit();
    }
  }

  frame(now: number): FrameData {
    const dt = this.last ? Math.min(250, now - this.last) : 0;
    this.last = now;
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        this.stepOnce();
      }
    }
    const t = this.acc / TICK_MS;
    const players = new Map<string, PlayerState>();
    for (const [id, p] of this.engine.players) {
      const a = this.prev.get(id);
      if (a && Math.hypot(a.x - p.x, a.y - p.y) < 2) {
        players.set(id, { ...p, x: a.x + (p.x - a.x) * t, y: a.y + (p.y - a.y) * t });
      } else players.set(id, p);
    }
    return { players, tick: this.engine.tick + t, self: this.engine.players.get(this.selfId) ?? null };
  }

  getState() {
    return this.state;
  }
  getStatus(): ConnStatus {
    return "open";
  }
  getError() {
    return null;
  }
  getPing() {
    return null;
  }
  getCode() {
    return "";
  }
  layout(): QuadLayout {
    return this.engine.layout;
  }
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit() {
    for (const l of this.listeners) l();
  }
  setMove(mx: number, my: number) {
    this.move = { mx, my };
  }
  pressAction() {
    this.act = true;
  }
  pressAction2() {
    this.act2 = true;
  }
  switchTeam() {}
  setChases(n: number) {
    this.engine.setChases(this.selfId, n);
    this.state = this.engine.publicState();
    this.emit();
  }
  setRest(v: "official" | "quick") {
    this.engine.setRest(this.selfId, v);
    this.state = this.engine.publicState();
    this.emit();
  }
  setLayout(id: string) {
    this.engine.setLayout(this.selfId, id);
    this.state = this.engine.publicState();
    this.emit();
  }
  private startSurvival() {
    const sv = this.survival!;
    sv.streak = 0;
    sv.over = false;
    sv.best = getBest();
    this.bots.get(BOT_ID)?.tune(0);
    this.engine.chases = 99;
    this.engine.layoutChoice = "isinma";
    this.engine.start(this.selfId, this.selfId);
  }

  start() {
    if (this.survival) {
      this.startSurvival();
      this.state = this.engine.publicState();
      this.emit();
      return;
    }
    this.engine.start(this.selfId);
    this.state = this.engine.publicState();
    this.emit();
  }
  pick(id: string) {
    this.engine.pick(this.selfId, id);
    this.state = this.engine.publicState();
    this.emit();
  }
  setPaused(p: boolean) {
    this.paused = p;
  }
  close() {
    this.listeners.clear();
  }
}

const BEST_KEY = "evade:survival-best";
function getBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function setBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {}
}
export function survivalBest() {
  return getBest();
}
