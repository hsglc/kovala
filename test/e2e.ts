import { RoomClient } from "../src/client/net/RoomClient";
import { Bot } from "../src/shared/bot";

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");
const LAT = Number(process.env.LAT ?? 50);
const JIT = Number(process.env.JIT ?? 15);

// Gecikme + jitter ekleyen WebSocket sarmalayıcı (sıra bozulmadan).
const RealWS = globalThis.WebSocket;
class LaggyWS {
  static OPEN = 1;
  inner: WebSocket;
  onopen: any = null; onmessage: any = null; onclose: any = null; onerror: any = null;
  private inT = 0; private outT = 0;
  constructor(url: string) {
    this.inner = new RealWS(url);
    const delay = (cb: () => void, dir: "in" | "out") => {
      const now = performance.now();
      const t = Math.max(dir === "in" ? this.inT : this.outT, now + LAT + Math.random() * JIT);
      if (dir === "in") this.inT = t; else this.outT = t;
      setTimeout(cb, t - now);
    };
    this.inner.onopen = (e) => delay(() => this.onopen?.(e), "in");
    this.inner.onmessage = (e) => { const d = e.data; delay(() => this.onmessage?.({ data: d }), "in"); };
    this.inner.onclose = (e) => { const ev = { code: e.code, reason: e.reason }; delay(() => this.onclose?.(ev), "in"); };
    (this as any)._delay = delay;
  }
  get readyState() { return this.inner.readyState; }
  send(d: string) { (this as any)._delay(() => this.inner.readyState === 1 && this.inner.send(d), "out"); }
  close(c?: number, r?: string) { this.inner.close(c, r); }
}
(globalThis as any).WebSocket = LaggyWS;

const DEBUG: RoomClient[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms: number, what: string) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) {
      for (const c of DEBUG) console.log("    [debug]", c.selfId, c.getStatus(), c.getError(), JSON.stringify(c.getState()?.members));
      throw new Error("Zaman aşımı: " + what);
    }
    await sleep(20);
  }
}
function assert(c: any, m: string) { if (!c) throw new Error("BAŞARISIZ: " + m); console.log("  ✓ " + m); }

async function main() {
  const h = await fetch(BASE + "/api/health").then((r) => r.json());
  assert(h.ok, "health endpoint");
  const { code } = await fetch(BASE + "/api/room", { method: "POST" }).then((r) => r.json());
  assert(/^[A-Z0-9]{5}$/.test(code), "oda kodu üretildi: " + code);

  const A = new RoomClient({ wsBase: WS_BASE, code, pid: "playerAAAA01", name: "Ali" });
  const B = new RoomClient({ wsBase: WS_BASE, code, pid: "playerBBBB02", name: "Bora" });
  DEBUG.push(A, B);
  await waitFor(() => A.getState()?.members.length === 2 && B.getState()?.members.length === 2, 5000, "iki oyuncu lobide");
  const st = A.getState()!;
  assert(st.host === "playerAAAA01", "ilk giren kurucu");
  assert(new Set(st.members.map((m) => m.team)).size === 2, "oyuncular farklı takımlarda");

  // Takım değiştirme ve geri alma
  B.switchTeam();
  await waitFor(() => A.getState()!.members.every((m) => m.team === 0), 3000, "takım değişti");
  assert(true, "takım değiştirme yayıldı");
  B.switchTeam();
  await waitFor(() => new Set(A.getState()!.members.map((m) => m.team)).size === 2, 3000, "takım geri alındı");

  // Kurucu olmayan başlatamaz
  B.start();
  await sleep(400);
  assert(A.getState()!.phase === "lobby", "kurucu olmayan başlatamıyor");

  // Lobide yeniden bağlanma
  B.close();
  await waitFor(() => A.getState()!.members.length === 1, 3000, "B ayrıldı");
  const B2 = new RoomClient({ wsBase: WS_BASE, code, pid: "playerBBBB02", name: "Bora" });
  await waitFor(() => A.getState()!.members.length === 2, 3000, "B geri döndü");
  assert(true, "çıkış ve yeniden giriş çalışıyor");

  A.start();
  await waitFor(() => A.getState()!.phase === "countdown", 3000, "maç başladı");
  assert(true, "kurucu maçı başlattı");

  const clients = [A, B2];
  const bots = new Map([[A, new Bot("zor")], [B2, new Bot("zor")]]);
  const loop = setInterval(() => {
    const now = performance.now();
    for (const c of clients) {
      const f = c.frame(now);
      const s = c.getState();
      if (!s || s.phase !== "chase") continue;
      const role = s.chaserId === c.selfId ? "chaser" : s.evaderId === c.selfId ? "evader" : null;
      if (!role || !f.self) continue;
      const oppId = role === "chaser" ? s.evaderId! : s.chaserId!;
      const opp = f.players.get(oppId);
      if (!opp) continue;
      const inp = bots.get(c)!.think(role, f.self, opp, c.layout());
      c.setMove(inp.mx, inp.my);
      if (inp.act) c.pressAction();
      if (inp.act2) c.pressAction2();
    }
  }, 16);

  const t0 = Date.now();
  let lastChase = -1;
  await waitFor(() => {
    const s = A.getState()!;
    if (s.history.length !== lastChase) {
      lastChase = s.history.length;
      const l = s.last;
      if (l) console.log(`    chase ${l.n}${l.sd ? " (SD)" : ""}: ${l.winner === "chaser" ? "kovalayan" : "kaçan"} kazandı (${l.reason}, ${(l.ticks / 30).toFixed(1)} sn) skor ${s.scores.join("-")}`);
    }
    return s.phase === "finished";
  }, 420000, "maç bitti");
  clearInterval(loop);
  await waitFor(() => B2.getState()?.phase === "finished", 5000, "B maç sonunu gördü");
  const fa = A.getState()!, fb = B2.getState()!;
  assert(fb.phase === "finished", "iki istemci de maç sonunu gördü");
  assert(fa.scores.join() === fb.scores.join(), `skorlar aynı: ${fa.scores.join("-")}`);
  assert(fa.history.filter((x) => !x.sd).length === 16, "16 chase oynandı");
  console.log(`    maç süresi ${((Date.now() - t0) / 1000).toFixed(0)} sn, kazanan takım ${fa.winner} (${fa.winReason})`);
  for (const c of clients) {
    console.log(`    ${c.selfId}: ping ${c.getPing()} ms, tahmin düzeltmesi ${c.corrections} kez, en büyük ${c.maxCorrection.toFixed(3)} m`);
  }
  assert(Math.max(A.maxCorrection, B2.maxCorrection) < 1.0, "tahmin düzeltmeleri küçük (<1 m)");

  // Rövanş
  A.start();
  await waitFor(() => A.getState()!.phase === "countdown", 3000, "rövanş başladı");
  assert(true, "rövanş başlıyor");
  // Maç sırasında rakip koparsa hükmen galibiyet
  B2.close();
  await waitFor(() => A.getState()!.phase === "finished", 8000, "hükmen bitiş");
  assert(A.getState()!.winReason === "forfeit", "rakip kopunca hükmen galibiyet");
  A.close();

  // Hızlı maç
  const q = (pid: string) =>
    new Promise<string>((res, rej) => {
      const ws = new RealWS(`${WS_BASE}/ws/quick?pid=${pid}&name=Q`);
      ws.onmessage = (e) => { const m = JSON.parse(e.data as string); if (m.t === "matched") { ws.close(); res(m.code); } };
      ws.onerror = () => rej(new Error("quick ws hata"));
    });
  const [c1, c2] = await Promise.all([q("quickAAAA01"), (async () => { await sleep(300); return q("quickBBBB02"); })()]);
  assert(c1 === c2, "hızlı maç iki oyuncuyu aynı odaya eşleştirdi: " + c1);
  const QA = new RoomClient({ wsBase: WS_BASE, code: c1, pid: "quickAAAA01", name: "QA", quick: true });
  const QB = new RoomClient({ wsBase: WS_BASE, code: c1, pid: "quickBBBB02", name: "QB", quick: true });
  await waitFor(() => QA.getState()?.phase === "countdown", 5000, "hızlı maç otomatik başladı");
  assert(true, "hızlı maç odası otomatik başladı");
  QA.close(); QB.close();
  console.log("\nTÜM E2E TESTLERİ GEÇTİ");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
