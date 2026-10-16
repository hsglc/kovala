import { getFit } from "../lib/identity";
import { INPUT_SEND_EVERY, INTERP_TICKS, TICK_RATE } from "../../shared/constants";
import type { PublicState } from "../../shared/engine";
import { getLayout, type QuadLayout } from "../../shared/maps";
import { unpackPlayer, type ClientMsg, type InputTuple, type ServerMsg } from "../../shared/protocol";
import { clonePlayer, quantizeInput, stepPlayer, type Input, type PlayerState, type Role } from "../../shared/sim";
import type { ConnStatus, FrameData, GameSource } from "./types";

const TICK_MS = 1000 / TICK_RATE;
const MAX_PENDING = 90;

interface Snapshot {
  k: number;
  players: Map<string, PlayerState>;
}

export interface RoomClientOptions {
  /** ws://host veya wss://host */
  wsBase: string;
  code: string;
  pid: string;
  name: string;
  quick?: boolean;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Online oda bağlantısı. Kendi oyuncumuzu anında hareket ettirir (client-side prediction),
 * sunucudan gelen anlık görüntüyle uzlaştırır (reconciliation), rakibi ~100 ms geriden
 * yumuşak çizer (interpolation). Tarayıcıda ve Node'da (testlerde) aynı çalışır.
 */
export class RoomClient implements GameSource {
  readonly kind = "online" as const;
  readonly selfId: string;
  private ws: WebSocket | null = null;
  private state: PublicState | null = null;
  private status: ConnStatus = "connecting";
  private error: string | null = null;
  private listeners = new Set<() => void>();
  private rtt: number | null = null;
  private pingSentAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retries = 0;
  private closedByUser = false;

  private tickBase = 0;
  private tickBaseTime = 0;
  private synced = false;

  private snaps: Snapshot[] = [];
  private acks: Record<string, number> = {};

  private pred: PlayerState | null = null;
  private predPrev: PlayerState | null = null;
  private predRole: Role | null = null;
  private predChase = -1;
  private pending: { seq: number; input: Input }[] = [];
  private seq = 0;
  private sendBuf: InputTuple[] = [];
  private stepsSinceSend = 0;
  private stepAcc = 0;
  private lastFrame = 0;
  private move = { mx: 0, my: 0 };
  private actQueued = false;
  private act2Queued = false;
  private offX = 0;
  private offY = 0;

  /** Test/istatistik: uzlaştırmada görülen en büyük düzeltme (metre). */
  maxCorrection = 0;
  corrections = 0;

  constructor(private opts: RoomClientOptions) {
    this.selfId = opts.pid;
    this.connect();
  }

  // ---------- Bağlantı ----------

  private connect() {
    const { wsBase, code, pid, name, quick } = this.opts;
    const q = new URLSearchParams({ pid, name, fit: getFit() });
    if (quick) q.set("quick", "1");
    const ws = new WebSocket(`${wsBase}/ws/room/${code}?${q}`);
    this.ws = ws;
    ws.onmessage = (ev) => this.onMessage(typeof ev.data === "string" ? ev.data : "");
    ws.onopen = () => {
      this.ping();
      if (!this.pingTimer) this.pingTimer = setInterval(() => this.ping(), 2000);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUser) return;
      if (ev.code === 4000) {
        this.fail("Bu oyuna başka bir sekmeden bağlandın.");
        return;
      }
      if (ev.code === 4001) {
        this.fail(this.error ?? "Oda dolu.");
        return;
      }
      if (this.retries >= 8) {
        this.fail("Sunucuya bağlanılamadı.");
        return;
      }
      this.status = "reconnecting";
      this.emit();
      const delay = Math.min(4000, 400 * 2 ** this.retries++);
      setTimeout(() => !this.closedByUser && this.connect(), delay);
    };
  }

  private fail(msg: string) {
    this.status = "closed";
    this.error = msg;
    this.stopPing();
    this.emit();
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private ping() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.pingSentAt = performance.now();
      this.ws.send("ping");
    }
  }

  private sendMsg(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closedByUser = true;
    this.stopPing();
    this.ws?.close(1000, "bye");
    this.ws = null;
    this.status = "closed";
  }

  private onMessage(data: string) {
    if (data === "pong") {
      const r = performance.now() - this.pingSentAt;
      this.rtt = this.rtt === null ? r : this.rtt * 0.7 + r * 0.3;
      // Oyun ekranı ping'i kendi döngüsünde okur; maç sırasında tüm arayüzü yeniden çizdirme
      const ph = this.state?.phase;
      if (ph !== "countdown" && ph !== "chase" && ph !== "result") this.emit();
      return;
    }
    let msg: ServerMsg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const now = performance.now();
    switch (msg.t) {
      case "welcome":
        this.retries = 0;
        this.status = "open";
        this.error = null;
        this.snaps = [];
        this.pred = null;
        this.predChase = -1;
        this.syncTick(msg.k, now, true);
        this.emit();
        break;
      case "st": {
        this.syncTick(msg.k, now);
        this.state = msg.s;
        if (msg.s.phase !== "chase") {
          this.pred = null;
          this.pending = [];
          this.sendBuf = [];
        }
        this.emit();
        break;
      }
      case "s": {
        this.syncTick(msg.k, now);
        const players = new Map<string, PlayerState>();
        for (const t of msg.p) {
          const { id, p } = unpackPlayer(t);
          players.set(id, p);
        }
        this.snaps.push({ k: msg.k, players });
        if (this.snaps.length > 40) this.snaps.shift();
        this.acks = msg.a;
        this.reconcile(players);
        break;
      }
      case "err":
        this.error = msg.m;
        this.emit();
        break;
    }
  }

  // ---------- Zaman eşitleme ----------

  private syncTick(k: number, now: number, hard = false) {
    const est = k + ((this.rtt ?? 80) / 2) / TICK_MS;
    const cur = this.serverTick(now);
    if (hard || !this.synced || Math.abs(est - cur) > 6) {
      this.tickBase = est;
    } else {
      this.tickBase = cur + (est - cur) * 0.08;
    }
    this.tickBaseTime = now;
    this.synced = true;
  }

  private serverTick(now: number) {
    return this.tickBase + (now - this.tickBaseTime) / TICK_MS;
  }

  private renderTick(now: number) {
    return this.serverTick(now) - INTERP_TICKS - 1;
  }

  // ---------- Tahmin & uzlaştırma ----------

  private selfActiveRole(): Role | null {
    const s = this.state;
    if (!s || s.phase !== "chase") return null;
    if (s.chaserId === this.selfId) return "chaser";
    if (s.evaderId === this.selfId) return "evader";
    return null;
  }

  private reconcile(players: Map<string, PlayerState>) {
    if (!this.pred || !this.predRole) return;
    const server = players.get(this.selfId);
    if (!server) return;
    const ack = this.acks[this.selfId] ?? -1;
    this.pending = this.pending.filter((p) => p.seq > ack);
    const next = clonePlayer(server);
    const layout = this.layout();
    for (const p of this.pending) stepPlayer(next, p.input, this.predRole, layout);
    const ex = this.pred.x + this.offX - next.x;
    const ey = this.pred.y + this.offY - next.y;
    if (this.predPrev) {
      this.predPrev.x += next.x - this.pred.x;
      this.predPrev.y += next.y - this.pred.y;
    }
    const err = Math.hypot(this.pred.x - next.x, this.pred.y - next.y);
    if (err > 0.01) {
      this.corrections++;
      this.maxCorrection = Math.max(this.maxCorrection, err);
    }
    if (Math.hypot(ex, ey) > 1.5) {
      this.offX = 0;
      this.offY = 0;
    } else {
      this.offX = ex;
      this.offY = ey;
    }
    this.pred = next;
  }

  private flush(now: number) {
    if (!this.sendBuf.length) return;
    this.sendMsg({ t: "in", v: Math.round(this.renderTick(now)), i: this.sendBuf });
    this.sendBuf = [];
    this.stepsSinceSend = 0;
  }

  // ---------- GameSource ----------

  frame(now: number): FrameData {
    const dt = this.lastFrame ? Math.min(250, now - this.lastFrame) : 0;
    this.lastFrame = now;
    const role = this.selfActiveRole();
    const s = this.state;

    if (role && s && this.predChase !== s.chaseStartTick) {
      const latest = this.snaps[this.snaps.length - 1]?.players.get(this.selfId);
      if (latest) {
        this.pred = clonePlayer(latest);
        this.predRole = role;
        this.predChase = s.chaseStartTick;
        this.pending = [];
        this.sendBuf = [];
        this.offX = this.offY = 0;
        this.stepAcc = 0;
      }
    }
    if (!role) this.pred = null;

    this.stepAcc += dt;
    const layout = this.layout();
    while (this.stepAcc >= TICK_MS) {
      this.stepAcc -= TICK_MS;
      if (role && this.pred) {
        const input = quantizeInput(this.move.mx, this.move.my, this.actQueued, this.act2Queued);
        this.actQueued = false;
        this.act2Queued = false;
        const seq = ++this.seq;
        this.predPrev = clonePlayer(this.pred);
        stepPlayer(this.pred, input, role, layout);
        this.pending.push({ seq, input });
        if (this.pending.length > MAX_PENDING) this.pending.shift();
        this.sendBuf.push([seq, input.mx, input.my, (input.act ? 1 : 0) | (input.act2 ? 2 : 0)]);
        if (++this.stepsSinceSend >= INPUT_SEND_EVERY) this.flush(now);
      }
    }

    const decay = Math.exp(-dt / 90);
    this.offX *= decay;
    this.offY *= decay;

    const players = this.interpolated(this.renderTick(now));
    let self: PlayerState | null = players.get(this.selfId) ?? null;
    if (role && this.pred) {
      const t = Math.min(1, this.stepAcc / TICK_MS);
      const pp = this.predPrev;
      const sx = pp && Math.hypot(pp.x - this.pred.x, pp.y - this.pred.y) < 1 ? pp.x + (this.pred.x - pp.x) * t : this.pred.x;
      const sy = pp && Math.hypot(pp.x - this.pred.x, pp.y - this.pred.y) < 1 ? pp.y + (this.pred.y - pp.y) * t : this.pred.y;
      const sh = pp && Math.abs(pp.h - this.pred.h) < 1.5 ? pp.h + (this.pred.h - pp.h) * t : this.pred.h;
      self = { ...this.pred, x: sx + this.offX, y: sy + this.offY, h: sh };
      players.set(this.selfId, self);
    }
    return { players, tick: this.serverTick(now), self: role && this.pred ? this.pred : self };
  }

  private interpolated(rt: number): Map<string, PlayerState> {
    const out = new Map<string, PlayerState>();
    const snaps = this.snaps;
    if (!snaps.length) return out;
    let a = snaps[0];
    let b = snaps[snaps.length - 1];
    if (rt <= a.k) b = a;
    else if (rt >= b.k) a = b;
    else {
      for (let i = snaps.length - 1; i > 0; i--) {
        if (snaps[i - 1].k <= rt) {
          a = snaps[i - 1];
          b = snaps[i];
          break;
        }
      }
    }
    const t = b.k === a.k ? 1 : (rt - a.k) / (b.k - a.k);
    for (const [id, pb] of b.players) {
      const pa = a.players.get(id);
      if (!pa || Math.hypot(pa.x - pb.x, pa.y - pb.y) > 2.5) {
        out.set(id, pb);
        continue;
      }
      out.set(id, { ...pb, x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t), h: lerp(pa.h, pb.h, t), hv: lerp(pa.hv, pb.hv, t) });
    }
    return out;
  }

  getState() {
    return this.state;
  }
  getStatus() {
    return this.status;
  }
  getError() {
    return this.error;
  }
  getPing() {
    return this.rtt === null ? null : Math.round(this.rtt);
  }
  getCode() {
    return this.opts.code;
  }
  layout(): QuadLayout {
    return getLayout(this.state?.layoutId ?? "klasik");
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
    this.actQueued = true;
  }
  pressAction2() {
    this.act2Queued = true;
  }
  switchTeam() {
    this.sendMsg({ t: "team" });
  }
  setChases(n: number) {
    this.sendMsg({ t: "chases", n });
  }
  setVenue(v: string) {
    this.sendMsg({ t: "venue", v });
  }
  pick(id: string) {
    this.sendMsg({ t: "pick", id });
  }
  setRest(v: "official" | "quick") {
    this.sendMsg({ t: "rest", v });
  }
  setMode(v: "official" | "turns") {
    this.sendMsg({ t: "mode", v });
  }
  setLayout(id: string) {
    this.sendMsg({ t: "layout", id });
  }
  start() {
    this.sendMsg({ t: "start" });
  }
}
