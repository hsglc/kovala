import { CLIMB_COST, DIVE_COST, JUKE_COST, KICK_COST, PLAYER_RADIUS, ROLL_COST, QUAD_SIZE } from "./constants";
import type { QuadLayout } from "./maps";
import { ACT_CLIMB, ACT_KICK, ACT_ROLL, groundAt, nearWall, parkourPreview, wallJumpDir, type Input, type PlayerState } from "./sim";

/** Botla antrenman ve testlerde kullanılan basit yapay zekâ. */

const CELL = 0.25;
const N = Math.round(QUAD_SIZE / CELL);
const INF = 1e9;

interface Grid {
  /** 0 boş, 1 alçak engel (atlanabilir), 2 duvar */
  cells: Uint8Array;
}

const gridCache = new Map<string, Grid>();

function buildGrid(layout: QuadLayout): Grid {
  const cached = gridCache.get(layout.id);
  if (cached) return cached;
  const cells = new Uint8Array(N * N);
  const pad = PLAYER_RADIUS + 0.04;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const x = (gx + 0.5) * CELL;
      const y = (gy + 0.5) * CELL;
      let v = 0;
      for (const o of layout.obstacles) {
        if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) {
          v = Math.max(v, o.kind === "wall" ? 2 : 1);
        }
      }
      cells[gy * N + gx] = v;
    }
  }
  const g = { cells };
  gridCache.set(layout.id, g);
  return g;
}

const toCell = (v: number) => Math.max(0, Math.min(N - 1, Math.floor(v / CELL)));

let HEAP_I = new Int32Array(0);
let HEAP_P = new Float32Array(0);

/** Bir noktadan tüm hücrelere en kısa yol mesafesi (Dijkstra, 8 komşu). */
function distanceField(grid: Grid, sx: number, sy: number, boxCost: number): Float32Array {
  const dist = new Float32Array(N * N).fill(INF);
  const start = toCell(sy) * N + toCell(sx);
  dist[start] = 0;
  // Tipli dizilerle ikili yığın (her hücre en fazla 8 kez itilir).
  const cap = N * N * 8;
  const hi = HEAP_I.length >= cap ? HEAP_I : (HEAP_I = new Int32Array(cap));
  const hp = HEAP_P.length >= cap ? HEAP_P : (HEAP_P = new Float32Array(cap));
  let size = 0;
  const push = (i: number, p: number) => {
    let c = size++;
    while (c > 0) {
      const par = (c - 1) >> 1;
      if (hp[par] <= p) break;
      hi[c] = hi[par];
      hp[c] = hp[par];
      c = par;
    }
    hi[c] = i;
    hp[c] = p;
  };
  push(start, 0);
  while (size > 0) {
    const i = hi[0];
    const d = hp[0];
    size--;
    if (size > 0) {
      const li = hi[size];
      const lp = hp[size];
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        if (l >= size) break;
        const r = l + 1;
        const m = r < size && hp[r] < hp[l] ? r : l;
        if (hp[m] >= lp) break;
        hi[c] = hi[m];
        hp[c] = hp[m];
        c = m;
      }
      hi[c] = li;
      hp[c] = lp;
    }
    if (d > dist[i]) continue;
    const cx = i % N;
    const cy = (i / N) | 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        const c = grid.cells[ni];
        if (c === 2) continue;
        // çaprazda köşe kesmeyi engelle
        if (ox && oy && (grid.cells[cy * N + nx] === 2 || grid.cells[ny * N + cx] === 2)) continue;
        const step = (ox && oy ? Math.SQRT2 : 1) * CELL * (c === 1 ? boxCost : 1);
        const nd = d + step;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          push(ni, nd);
        }
      }
    }
  }
  return dist;
}

function sample(field: Float32Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x > QUAD_SIZE || y > QUAD_SIZE) return -INF;
  return field[toCell(y) * N + toCell(x)];
}

export type BotLevel = "kolay" | "orta" | "zor";

const LEVELS: Record<BotLevel, { period: number; speed: number; noise: number; dashChance: number }> = {
  kolay: { period: 8, speed: 0.82, noise: 0.35, dashChance: 0.35 },
  orta: { period: 5, speed: 0.93, noise: 0.15, dashChance: 0.7 },
  zor: { period: 3, speed: 1, noise: 0.04, dashChance: 1 },
};

export class Bot {
  private t = 0;
  private dir: [number, number] = [0, 0];
  private wantAct = false;
  private wantAct2 = false;
  private cfg: (typeof LEVELS)[BotLevel];
  private cacheKey = "";
  private cacheField: Float32Array | null = null;
  private goalKey = "";
  private goalField: Float32Array | null = null;

  private field(grid: Grid, layout: QuadLayout, x: number, y: number): Float32Array {
    const key = `${layout.id}:${toCell(x)}:${toCell(y)}`;
    if (key !== this.cacheKey || !this.cacheField) {
      this.cacheField = distanceField(grid, x, y, 1.4);
      this.cacheKey = key;
    }
    return this.cacheField;
  }

  constructor(
    public level: BotLevel = "orta",
    private rnd: () => number = Math.random,
  ) {
    this.cfg = LEVELS[level];
  }

  /** Zorluğu sürekli ayarla (Hayatta kal modu): 0 kolay … 1 en zor. */
  tune(k: number) {
    const a = LEVELS.kolay;
    const b = LEVELS.zor;
    const t = Math.max(0, Math.min(1, k));
    this.cfg = {
      period: Math.round(a.period + (b.period - a.period) * t),
      speed: a.speed + (b.speed - a.speed) * t,
      noise: a.noise + (b.noise - a.noise) * t,
      dashChance: a.dashChance + (b.dashChance - a.dashChance) * t,
    };
  }

  reset() {
    this.t = 0;
    this.dir = [0, 0];
  }

  /** role: botun rolü. self: botun state'i, other: rakibin state'i. */
  think(role: "chaser" | "evader", self: PlayerState, other: PlayerState, layout: QuadLayout): Input {
    const grid = buildGrid(layout);
    if (this.t % this.cfg.period === 0) {
      if (role === "chaser") this.decideChase(grid, self, other, layout);
      else this.decideEvade(grid, self, other, layout);
    }
    this.t++;
    let [dx, dy] = this.dir;
    // Kenar koruması: birkaç adım sonra saha dışına düşecekse içeri doğru kır.
    const fx = self.x + self.vx * 0.22 + dx * 0.35;
    const fy = self.y + self.vy * 0.22 + dy * 0.35;
    const m = 0.55;
    let ix = 0;
    let iy = 0;
    if (fx < m) ix = 1;
    else if (fx > QUAD_SIZE - m) ix = -1;
    if (fy < m) iy = 1;
    else if (fy > QUAD_SIZE - m) iy = -1;
    if (ix || iy) {
      if (ix) dx = ix * Math.max(Math.abs(dx), 0.6);
      if (iy) dy = iy * Math.max(Math.abs(dy), 0.6);
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      this.wantAct = false;
    }
    let act = this.wantAct;
    let act2 = this.wantAct2;
    this.wantAct = false;
    this.wantAct2 = false;
    if (act || act2) {
      // Aksiyon sonunda saha dışında kalacaksa basma.
      const ex = self.x + dx * 2.0;
      const ey = self.y + dy * 2.0;
      if (ex < 0.4 || ey < 0.4 || ex > QUAD_SIZE - 0.4 || ey > QUAD_SIZE - 0.4) {
        act = false;
        act2 = false;
      }
    }
    // Yüksekten düşerken takla at (sert inişte hız kaybetme)
    if (!act && self.hv < -2 && self.h - groundAt(self.x, self.y, layout) > 0.5 && self.st >= ROLL_COST) {
      if (parkourPreview(self, { mx: dx, my: dy, act: true, act2: false }, layout) === ACT_ROLL) act = true;
    }
    return { mx: dx * this.cfg.speed, my: dy * this.cfg.speed, act, act2 };
  }

  private noisy(dx: number, dy: number): [number, number] {
    const a = Math.atan2(dy, dx) + (this.rnd() - 0.5) * this.cfg.noise;
    return [Math.cos(a), Math.sin(a)];
  }

  private decideChase(grid: Grid, self: PlayerState, other: PlayerState, layout: QuadLayout) {
    const lead = 0.25;
    const tx = Math.max(0.2, Math.min(QUAD_SIZE - 0.2, other.x + other.vx * lead));
    const ty = Math.max(0.2, Math.min(QUAD_SIZE - 0.2, other.y + other.vy * lead));
    // Hedefin mesafe alanı: bottan hedefe giden en kısa yönü seç.
    const field = this.field(grid, layout, tx, ty);
    let best: [number, number] = [tx - self.x, ty - self.y];
    let bestScore = INF;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const px = self.x + dx * 0.6;
      const py = self.y + dy * 0.6;
      const v = sample(field, px, py);
      if (v < 0 || v >= INF) continue;
      if (v < bestScore) {
        bestScore = v;
        best = [dx, dy];
      }
    }
    const dist = Math.hypot(other.x - self.x, other.y - self.y);
    if (dist < 1.6) best = [other.x - self.x, other.y - self.y];
    const l = Math.hypot(best[0], best[1]) || 1;
    this.dir = this.noisy(best[0] / l, best[1] / l);

    const pk = parkourPreview(self, { mx: this.dir[0], my: this.dir[1], act: false, act2: false }, layout);
    if (pk === ACT_CLIMB && self.st >= CLIMB_COST && self.cd <= 0 && dist > 3 && this.rnd() < 0.5) {
      this.wantAct = true;
    } else if (dist < 1.9 && dist > 0.95 && self.st >= DIVE_COST && self.cd <= 0 && this.rnd() < this.cfg.dashChance) {
      // Dalış: rakip kaçış yönünde hızlanıyorsa değil, köşeye sıkıştıysa.
      this.wantAct2 = true;
    }
  }

  /**
   * WCT taktiği: bir kuleyi (duvar) kovalayanla arana al ve etrafında dön.
   * Hedef, kulenin kovalayana göre arka tarafındaki yörünge noktası; yakınsa yörüngede ilerler.
   * Kovalayan tüm kulelere senden yakınsa hedef yok (yerel kaçış çalışır).
   */
  private orbitGoal(self: PlayerState, other: PlayerState, layout: QuadLayout): [number, number] | null {
    let best: { c: [number, number]; r: number; score: number } | null = null;
    for (const o of layout.obstacles) {
      if (o.kind !== "wall") continue;
      const long = Math.max(o.w, o.h);
      if (long > 3.2) continue; // uzun sırt duvarı kule değildir
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const r = Math.hypot(o.w, o.h) / 2 + 0.65;
      if (cx - r < 0.7 || cy - r < 0.7 || cx + r > QUAD_SIZE - 0.7 || cy + r > QUAD_SIZE - 0.7) continue;
      const dm = Math.hypot(cx - self.x, cy - self.y);
      const dc = Math.hypot(cx - other.x, cy - other.y);
      if (dm > 9 || dc < dm - 0.6) continue;
      const score = dm - (dc - dm) * 0.4;
      if (!best || score < best.score) best = { c: [cx, cy], r, score };
    }
    if (!best) return null;
    const [cx, cy] = best.c;
    // Kovalayanın tam karşısı
    let a = Math.atan2(cy - other.y, cx - other.x);
    const myA = Math.atan2(self.y - cy, self.x - cx);
    const onOrbit = Math.abs(Math.hypot(self.x - cx, self.y - cy) - best.r) < 0.9;
    if (onOrbit) {
      // Yörüngedeysen karşı noktaya kısa yoldan, biraz önden git (dönmeyi sürdür)
      let d = a - myA;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 0.5) {
        // Zaten tam karşısındasın: durma, kovalayanın döndüğü yönde dönmeyi sürdür
        const rx = other.x - cx;
        const ry = other.y - cy;
        const w = rx * other.vy - ry * other.vx;
        a = myA + (w >= 0 ? 1 : -1) * 0.6;
      } else a = myA + Math.sign(d) * Math.min(Math.abs(d), 0.9);
    }
    return [cx + Math.cos(a) * best.r, cy + Math.sin(a) * best.r];
  }

  private decideEvade(grid: Grid, self: PlayerState, other: PlayerState, layout: QuadLayout) {
    const field = this.field(grid, layout, other.x, other.y);
    // Kovalayan uzaktayken alan kazan (yerel kaçış); yaklaşınca kuleyi arana al
    const goal = Math.hypot(other.x - self.x, other.y - self.y) < 6.5 ? this.orbitGoal(self, other, layout) : null;
    let goalField: Float32Array | null = null;
    if (goal) {
      const gk = `${layout.id}:${toCell(goal[0])}:${toCell(goal[1])}`;
      if (gk !== this.goalKey || !this.goalField) {
        this.goalField = distanceField(grid, goal[0], goal[1], 1.4);
        this.goalKey = gk;
      }
      goalField = this.goalField;
    }
    let best: [number, number] = [self.x - other.x, self.y - other.y];
    let bestScore = -INF;
    const curL = Math.hypot(self.vx, self.vy);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let score = 0;
      let ok = true;
      for (const reach of [0.5, 1.2, 2.0]) {
        const px = self.x + dx * reach;
        const py = self.y + dy * reach;
        const v = sample(field, px, py);
        if (v === -INF || v >= INF) {
          if (reach === 0.5) ok = false;
          score -= v === -INF ? 40 : 6;
          continue;
        }
        score += v * (reach === 2.0 ? 0.6 : 1) * (goal ? 0.25 : 1);
        // kenarlardan uzak dur
        const edge = Math.min(px, py, QUAD_SIZE - px, QUAD_SIZE - py);
        if (edge < 1.5) score -= (1.5 - edge) * 4;
      }
      if (!ok) continue;
      if (curL > 0.5) score += ((dx * self.vx + dy * self.vy) / curL) * 0.35;
      if (goalField) {
        // Yol mesafesi (düz çizgi değil): araya engel girince bot yerinde titreşmesin
        const gv = sample(goalField, self.x + dx * 1.0, self.y + dy * 1.0);
        if (gv > -INF && gv < INF) score -= gv * 3;
        else score -= 40;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [dx, dy];
      }
    }
    this.dir = this.noisy(best[0], best[1]);
    const dist = Math.hypot(other.x - self.x, other.y - self.y);
    const pk = parkourPreview(self, { mx: this.dir[0], my: this.dir[1], act: false, act2: false }, layout);
    if (pk === ACT_KICK && dist < 2 && self.st >= KICK_COST && self.cd <= 0) {
      // Sıçrama saha içinde bitsin
      const n = nearWall(self.x, self.y, layout);
      if (n) {
        const jd = wallJumpDir(this.dir[0], this.dir[1], n);
        const lx = self.x + jd[0] * 3;
        const ly = self.y + jd[1] * 3;
        if (lx > 0.6 && ly > 0.6 && lx < QUAD_SIZE - 0.6 && ly < QUAD_SIZE - 0.6) this.wantAct = true;
      }
    } else if (pk === ACT_CLIMB && self.st >= CLIMB_COST && self.cd <= 0 && dist > 2.5 && this.rnd() < 0.35) {
      this.wantAct = true;
    } else if (dist < 1.6 && self.st >= JUKE_COST && self.cd <= 0 && this.rnd() < this.cfg.dashChance) {
      this.wantAct2 = true;
    }
  }
}
