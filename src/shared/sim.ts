import {
  ACCEL_CHASER,
  ACCEL_EVADER,
  ACTION_COOLDOWN,
  CLIMB_COST,
  CLIMB_MAX_TIME,
  CLIMB_SPEED,
  DIVE_COST,
  DIVE_REACH,
  DIVE_SPEED,
  DIVE_TIME,
  DT,
  JUKE_COST,
  JUKE_SPEED,
  JUKE_TIME,
  KICK_COST,
  KICK_RANGE,
  KICK_SPEED,
  KICK_TIME,
  PLAYER_RADIUS,
  QUAD_SIZE,
  SPEED_CHASER,
  SPEED_EVADER,
  STAMINA_MAX,
  STAMINA_REGEN,
  STUMBLE_TIME,
  TAG_REACH,
  VAULT_AUTO_SPEED,
  VAULT_MAX_TIME,
  VAULT_MIN_TIME,
  VAULT_PROBE,
  VAULT_SPEED,
} from "./constants";
import { insideQuad, type Obstacle, type QuadLayout } from "./maps";

/**
 * Bir tick'lik oyuncu girdisi.
 * mx,my: -1..1 analog yön. act: PARKUR tuşu (tırman / atla / sek). act2: rol tuşu (dalış / sıçra).
 */
export interface Input {
  mx: number;
  my: number;
  act: boolean;
  act2: boolean;
}

export const NEUTRAL_INPUT: Input = { mx: 0, my: 0, act: false, act2: false };

export const ACT_NONE = 0;
export const ACT_VAULT = 1; // speed vault (yandan)
export const ACT_KONG = 2; // kong vault (önden, çömelerek)
export const ACT_CLIMB = 3;
export const ACT_KICK = 4;
export const ACT_DIVE = 5;
export const ACT_STUMBLE = 6;
export const ACT_JUKE = 7;

export type Role = "chaser" | "evader";

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** stamina 0..100 */
  st: number;
  /** aktif aksiyon (ACT_*) */
  ak: number;
  /** aksiyon başlangıcından beri geçen süre */
  at: number;
  /** aksiyon yönü */
  dx: number;
  dy: number;
  /** aksiyon bekleme süresi */
  cd: number;
  /** bakış yönü */
  fx: number;
  fy: number;
}

export function createPlayer(x: number, y: number, faceX: number, faceY: number): PlayerState {
  const l = Math.hypot(faceX, faceY) || 1;
  return { x, y, vx: 0, vy: 0, st: STAMINA_MAX, ak: 0, at: 0, dx: 0, dy: 0, cd: 0, fx: faceX / l, fy: faceY / l };
}

export function clonePlayer(p: PlayerState): PlayerState {
  return { ...p };
}

/** Joystick değerini 1 uzunluğa kırpar ve 2 hanede yuvarlar; istemci ve sunucu aynı değeri görür. */
export function quantizeInput(mx: number, my: number, act: boolean, act2 = false): Input {
  let l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
    l = 1;
  }
  if (l < 0.08) {
    mx = 0;
    my = 0;
  }
  return { mx: Math.round(mx * 100) / 100, my: Math.round(my * 100) / 100, act, act2 };
}

function pointInRect(px: number, py: number, o: Obstacle, pad: number): boolean {
  return px >= o.x - pad && px <= o.x + o.w + pad && py >= o.y - pad && py <= o.y + o.h + pad;
}

function circleOverlapsRect(x: number, y: number, r: number, o: Obstacle): boolean {
  const cx = Math.max(o.x, Math.min(x, o.x + o.w));
  const cy = Math.max(o.y, Math.min(y, o.y + o.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

export function overlapsAny(x: number, y: number, layout: QuadLayout, kind?: Obstacle["kind"]): boolean {
  for (const o of layout.obstacles) {
    if (kind && o.kind !== kind) continue;
    if (circleOverlapsRect(x, y, PLAYER_RADIUS, o)) return true;
  }
  return false;
}

/** dir yönünde önümüzdeki ilk engelin türü (yoksa null). */
export function obstacleAhead(x: number, y: number, dirX: number, dirY: number, layout: QuadLayout, probe = VAULT_PROBE): Obstacle["kind"] | null {
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const d = PLAYER_RADIUS * 0.5 + (probe + PLAYER_RADIUS * 0.5) * (i / steps);
    const px = x + dirX * d;
    const py = y + dirY * d;
    for (const o of layout.obstacles) {
      if (pointInRect(px, py, o, 0.04)) return o.kind;
    }
  }
  return null;
}

export function canVault(x: number, y: number, dirX: number, dirY: number, layout: QuadLayout): boolean {
  return obstacleAhead(x, y, dirX, dirY, layout) === "box";
}

/** Sırtımıza yakın bir duvar var mı (sekmek için)? Duvarın normalini döndürür. */
export function wallBehind(x: number, y: number, dirX: number, dirY: number, layout: QuadLayout): [number, number] | null {
  const px = x - dirX * KICK_RANGE;
  const py = y - dirY * KICK_RANGE;
  for (const o of layout.obstacles) {
    if (o.kind !== "wall") continue;
    if (!pointInRect(px, py, o, 0.05)) continue;
    const cx = Math.max(o.x, Math.min(x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(y, o.y + o.h));
    let nx = x - cx;
    let ny = y - cy;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    return [nx, ny];
  }
  return null;
}

/** PARKUR tuşu şu an ne yapar? (UI etiketi ve sim için aynı mantık) */
export function parkourPreview(p: PlayerState, input: Input, layout: QuadLayout): number {
  const l = Math.hypot(input.mx, input.my);
  const dx = l > 0.05 ? input.mx / l : p.fx;
  const dy = l > 0.05 ? input.my / l : p.fy;
  const ahead = obstacleAhead(p.x, p.y, dx, dy, layout, VAULT_PROBE + 0.25);
  if (ahead === "wall") return ACT_CLIMB;
  if (ahead === "box") return ACT_VAULT;
  if (wallBehind(p.x, p.y, dx, dy, layout)) return ACT_KICK;
  return ACT_NONE;
}

export function roleAction(role: Role): number {
  return role === "chaser" ? ACT_DIVE : ACT_JUKE;
}

function resolveCollisions(p: PlayerState, layout: QuadLayout, ignore: "box" | "all" | null) {
  if (ignore === "all") return;
  const r = PLAYER_RADIUS;
  for (let iter = 0; iter < 2; iter++) {
    for (const o of layout.obstacles) {
      if (ignore === "box" && o.kind === "box") continue;
      const cx = Math.max(o.x, Math.min(p.x, o.x + o.w));
      const cy = Math.max(o.y, Math.min(p.y, o.y + o.h));
      let nx = p.x - cx;
      let ny = p.y - cy;
      const d2 = nx * nx + ny * ny;
      if (d2 >= r * r) continue;
      let pen: number;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        nx /= d;
        ny /= d;
        pen = r - d;
      } else {
        const left = p.x - o.x;
        const right = o.x + o.w - p.x;
        const top = p.y - o.y;
        const bottom = o.y + o.h - p.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) {
          nx = -1; ny = 0; pen = left + r;
        } else if (m === right) {
          nx = 1; ny = 0; pen = right + r;
        } else if (m === top) {
          nx = 0; ny = -1; pen = top + r;
        } else {
          nx = 0; ny = 1; pen = bottom + r;
        }
      }
      p.x += nx * pen;
      p.y += ny * pen;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= vn * nx;
        p.vy -= vn * ny;
      }
    }
  }
}

export interface StepResult {
  out: boolean;
  /** bu tick başlayan aksiyon (efekt/ses için) */
  started: number;
}

function begin(p: PlayerState, ak: number, dx: number, dy: number, cost: number) {
  p.ak = ak;
  p.at = 0;
  p.dx = dx;
  p.dy = dy;
  p.fx = dx;
  p.fy = dy;
  p.st -= cost;
}

/**
 * Tek oyuncuyu bir tick ilerletir. Deterministik: aynı state + input → aynı sonuç.
 * İstemci tahmini (prediction) ve sunucu bu fonksiyonu birebir aynı çalıştırır.
 */
export function stepPlayer(p: PlayerState, input: Input, role: Role, layout: QuadLayout): StepResult {
  const maxSpeed = role === "chaser" ? SPEED_CHASER : SPEED_EVADER;
  const accel = role === "chaser" ? ACCEL_CHASER : ACCEL_EVADER;
  let started = 0;
  p.cd = Math.max(0, p.cd - DT);
  const il = Math.hypot(input.mx, input.my);
  const free = p.ak === 0;
  if (il > 0.05 && free) {
    p.fx = input.mx / il;
    p.fy = input.my / il;
  }
  const dx = il > 0.05 ? input.mx / il : p.fx;
  const dy = il > 0.05 ? input.my / il : p.fy;
  const speed = Math.hypot(p.vx, p.vy);

  // ---- Aksiyon başlatma ----
  if (free && p.cd <= 0) {
    if (input.act2) {
      if (role === "chaser" && p.st >= DIVE_COST) {
        begin(p, ACT_DIVE, dx, dy, DIVE_COST);
      } else if (role === "evader" && p.st >= JUKE_COST) {
        begin(p, ACT_JUKE, dx, dy, JUKE_COST);
      }
    } else if (input.act) {
      const kind = parkourPreview(p, input, layout);
      if (kind === ACT_CLIMB && p.st >= CLIMB_COST) begin(p, ACT_CLIMB, dx, dy, CLIMB_COST);
      else if (kind === ACT_VAULT) begin(p, vaultStyle(p), dx, dy, 0);
      else if (kind === ACT_KICK && p.st >= KICK_COST) {
        const n = wallBehind(p.x, p.y, dx, dy, layout)!;
        begin(p, ACT_KICK, n[0], n[1], KICK_COST);
      }
    }
    if (p.ak !== 0) started = p.ak;
  }
  // Otomatik atlama: koşarak kutuya girince kendiliğinden aşar.
  if (p.ak === 0 && speed >= VAULT_AUTO_SPEED && il > 0.05) {
    const vx = p.vx / speed;
    const vy = p.vy / speed;
    if (obstacleAhead(p.x, p.y, vx, vy, layout, 0.3) === "box") {
      begin(p, vaultStyle(p), vx, vy, 0);
      started = p.ak;
    }
  }

  // ---- Hız ----
  switch (p.ak) {
    case ACT_VAULT:
    case ACT_KONG:
      p.vx = p.dx * VAULT_SPEED;
      p.vy = p.dy * VAULT_SPEED;
      break;
    case ACT_CLIMB:
      p.vx = p.dx * CLIMB_SPEED;
      p.vy = p.dy * CLIMB_SPEED;
      break;
    case ACT_KICK:
      p.vx = p.dx * KICK_SPEED;
      p.vy = p.dy * KICK_SPEED;
      break;
    case ACT_DIVE:
      p.vx = p.dx * DIVE_SPEED;
      p.vy = p.dy * DIVE_SPEED;
      break;
    case ACT_JUKE:
      p.vx = p.dx * JUKE_SPEED;
      p.vy = p.dy * JUKE_SPEED;
      break;
    default: {
      const k = p.ak === ACT_STUMBLE ? 0.25 : 1;
      const tx = input.mx * maxSpeed * k;
      const ty = input.my * maxSpeed * k;
      let ddx = tx - p.vx;
      let ddy = ty - p.vy;
      const dl = Math.hypot(ddx, ddy);
      const maxDv = accel * DT * (p.ak === ACT_STUMBLE ? 0.6 : 1);
      if (dl > maxDv) {
        ddx = (ddx / dl) * maxDv;
        ddy = (ddy / dl) * maxDv;
      }
      p.vx += ddx;
      p.vy += ddy;
      if (p.ak === 0) p.st = Math.min(STAMINA_MAX, p.st + STAMINA_REGEN * DT);
    }
  }

  // ---- Hareket + çarpışma (iki alt adım) ----
  const ignore = p.ak === ACT_VAULT || p.ak === ACT_KONG ? "box" : p.ak === ACT_CLIMB ? "all" : null;
  for (let s = 0; s < 2; s++) {
    p.x += (p.vx * DT) / 2;
    p.y += (p.vy * DT) / 2;
    resolveCollisions(p, layout, ignore);
  }
  // Düz koşarken çizgi yumuşak bir duvardır; sadece hamleler seni dışarı taşıyabilir.
  if (p.ak === 0 || p.ak === ACT_STUMBLE) {
    if (p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; }
    if (p.y < 0) { p.y = 0; if (p.vy < 0) p.vy = 0; }
    if (p.x > QUAD_SIZE) { p.x = QUAD_SIZE; if (p.vx > 0) p.vx = 0; }
    if (p.y > QUAD_SIZE) { p.y = QUAD_SIZE; if (p.vy > 0) p.vy = 0; }
  }

  // ---- Aksiyon bitişi ----
  if (p.ak !== 0) {
    p.at += DT;
    const end = (speedK: number, cd = ACTION_COOLDOWN) => {
      p.ak = 0;
      p.cd = cd;
      p.vx = p.dx * maxSpeed * speedK;
      p.vy = p.dy * maxSpeed * speedK;
    };
    switch (p.ak) {
      case ACT_VAULT:
      case ACT_KONG: {
        const clear = !overlapsAny(p.x, p.y, layout, "box");
        if ((p.at >= VAULT_MIN_TIME - 1e-9 && clear) || p.at >= VAULT_MAX_TIME - 1e-9) {
          end(1, 0);
          if (!clear) resolveCollisions(p, layout, null);
        }
        break;
      }
      case ACT_CLIMB: {
        const clear = !overlapsAny(p.x, p.y, layout);
        if ((p.at >= 0.35 && clear) || p.at >= CLIMB_MAX_TIME - 1e-9) {
          end(0.6);
          if (!clear) resolveCollisions(p, layout, null);
        }
        break;
      }
      case ACT_KICK:
        if (p.at >= KICK_TIME - 1e-9) end(1, 0.1);
        break;
      case ACT_JUKE:
        if (p.at >= JUKE_TIME - 1e-9) end(1);
        break;
      case ACT_DIVE:
        if (p.at >= DIVE_TIME - 1e-9) {
          p.ak = ACT_STUMBLE;
          p.at = 0;
          p.vx = p.dx * maxSpeed * 0.3;
          p.vy = p.dy * maxSpeed * 0.3;
        }
        break;
      case ACT_STUMBLE:
        if (p.at >= STUMBLE_TIME - 1e-9) {
          p.ak = 0;
          p.cd = 0;
        }
        break;
    }
  }

  return { out: !insideQuad(p.x, p.y), started };
}

/** Deterministik çeşitlilik: konuma göre speed vault ya da kong. */
function vaultStyle(p: PlayerState): number {
  return Math.floor((p.x + p.y) * 7) % 2 === 0 ? ACT_VAULT : ACT_KONG;
}

export const TAG_DISTANCE = PLAYER_RADIUS * 2 + TAG_REACH;

/** Kovalayan dalıştaysa erişimi uzar. */
export function isTag(ax: number, ay: number, bx: number, by: number, extraReach = 0): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const d = TAG_DISTANCE + extraReach;
  return dx * dx + dy * dy <= d * d;
}

export function chaserReach(p: PlayerState): number {
  return p.ak === ACT_DIVE ? DIVE_REACH : 0;
}
