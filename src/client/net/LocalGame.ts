import { getFit } from "../lib/identity";
import { TICK_RATE } from "../../shared/constants";
import { Bot, type BotLevel } from "../../shared/bot";
import { MatchEngine, type PublicState, type TickInput } from "../../shared/engine";
import type { QuadLayout } from "../../shared/maps";
import { clonePlayer, quantizeInput, type PlayerState } from "../../shared/sim";
import type { ConnStatus, FrameData, GameSource } from "./types";

const TICK_MS = 1000 / TICK_RATE;
const BOT_ID = "bot-evade";

const BOT_NAMES: Record<BotLevel, string> = { kolay: "Çaylak Bot", orta: "Bot", zor: "Usta Bot" };

/** Botla antrenman: aynı maç motoru tarayıcıda çalışır, ağ yok. */
const BOT_FITS: Record<BotLevel, string> = { kolay: "1000", orta: "0111", zor: "1110" };

export class LocalGame implements GameSource {
  readonly kind = "local" as const;
  readonly selfId: string;
  private engine = new MatchEngine();
  private bot: Bot;
  private state: PublicState;
  private listeners = new Set<() => void>();
  private acc = 0;
  private last = 0;
  private prev = new Map<string, PlayerState>();
  private move = { mx: 0, my: 0 };
  private act = false;
  private act2 = false;
  private paused = false;

  constructor(pid: string, name: string, level: BotLevel, chases = 16) {
    this.selfId = pid;
    this.bot = new Bot(level);
    this.engine.join(pid, name, getFit());
    this.engine.join(BOT_ID, BOT_NAMES[level], BOT_FITS[level]);
    this.engine.setChases(pid, chases);
    this.engine.start(pid);
    this.state = this.engine.publicState();
  }

  private stepOnce() {
    const e = this.engine;
    const inputs = new Map<string, TickInput>();
    if (e.phase === "chase") {
      const selfRole = e.chaserId === this.selfId ? "chaser" : "evader";
      const botRole = selfRole === "chaser" ? "evader" : "chaser";
      const me = e.players.get(this.selfId)!;
      const bp = e.players.get(BOT_ID)!;
      inputs.set(this.selfId, { input: quantizeInput(this.move.mx, this.move.my, this.act, this.act2) });
      this.act = false;
      this.act2 = false;
      inputs.set(BOT_ID, { input: this.bot.think(botRole, bp, me, e.layout) });
    } else {
      this.act = false;
      this.act2 = false;
    }
    this.prev = new Map([...e.players].map(([id, p]) => [id, clonePlayer(p)]));
    const v = e.version;
    const events = e.step(inputs);
    if (events.some((x) => x.type === "chaseStart")) this.bot.reset();
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
  start() {
    this.engine.start(this.selfId);
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
