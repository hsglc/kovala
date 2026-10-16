import { cleanFit } from "../shared/outfit";
import { DurableObject } from "cloudflare:workers";
import { SNAPSHOT_EVERY, TICK_RATE } from "../shared/constants";
import { MatchEngine, type TickInput } from "../shared/engine";
import { cleanName, isValidPid, packPlayer, type ClientMsg, type ServerMsg } from "../shared/protocol";
import { quantizeInput, type Input } from "../shared/sim";
import type { Env } from "./env";

interface Attachment {
  pid: string;
  name: string;
}

interface QueuedInput {
  seq: number;
  input: Input;
  viewTick: number;
}

const TICK_MS = 1000 / TICK_RATE;
/** Kuyrukta bundan fazla input birikirse en eskileri atılır (gecikmeyi sınırlar). */
const MAX_QUEUE = 6;
const MAX_MSG_BYTES = 4096;

/**
 * Bir oda = bir Durable Object. Maç sırasında 30 Hz sunucu döngüsü çalışır,
 * lobide döngü durur ve nesne hibernation'a girebilir (lobi bilgisi storage'da).
 */
export class Room extends DurableObject<Env> {
  private engine = new MatchEngine();
  private code = "";
  private quick = false;
  private queues = new Map<string, QueuedInput[]>();
  private lastSeq = new Map<string, number>();
  private acks = new Map<string, number>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private nextTickAt = 0;
  private sentVersion = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const [lobby, code, quick] = await Promise.all([
        ctx.storage.get<ReturnType<MatchEngine["persistable"]>>("lobby"),
        ctx.storage.get<string>("code"),
        ctx.storage.get<boolean>("quick"),
      ]);
      this.code = code ?? "";
      this.quick = quick ?? false;
      if (lobby) {
        this.engine.restore(lobby);
        // Hibernation'dan dönüş: hâlâ bağlı soketleri tekrar eşleştir.
        for (const ws of ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() as Attachment | null;
          const m = a ? this.engine.member(a.pid) : undefined;
          if (m) m.connected = true;
        }
        for (const m of [...this.engine.members]) if (!m.connected) this.engine.leave(m.id);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket bekleniyor", { status: 426 });
    }
    const url = new URL(request.url);
    const pid = url.searchParams.get("pid");
    const name = cleanName(url.searchParams.get("name"));
    const fit = cleanFit(url.searchParams.get("fit"));
    const code = url.searchParams.get("code") ?? "";
    if (!isValidPid(pid)) return new Response("Geçersiz oyuncu", { status: 400 });

    if (!this.code && code) {
      this.code = code;
      await this.ctx.storage.put("code", code);
    }
    if (url.searchParams.get("quick") === "1" && !this.quick && this.engine.members.length === 0) {
      this.quick = true;
      await this.ctx.storage.put("quick", true);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Aynı oyuncu ikinci kez bağlanırsa (sayfa yenileme, ikinci sekme) eskisini kapat.
    for (const old of this.ctx.getWebSockets(pid)) {
      old.serializeAttachment(null);
      try {
        old.close(4000, "replaced");
      } catch {}
    }

    this.ctx.acceptWebSocket(server, [pid]);
    if (!this.engine.join(pid, name, fit)) {
      this.send(server, { t: "err", m: "Oda dolu" });
      server.close(4001, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ pid, name } satisfies Attachment);
    this.send(server, { t: "welcome", you: pid, code: this.code, k: this.engine.tick });

    if (this.quick && this.engine.phase === "lobby" && this.engine.canStart()) {
      this.engine.start(null);
    }
    await this.afterChange();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return;
    if (typeof raw !== "string" || raw.length > MAX_MSG_BYTES) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const pid = a.pid;
    switch (msg.t) {
      case "in":
        this.onInputs(pid, msg);
        return; // input'lar state değiştirmez
      case "team":
        this.engine.switchTeam(pid);
        break;
      case "chases":
        this.engine.setChases(pid, Number(msg.n));
        break;
      case "layout":
        this.engine.setLayout(pid, String(msg.id));
        break;
      case "rest":
        this.engine.setRest(pid, String(msg.v));
        break;
      case "mode":
        this.engine.setMode(pid, String(msg.v));
        break;
      case "start":
        this.engine.start(pid);
        break;
      case "venue":
        this.engine.setVenue(pid, String(msg.v));
        break;
      case "pick":
        this.engine.pick(pid, String(msg.id));
        break;
      default:
        return;
    }
    await this.afterChange();
  }

  async webSocketClose(ws: WebSocket) {
    await this.onDisconnect(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.onDisconnect(ws);
  }

  private async onDisconnect(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return; // yerine yeni soket gelmiş
    ws.serializeAttachment(null);
    const stillOpen = this.ctx.getWebSockets(a.pid).some((w) => w !== ws && w.deserializeAttachment());
    if (!stillOpen) this.engine.leave(a.pid);
    await this.afterChange();
    if (this.ctx.getWebSockets().filter((w) => w.deserializeAttachment()).length === 0 && !this.engine.inMatch()) {
      // Oda boşaldı: kalıcı veriyi temizle.
      this.stopLoop();
      await this.ctx.storage.deleteAll();
      this.code = "";
      this.quick = false;
      this.engine = new MatchEngine();
    }
  }

  private onInputs(pid: string, msg: Extract<ClientMsg, { t: "in" }>) {
    if (!Array.isArray(msg.i)) return;
    const active = this.engine.phase === "chase" && (pid === this.engine.chaserId || pid === this.engine.evaderId);
    const viewTick = Number.isFinite(msg.v) ? Number(msg.v) : this.engine.tick;
    let q = this.queues.get(pid);
    if (!q) this.queues.set(pid, (q = []));
    let last = this.lastSeq.get(pid) ?? -1;
    for (const t of msg.i.slice(0, 12)) {
      if (!Array.isArray(t) || t.length !== 4) continue;
      const seq = Number(t[0]);
      if (!Number.isInteger(seq) || seq <= last) continue;
      last = seq;
      const mx = Math.max(-1, Math.min(1, Number(t[1]) || 0));
      const my = Math.max(-1, Math.min(1, Number(t[2]) || 0));
      const bits = Number(t[3]) | 0;
      const input = quantizeInput(mx, my, (bits & 1) === 1, (bits & 2) === 2);
      if (active) q.push({ seq, input, viewTick });
      else this.acks.set(pid, seq);
    }
    this.lastSeq.set(pid, last);
    while (q.length > 30) q.shift();
  }

  private tickOnce() {
    const e = this.engine;
    const inputs = new Map<string, TickInput>();
    if (e.phase === "chase") {
      for (const id of [e.chaserId, e.evaderId]) {
        if (!id) continue;
        const q = this.queues.get(id);
        if (!q || q.length === 0) continue;
        while (q.length > MAX_QUEUE) {
          const dropped = q.shift()!;
          if (dropped.input.act) q[0].input = { ...q[0].input, act: true };
          if (dropped.input.act2) q[0].input = { ...q[0].input, act2: true };
          this.acks.set(id, dropped.seq);
        }
        const it = q.shift()!;
        inputs.set(id, { input: it.input, viewTick: it.viewTick });
        this.acks.set(id, it.seq);
      }
    }
    const events = e.step(inputs);
    for (const ev of events) {
      if (ev.type === "finished") this.reportLadder();
      if (ev.type === "chaseStart" || ev.type === "chaseEnd") {
        // Önceki chase'ten kalan input'lar yeni chase'e taşınmasın.
        for (const [id, q] of this.queues) {
          for (const it of q) this.acks.set(id, it.seq);
          q.length = 0;
        }
      }
    }
    if (e.version !== this.sentVersion) this.broadcastState();
    if (e.inMatch() && e.tick % SNAPSHOT_EVERY === 0) this.broadcastSnapshot();
  }

  private startLoop() {
    if (this.loop) return;
    this.nextTickAt = Date.now() + TICK_MS;
    this.loop = setInterval(() => {
      const now = Date.now();
      let n = 0;
      while (now >= this.nextTickAt && n < 5) {
        this.tickOnce();
        this.nextTickAt += TICK_MS;
        n++;
      }
      if (now - this.nextTickAt > 500) this.nextTickAt = now + TICK_MS; // uzun duraklama sonrası yakalamaya çalışma
      if (!this.engine.inMatch()) {
        this.stopLoop();
        this.ctx.waitUntil(this.persist());
      }
    }, TICK_MS / 2);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  /** Hızlı maçta 1'e 1 sonuç sıralamaya işlenir. */
  private reportLadder() {
    const e = this.engine;
    if (!this.quick || e.winner === null) return;
    if (e.roster.length !== 2) return;
    const w = e.roster.find((m) => m.team === e.winner);
    const l = e.roster.find((m) => m.team !== e.winner);
    if (!w || !l) return;
    const stub = this.env.LADDER.get(this.env.LADDER.idFromName("global"));
    this.ctx.waitUntil(stub.report({ pid: w.id, name: w.name }, { pid: l.id, name: l.name }).then(() => undefined).catch(() => undefined));
  }

  private async afterChange() {
    if (this.engine.version !== this.sentVersion) this.broadcastState();
    if (this.engine.inMatch()) this.startLoop();
    else await this.persist();
  }

  private async persist() {
    if (this.engine.inMatch()) return;
    await this.ctx.storage.put("lobby", this.engine.persistable());
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (!ws.deserializeAttachment()) continue;
      try {
        ws.send(data);
      } catch {}
    }
  }

  private broadcastState() {
    this.sentVersion = this.engine.version;
    this.broadcast({ t: "st", k: this.engine.tick, s: this.engine.publicState() });
  }

  private broadcastSnapshot() {
    const e = this.engine;
    const p = [...e.players.entries()].map(([id, st]) => packPlayer(id, st));
    const a: Record<string, number> = {};
    for (const [id] of e.players) a[id] = this.acks.get(id) ?? -1;
    this.broadcast({ t: "s", k: e.tick, p, a });
  }
}
