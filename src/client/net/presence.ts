import type { InviteEnd, PresencePlayer, PresenceServerMsg, PresenceStatus } from "../../shared/presence";

/**
 * Uygulama boyunca açık tek bağlantı: çevrimiçi listesi, gelen/giden davet.
 * Bağlantı koparsa artan aralıklarla yeniden bağlanır.
 */
export interface PresenceView {
  online: boolean;
  total: number;
  players: PresencePlayer[];
  incoming: { id: string; from: PresencePlayer; exp: number } | null;
  outgoing: { id: string; to: string; exp: number } | null;
  /** son davet sonucu / hata (kısa bildirim) */
  notice: { text: string; at: number } | null;
}

const END_TEXT: Record<InviteEnd, string> = {
  declined: "Davetini reddetti.",
  busy: "Şu an maçta, davet edilemiyor.",
  gone: "Oyuncu artık çevrimiçi değil.",
  expired: "Davetin süresi doldu.",
  cancelled: "Davet geri çekildi.",
};

export class PresenceClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private pingT: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private listeners = new Set<() => void>();
  private me: { n: string; l: number; s: PresenceStatus };
  private outTo = "";
  /** sunucudan son haber (pong dahil); ölü bağlantıyı yakalamak için */
  private heard = 0;
  view: PresenceView = { online: false, total: 0, players: [], incoming: null, outgoing: null, notice: null };
  /** Davet kabul edilince (iki tarafta da) oda koduyla çağrılır */
  onGo: ((code: string, withName: string) => void) | null = null;
  /** Yeni davet geldiğinde (ses, titreşim, sistem bildirimi) */
  onInvite: ((fromName: string) => void) | null = null;

  constructor(
    private wsBase: string,
    private pid: string,
    me: { n: string; l: number; s: PresenceStatus },
  ) {
    this.me = me;
    this.connect();
    // Telefon arka plandan dönünce bağlantı çoğu zaman sessizce ölmüştür: hemen yokla, cevap yoksa yeniden bağlan
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || this.closed) return;
      this.check();
    });
    window.addEventListener("online", () => this.check());
  }

  /** Bağlantıyı yokla; 2,5 sn içinde ses yoksa kapatıp hemen yeniden bağlan. */
  private check() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (!ws) {
        this.retry = 0;
        this.connect();
      }
      return;
    }
    const asked = Date.now();
    try {
      ws.send("ping");
    } catch {}
    setTimeout(() => {
      if (this.ws === ws && this.heard < asked) {
        this.ws = null;
        try {
          ws.close();
        } catch {}
        this.set({ online: false });
        this.retry = 0;
        this.connect();
      }
    }, 2500);
  }

  private connect() {
    if (this.closed) return;
    const q = new URLSearchParams({ pid: this.pid, name: this.me.n, lvl: String(this.me.l), s: this.me.s });
    const ws = new WebSocket(`${this.wsBase}/ws/presence?${q}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.set({ online: true });
      if (!this.pingT) this.pingT = setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.ws.send("ping"), 25_000);
    };
    ws.onmessage = (ev) => {
      this.heard = Date.now();
      if (typeof ev.data !== "string" || ev.data === "pong") return;
      let m: PresenceServerMsg;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onMsg(m);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.set({ online: false });
      if (this.closed || ev.code === 4000) return;
      const delay = Math.min(15_000, 600 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  private onMsg(m: PresenceServerMsg) {
    switch (m.t) {
      case "list":
        this.set({ total: m.total, players: m.p.filter((p) => p.id !== this.pid) });
        break;
      case "inv": {
        const fresh = this.view.incoming?.id !== m.id;
        this.set({ incoming: { id: m.id, from: m.from, exp: Date.now() + Math.max(0, m.exp - Date.now()) } });
        if (fresh) this.onInvite?.(m.from.n);
        break;
      }
      case "sent":
        this.set({ outgoing: { id: m.id, to: m.to, exp: m.exp } });
        break;
      case "go":
        this.set({ incoming: null, outgoing: null });
        this.onGo?.(m.code, m.with);
        break;
      case "end": {
        const v: Partial<PresenceView> = {};
        if (this.view.incoming?.id === m.id) v.incoming = null;
        if (this.view.outgoing?.id === m.id || m.id === "") {
          v.outgoing = null;
          const who = this.view.players.find((p) => p.id === (this.view.outgoing?.to ?? this.outTo))?.n;
          v.notice = { text: (who ? `${who}: ` : "") + END_TEXT[m.why], at: Date.now() };
        }
        this.set(v);
        break;
      }
      case "err":
        this.set({ notice: { text: m.m, at: Date.now() } });
        break;
    }
  }

  private send(o: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }

  private set(p: Partial<PresenceView>) {
    this.view = { ...this.view, ...p };
    for (const l of this.listeners) l();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getView = () => this.view;

  /** Ad, seviye ya da durum değişince */
  update(p: Partial<{ n: string; l: number; s: PresenceStatus }>) {
    const next = { ...this.me, ...p };
    if (next.n === this.me.n && next.l === this.me.l && next.s === this.me.s) return;
    this.me = next;
    this.send({ t: "me", ...next });
  }

  invite(pid: string) {
    this.outTo = pid;
    this.send({ t: "inv", to: pid });
  }

  answer(ok: boolean) {
    const inc = this.view.incoming;
    if (!inc) return;
    this.send({ t: "ans", id: inc.id, ok });
    if (!ok) this.set({ incoming: null });
  }

  cancel() {
    const out = this.view.outgoing;
    if (!out) return;
    this.send({ t: "cancel", id: out.id });
    this.set({ outgoing: null });
  }

  clearNotice() {
    this.set({ notice: null });
  }

  close() {
    this.closed = true;
    if (this.pingT) clearInterval(this.pingT);
    this.ws?.close(1000, "bye");
  }
}

let shared: PresenceClient | null = null;
export function presence(): PresenceClient | null {
  return shared;
}
export function startPresence(wsBase: string, pid: string, me: { n: string; l: number; s: PresenceStatus }) {
  if (!shared) shared = new PresenceClient(wsBase, pid, me);
  return shared;
}
