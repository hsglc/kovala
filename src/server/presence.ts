import { DurableObject } from "cloudflare:workers";
import { cleanName, isValidPid, randomRoomCode } from "../shared/protocol";
import { INVITABLE, INVITE_TTL_MS, isStatus, type PresenceClientMsg, type PresencePlayer, type PresenceServerMsg } from "../shared/presence";
import type { Env } from "./env";

interface Att {
  id: string;
  n: string;
  l: number;
  s: PresencePlayer["s"];
  /** listede görünsün mü (adı girilmiş) */
  named: boolean;
  /** son davet zamanı (sel sınırı) */
  lastInv: number;
  /** bekleyen giden davet */
  out: string | null;
}

interface Invite {
  id: string;
  from: string;
  to: string;
  code: string;
  exp: number;
}

const MAX_LIST = 60;

/**
 * Çevrimiçi oyuncular: her açık uygulama buraya bağlanır, durumunu bildirir.
 * Liste değişince (katılma, ayrılma, durum) yarım saniye toplanıp herkese yayınlanır.
 * Davetler depoda tutulur (hibernation'da kaybolmasın) ve 30 sn sonra düşer.
 */
export class Presence extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket bekleniyor", { status: 426 });
    const url = new URL(request.url);
    const pid = url.searchParams.get("pid");
    if (!isValidPid(pid)) return new Response("Geçersiz oyuncu", { status: 400 });
    const rawName = url.searchParams.get("name") ?? "";
    const lvl = Math.max(1, Math.min(999, Math.floor(Number(url.searchParams.get("lvl")) || 1)));
    const st = url.searchParams.get("s");

    // Aynı oyuncunun eski bağlantısı (başka sekme) kapanır
    for (const old of this.ctx.getWebSockets(pid)) {
      old.serializeAttachment(null);
      try {
        old.close(4000, "replaced");
      } catch {}
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [pid]);
    const att: Att = { id: pid, n: cleanName(rawName), l: lvl, s: isStatus(st) ? st : "menu", named: rawName.trim().length > 0, lastInv: 0, out: null };
    server.serializeAttachment(att);
    this.send(server, { t: "list", ...(await this.snapshot()) });
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 400) return;
    let msg: PresenceClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const me = ws.deserializeAttachment() as Att | null;
    if (!me) return;
    const now = Date.now();
    switch (msg.t) {
      case "me": {
        const n = typeof msg.n === "string" ? msg.n : "";
        const next: Att = { ...me, n: cleanName(n), named: n.trim().length > 0, l: Math.max(1, Math.min(999, Math.floor(Number(msg.l)) || 1)), s: isStatus(msg.s) ? msg.s : me.s };
        ws.serializeAttachment(next);
        if (next.n !== me.n || next.s !== me.s || next.l !== me.l || next.named !== me.named) await this.schedule();
        break;
      }
      case "inv": {
        if (typeof msg.to !== "string" || msg.to === me.id) return;
        if (now - me.lastInv < 2000) return this.send(ws, { t: "err", m: "Biraz bekle, sonra tekrar davet et." });
        if (me.out) {
          const pend = await this.ctx.storage.get<Invite>(`i:${me.out}`);
          if (pend && pend.exp > now) return this.send(ws, { t: "err", m: "Önce bekleyen davetin sonuçlansın." });
        }
        const target = this.socketOf(msg.to);
        const tAtt = target?.deserializeAttachment() as Att | null;
        if (!target || !tAtt) return this.send(ws, { t: "end", id: "", why: "gone" });
        if (!INVITABLE.includes(tAtt.s)) return this.send(ws, { t: "end", id: "", why: "busy" });
        const inv: Invite = { id: crypto.randomUUID().slice(0, 12), from: me.id, to: tAtt.id, code: randomRoomCode(), exp: now + INVITE_TTL_MS };
        await this.ctx.storage.put(`i:${inv.id}`, inv);
        ws.serializeAttachment({ ...me, lastInv: now, out: inv.id });
        this.send(target, { t: "inv", id: inv.id, from: this.pub(me), exp: inv.exp });
        this.send(ws, { t: "sent", id: inv.id, to: tAtt.id, exp: inv.exp });
        await this.schedule(inv.exp + 200);
        break;
      }
      case "ans": {
        if (typeof msg.id !== "string") return;
        const inv = await this.ctx.storage.get<Invite>(`i:${msg.id}`);
        if (!inv || inv.to !== me.id) return;
        await this.ctx.storage.delete(`i:${inv.id}`);
        const from = this.socketOf(inv.from);
        this.clearOut(from, inv.id);
        if (inv.exp < now) {
          this.send(ws, { t: "end", id: inv.id, why: "expired" });
          if (from) this.send(from, { t: "end", id: inv.id, why: "expired" });
          return;
        }
        if (!msg.ok) {
          if (from) this.send(from, { t: "end", id: inv.id, why: "declined" });
          return;
        }
        if (!from) return this.send(ws, { t: "end", id: inv.id, why: "gone" });
        const fAtt = from.deserializeAttachment() as Att;
        this.send(from, { t: "go", id: inv.id, code: inv.code, with: me.n });
        this.send(ws, { t: "go", id: inv.id, code: inv.code, with: fAtt.n });
        break;
      }
      case "cancel": {
        if (typeof msg.id !== "string") return;
        const inv = await this.ctx.storage.get<Invite>(`i:${msg.id}`);
        if (!inv || inv.from !== me.id) return;
        await this.ctx.storage.delete(`i:${inv.id}`);
        ws.serializeAttachment({ ...me, out: null });
        const to = this.socketOf(inv.to);
        if (to) this.send(to, { t: "end", id: inv.id, why: "cancelled" });
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.left(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.left(ws);
  }

  /** Toplanmış yayın + süresi dolan davetler */
  async alarm() {
    const now = Date.now();
    const all = await this.ctx.storage.list<Invite>({ prefix: "i:" });
    let next = 0;
    for (const [k, inv] of all) {
      if (inv.exp <= now) {
        await this.ctx.storage.delete(k);
        const from = this.socketOf(inv.from);
        this.clearOut(from, inv.id);
        if (from) this.send(from, { t: "end", id: inv.id, why: "expired" });
        const to = this.socketOf(inv.to);
        if (to) this.send(to, { t: "end", id: inv.id, why: "expired" });
      } else next = next ? Math.min(next, inv.exp) : inv.exp;
    }
    if ((await this.ctx.storage.get<boolean>("dirty")) === true) {
      await this.ctx.storage.delete("dirty");
      const snap = await this.snapshot();
      const data = JSON.stringify({ t: "list", ...snap } satisfies PresenceServerMsg);
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(data);
        } catch {}
      }
    }
    if (next) await this.ctx.storage.setAlarm(next + 200);
  }

  // ---------- yardımcılar ----------

  private async left(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Att | null;
    ws.serializeAttachment(null);
    if (a) await this.schedule();
  }

  /** Listeyi kirli işaretle ve kısa süre sonra yayınla (birden çok değişiklik tek mesaj) */
  private async schedule(at?: number) {
    if (!at) await this.ctx.storage.put("dirty", true);
    const want = at ?? Date.now() + 500;
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > want) await this.ctx.storage.setAlarm(want);
  }

  private async snapshot(): Promise<{ total: number; p: PresencePlayer[] }> {
    const order: Record<PresencePlayer["s"], number> = { menu: 0, practice: 1, room: 2, queue: 3, match: 4 };
    const list: PresencePlayer[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Att | null;
      if (a && a.named) list.push(this.pub(a));
    }
    list.sort((x, y) => order[x.s] - order[y.s] || y.l - x.l);
    return { total: list.length, p: list.slice(0, MAX_LIST) };
  }

  private pub(a: Att): PresencePlayer {
    return { id: a.id, n: a.n, l: a.l, s: a.s };
  }

  private socketOf(pid: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets(pid)) if (ws.deserializeAttachment()) return ws;
    return null;
  }

  private clearOut(ws: WebSocket | null, id: string) {
    if (!ws) return;
    const a = ws.deserializeAttachment() as Att | null;
    if (a && a.out === id) ws.serializeAttachment({ ...a, out: null });
  }

  private send(ws: WebSocket, msg: PresenceServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
}
