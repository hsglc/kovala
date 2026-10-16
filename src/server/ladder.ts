import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/**
 * Sıralama: tek global DO, SQLite. Sadece Hızlı Maç (rastgele eşleşme) sonuçları puanlanır,
 * böylece arkadaşla oda kurup puan kasılamaz. Elo, K=32, başlangıç 1000.
 * Haftalık tablo: bu hafta kazanılan maç sayısı (hafta Pazartesi başlar, UTC).
 */
export type LadderRow = {
  pid: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  wweek: number;
  week: number;
};

export interface LadderView {
  week: number;
  top: Omit<LadderRow, "pid" | "week">[];
  weekly: Omit<LadderRow, "pid" | "week">[];
  me: (Omit<LadderRow, "pid"> & { rank: number }) | null;
}

const START = 1000;
const K = 32;

export function weekId(now = Date.now()) {
  // 1 Ocak 1970 Perşembe; +3 gün kaydırınca haftalar Pazartesi başlar
  return Math.floor((now / 86400000 + 3) / 7);
}

export function elo(ra: number, rb: number, scoreA: 0 | 1) {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const d = Math.round(K * (scoreA - ea));
  return { a: ra + d, b: rb - d, d };
}

export class Ladder extends DurableObject<Env> {
  private sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
      pid TEXT PRIMARY KEY, name TEXT NOT NULL, rating INTEGER NOT NULL, wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0, wweek INTEGER NOT NULL DEFAULT 0, week INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS by_rating ON players(rating DESC)`);
  }

  private get(pid: string, name: string): LadderRow {
    const r = this.sql.exec<LadderRow>(`SELECT * FROM players WHERE pid = ?`, pid).toArray()[0];
    const w = weekId();
    if (r) return { ...r, name: name || r.name, wweek: r.week === w ? r.wweek : 0, week: w };
    return { pid, name: name || "Oyuncu", rating: START, wins: 0, losses: 0, wweek: 0, week: w };
  }

  private put(r: LadderRow) {
    this.sql.exec(
      `INSERT INTO players (pid, name, rating, wins, losses, wweek, week) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pid) DO UPDATE SET name=excluded.name, rating=excluded.rating, wins=excluded.wins,
       losses=excluded.losses, wweek=excluded.wweek, week=excluded.week`,
      r.pid,
      r.name,
      r.rating,
      r.wins,
      r.losses,
      r.wweek,
      r.week,
    );
  }

  /** Bir hızlı maç sonucu. Döndürülen d: kazananın puan değişimi. */
  async report(winner: { pid: string; name: string }, loser: { pid: string; name: string }) {
    if (winner.pid === loser.pid) return { d: 0 };
    const a = this.get(winner.pid, winner.name);
    const b = this.get(loser.pid, loser.name);
    const r = elo(a.rating, b.rating, 1);
    a.rating = r.a;
    b.rating = Math.max(100, r.b);
    a.wins++;
    a.wweek++;
    b.losses++;
    this.put(a);
    this.put(b);
    return { d: r.d };
  }

  async view(pid: string | null): Promise<LadderView> {
    const w = weekId();
    const cols = "name, rating, wins, losses, wweek";
    const top = this.sql.exec<Omit<LadderRow, "pid" | "week">>(`SELECT ${cols} FROM players ORDER BY rating DESC, wins DESC LIMIT 20`).toArray();
    const weekly = this.sql
      .exec<Omit<LadderRow, "pid" | "week">>(`SELECT ${cols} FROM players WHERE week = ? AND wweek > 0 ORDER BY wweek DESC, rating DESC LIMIT 20`, w)
      .toArray();
    let me: LadderView["me"] = null;
    if (pid) {
      const r = this.sql.exec<LadderRow>(`SELECT * FROM players WHERE pid = ?`, pid).toArray()[0];
      if (r) {
        const rank = (this.sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM players WHERE rating > ?`, r.rating).one().c ?? 0) + 1;
        me = { name: r.name, rating: r.rating, wins: r.wins, losses: r.losses, wweek: r.week === w ? r.wweek : 0, week: w, rank };
      }
    }
    return { week: w, top, weekly, me };
  }
}
