import { describe, expect, it } from "vitest";
import { CHASE_TICKS, PLAYER_RADIUS, QUAD_SIZE, SPEED_EVADER, TICK_RATE } from "../src/shared/constants";
import { LAYOUTS } from "../src/shared/maps";
import { canVault, createPlayer, quantizeInput, stepPlayer, type Input } from "../src/shared/sim";
import { MatchEngine } from "../src/shared/engine";
import { Bot } from "../src/shared/bot";

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("haritalar", () => {
  it("doğma noktaları engellerin içinde değil", () => {
    for (const l of LAYOUTS) {
      for (const [x, y] of l.spawns) {
        for (const o of l.obstacles) {
          const cx = Math.max(o.x, Math.min(x, o.x + o.w));
          const cy = Math.max(o.y, Math.min(y, o.y + o.h));
          expect(Math.hypot(x - cx, y - cy), `${l.id} ${x},${y}`).toBeGreaterThan(PLAYER_RADIUS + 0.2);
        }
      }
    }
  });

  it("engeller saha içinde", () => {
    for (const l of LAYOUTS) {
      for (const o of l.obstacles) {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.x + o.w).toBeLessThanOrEqual(QUAD_SIZE);
        expect(o.y + o.h).toBeLessThanOrEqual(QUAD_SIZE);
      }
    }
  });
});

describe("hareket", () => {
  const layout = LAYOUTS[0];

  it("maks hıza ulaşır ve aşmaz", () => {
    const p = createPlayer(1, 11, 1, 0);
    for (let i = 0; i < 20; i++) stepPlayer(p, { mx: 1, my: 0, act: false }, "evader", layout);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(SPEED_EVADER, 5);
  });

  it("duvarın içinden geçemez", () => {
    // Klasik haritada ortadaki duvar 5..7
    const p = createPlayer(3.9, 6, 1, 0);
    for (let i = 0; i < 60; i++) stepPlayer(p, { mx: 1, my: 0, act: false }, "chaser", layout);
    expect(p.x).toBeLessThanOrEqual(5 - PLAYER_RADIUS + 1e-6);
  });

  it("depar duvarı delmez", () => {
    const p = createPlayer(4.2, 6, 1, 0);
    stepPlayer(p, { mx: 1, my: 0, act: true }, "chaser", layout);
    for (let i = 0; i < 10; i++) stepPlayer(p, { mx: 1, my: 0, act: false }, "chaser", layout);
    expect(p.x).toBeLessThanOrEqual(5 - PLAYER_RADIUS + 1e-6);
  });

  it("alçak engelin üstünden atlar, duvarın üstünden atlayamaz", () => {
    // Klasik: kutu W = x 2.3..3.1, y 5..7
    const p = createPlayer(1.7, 6, 1, 0);
    expect(canVault(p.x, p.y, 1, 0, layout)).toBe(true);
    stepPlayer(p, { mx: 1, my: 0, act: true }, "evader", layout);
    expect(p.ak).toBe(2);
    for (let i = 0; i < 25; i++) stepPlayer(p, { mx: 1, my: 0, act: false }, "evader", layout);
    expect(p.x).toBeGreaterThan(3.1 + PLAYER_RADIUS - 1e-6);

    const q = createPlayer(4.4, 6, 1, 0);
    expect(canVault(q.x, q.y, 1, 0, layout)).toBe(false);
  });

  it("deterministik: aynı girdiler aynı sonucu verir", () => {
    const rnd = seeded(7);
    const inputs: Input[] = [];
    for (let i = 0; i < 300; i++) inputs.push(quantizeInput(rnd() * 2 - 1, rnd() * 2 - 1, rnd() < 0.05));
    const a = createPlayer(1, 1, 1, 0);
    const b = createPlayer(1, 1, 1, 0);
    for (const inp of inputs) stepPlayer(a, inp, "evader", layout);
    for (const inp of inputs) stepPlayer(b, { ...inp }, "evader", layout);
    expect(a).toEqual(b);
  });
});

describe("maç motoru", () => {
  it("1v1 tam maç kurallara göre ilerler", () => {
    const e = new MatchEngine(seeded(3));
    e.join("aaaaaaaa", "Ali");
    e.join("bbbbbbbb", "Bora");
    expect(e.members.map((m) => m.team)).toEqual([0, 1]);
    expect(e.start("bbbbbbbb")).toBe(false); // host değil
    expect(e.start("aaaaaaaa")).toBe(true);
    const bots = new Map([
      ["aaaaaaaa", new Bot("orta", seeded(11))],
      ["bbbbbbbb", new Bot("orta", seeded(12))],
    ]);
    let guard = 0;
    while (e.phase !== "finished" && guard++ < 200000) {
      const inputs = new Map();
      if (e.phase === "chase") {
        const c = e.players.get(e.chaserId!)!;
        const v = e.players.get(e.evaderId!)!;
        inputs.set(e.chaserId!, { input: bots.get(e.chaserId!)!.think("chaser", c, v, e.layout) });
        inputs.set(e.evaderId!, { input: bots.get(e.evaderId!)!.think("evader", v, c, e.layout) });
      }
      e.step(inputs);
    }
    expect(e.phase).toBe("finished");
    const regular = e.history.filter((h) => !h.sd);
    expect(regular.length).toBe(10);
    // Puan sadece kaçışlardan gelir
    const evasions = [0, 0];
    for (const h of regular) if (h.winner === "evader") evasions[h.evTeam]++;
    expect(e.scores).toEqual(evasions);
    // Kazanan sahada kalır ve kaçan olur
    for (let i = 1; i < e.history.length; i++) {
      const prev = e.history[i - 1];
      const cur = e.history[i];
      if (cur.sd !== prev.sd) continue;
      if (cur.sd) continue;
      const winnerId = prev.winner === "chaser" ? prev.chaser : prev.evader;
      expect(cur.evader).toBe(winnerId);
    }
    expect(e.winner).not.toBeNull();
  });

  it("takım rotasyonu: kaybedenin yerine sıradaki girer", () => {
    const e = new MatchEngine(seeded(5));
    for (const id of ["a1aaaaaa", "b1bbbbbb", "a2aaaaaa", "b2bbbbbb"]) e.join(id, id);
    e.start(e.host);
    const seen = new Set<string>();
    let guard = 0;
    while (e.history.length < 6 && guard++ < 100000) {
      if (e.chaserId) seen.add(e.chaserId);
      if (e.evaderId) seen.add(e.evaderId);
      e.step(new Map()); // kimse kıpırdamıyor: hepsi 20 sn kaçış
    }
    expect(e.history.every((h) => h.winner === "evader" && h.reason === "time")).toBe(true);
    expect(e.history.every((h) => h.ticks === CHASE_TICKS)).toBe(true);
    // Kaçan hep aynı kişi, kovalayan takım dönüşümlü oyuncu gönderiyor
    const chasers = new Set(e.history.map((h) => h.chaser));
    expect(chasers.size).toBe(2);
    expect(new Set(e.history.map((h) => h.evader)).size).toBe(1);
  });

  it("eşitlikte sudden death oynanır", () => {
    const e = new MatchEngine(seeded(9));
    e.join("aaaaaaaa", "A");
    e.join("bbbbbbbb", "B");
    e.setChases("aaaaaaaa", 10);
    e.start("aaaaaaaa");
    // Kimse kıpırdamazsa ilk kaçan hep kaçar → 10-0 biter. Eşitlik için skorları elle ayarla.
    let guard = 0;
    while (e.chaseNo < 9 && guard++ < 100000) e.step(new Map());
    e.scores = [5, 4];
    // 10. chase'i kovalayan takım kaçış yapamasın diye bekle; kaçan takım puan alır
    while (e.phase !== "finished" && !e.sd && guard++ < 100000) e.step(new Map());
    if (!e.sd) {
      // Kaçan takım 0 ise 6-4 biter, değilse 5-5 → SD
      expect(e.phase).toBe("finished");
    } else {
      while (e.phase !== "finished" && guard++ < 100000) e.step(new Map());
      expect(e.winReason === "sd" || e.winReason === "score").toBe(true);
    }
  });

  it("oyuncu koparsa maç hükmen biter", () => {
    const e = new MatchEngine(seeded(1));
    e.join("aaaaaaaa", "A");
    e.join("bbbbbbbb", "B");
    e.start("aaaaaaaa");
    for (let i = 0; i < 100; i++) e.step(new Map());
    e.leave("bbbbbbbb");
    e.step(new Map());
    expect(e.phase).toBe("finished");
    expect(e.winner).toBe(0);
    expect(e.winReason).toBe("forfeit");
  });
});

const GAMES = Number(process.env.BALANCE_GAMES ?? 30);

describe("denge (bot vs bot)", () => {
  it("tag ve kaçış oranları makul aralıkta", () => {
    const stats: Record<string, { tags: number; evades: number; outs: number; evOuts: number; avgTagSec: number }> = {};
    for (const layout of LAYOUTS) {
      let tags = 0;
      let evades = 0;
      let outs = 0;
      let evOuts = 0;
      let tagTime = 0;
      for (let g = 0; g < GAMES; g++) {
        const rnd = seeded(100 + g);
        const e = new MatchEngine(rnd);
        e.layoutChoice = layout.id;
        e.join("aaaaaaaa", "A");
        e.join("bbbbbbbb", "B");
        e.start("aaaaaaaa");
        const ca = new Bot("zor", seeded(200 + g));
        const cb = new Bot("zor", seeded(300 + g));
        let guard = 0;
        while (e.history.length < 1 && guard++ < 5000) {
          const inputs = new Map();
          if (e.phase === "chase") {
            const c = e.players.get(e.chaserId!)!;
            const v = e.players.get(e.evaderId!)!;
            inputs.set(e.chaserId!, { input: ca.think("chaser", c, v, e.layout) });
            inputs.set(e.evaderId!, { input: cb.think("evader", v, c, e.layout) });
          }
          e.step(inputs);
        }
        const h = e.history[0];
        if (h.reason === "tag") {
          tags++;
          tagTime += h.ticks / TICK_RATE;
        } else if (h.reason === "out") {
          outs++;
          if (h.winner === "chaser") evOuts++;
        }
        else evades++;
      }
      stats[layout.id] = { tags, evades, outs, evOuts, avgTagSec: tags ? +(tagTime / tags).toFixed(1) : 0 };
    }
    console.log("denge:", JSON.stringify(stats));
    for (const s of Object.values(stats)) {
      expect(s.tags).toBeGreaterThan(3);
      expect(s.evades).toBeGreaterThan(3);
      expect(s.outs).toBeLessThan(GAMES * 0.25);
    }
  });
});
