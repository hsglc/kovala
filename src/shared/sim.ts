import {
  ACCEL_CHASER,
  ACCEL_EVADER,
  ACTION_COOLDOWN,
  DASH_COST,
  DASH_SPEED,
  DASH_TIME,
  DT,
  PLAYER_RADIUS,
  SPEED_CHASER,
  SPEED_EVADER,
  STAMINA_MAX,
  STAMINA_REGEN,
  TAG_REACH,
  VAULT_COST,
  VAULT_MAX_TIME,
  VAULT_MIN_TIME,
  VAULT_PROBE,
  VAULT_SPEED,
} from "./constants";
import { insideQuad, type Obstacle, type QuadLayout } from "./maps";

/** Bir tick'lik oyuncu girdisi. mx,my -1..1 analog yön (quantize edilmiş), act: aksiyon tuşuna bu tick basıldı. */
export interface Input {
  mx: number;
  my: number;
  act: boolean;
}

export const NEUTRAL_INPUT: Input = { mx: 0, my: 0, act: false };

export const ACT_NONE = 0;
export const ACT_DASH = 1;
export const ACT_VAULT = 2;

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** stamina 0..100 */
  st: number;
  /** aktif aksiyon: 0 yok, 1 depar, 2 atlama */
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
export function quantizeInput(mx: number, my: number, act: boolean): Input {
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
  return { mx: Math.round(mx * 100) / 100, my: Math.round(my * 100) / 100, act };
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

export function overlapsAnyBox(x: number, y: number, layout: QuadLayout): boolean {
  for (const o of layout.obstacles) {
    if (o.kind === "box" && circleOverlapsRect(x, y, PLAYER_RADIUS, o)) return true;
  }
  return false;
}

/** Oyuncunun önünde (dir yönünde) atlanabilir alçak engel var mı? Önce duvar gelirse hayır. */
export function canVault(x: number, y: number, dirX: number, dirY: number, layout: QuadLayout): boolean {
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const d = PLAYER_RADIUS * 0.5 + (VAULT_PROBE + PLAYER_RADIUS * 0.5) * (i / steps);
    const px = x + dirX * d;
    const py = y + dirY * d;
    for (const o of layout.obstacles) {
      if (pointInRect(px, py, o, 0.04)) return o.kind === "box";
    }
  }
  return false;
}

/** Oyuncunun o anki bakış/girdi yönüne göre aksiyon tuşu ne yapar? (UI etiketi için) */
export function actionPreview(p: PlayerState, input: Input, layout: QuadLayout): number {
  const l = Math.hypot(input.mx, input.my);
  const dx = l > 0.05 ? input.mx / l : p.fx;
  const dy = l > 0.05 ? input.my / l : p.fy;
  return canVault(p.x, p.y, dx, dy, layout) ? ACT_VAULT : ACT_DASH;
}

function resolveCollisions(p: PlayerState, layout: QuadLayout, ignoreBoxes: boolean) {
  const r = PLAYER_RADIUS;
  for (let iter = 0; iter < 2; iter++) {
    for (const o of layout.obstacles) {
      if (ignoreBoxes && o.kind === "box") continue;
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
        // Merkez dikdörtgenin içinde: en kısa eksenden dışarı it.
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

/**
 * Tek oyuncuyu bir tick ilerletir. Deterministik: aynı state + input → aynı sonuç.
 * İstemci tahmini (prediction) ve sunucu bu fonksiyonu birebir aynı çalıştırır.
 */
export type Role = "chaser" | "evader";

export function stepPlayer(p: PlayerState, input: Input, role: Role, layout: QuadLayout): StepResult {
  const maxSpeed = role === "chaser" ? SPEED_CHASER : SPEED_EVADER;
  const accel = role === "chaser" ? ACCEL_CHASER : ACCEL_EVADER;
  let started = 0;
  p.cd = Math.max(0, p.cd - DT);
  const il = Math.hypot(input.mx, input.my);
  if (il > 0.05 && p.ak === 0) {
    p.fx = input.mx / il;
    p.fy = input.my / il;
  }

  if (input.act && p.ak === 0 && p.cd <= 0) {
    const dx = il > 0.05 ? input.mx / il : p.fx;
    const dy = il > 0.05 ? input.my / il : p.fy;
    if (canVault(p.x, p.y, dx, dy, layout)) {
      if (p.st >= VAULT_COST) {
        p.ak = 2;
        p.st -= VAULT_COST;
      }
    } else if (p.st >= DASH_COST) {
      p.ak = 1;
      p.st -= DASH_COST;
    }
    if (p.ak !== 0) {
      p.at = 0;
      p.dx = dx;
      p.dy = dy;
      p.fx = dx;
      p.fy = dy;
      started = p.ak;
    }
  }

  if (p.ak === 1) {
    p.vx = p.dx * DASH_SPEED;
    p.vy = p.dy * DASH_SPEED;
  } else if (p.ak === 2) {
    p.vx = p.dx * VAULT_SPEED;
    p.vy = p.dy * VAULT_SPEED;
  } else {
    const tx = input.mx * maxSpeed;
    const ty = input.my * maxSpeed;
    let ddx = tx - p.vx;
    let ddy = ty - p.vy;
    const dl = Math.hypot(ddx, ddy);
    const maxDv = accel * DT;
    if (dl > maxDv) {
      ddx = (ddx / dl) * maxDv;
      ddy = (ddy / dl) * maxDv;
    }
    p.vx += ddx;
    p.vy += ddy;
    p.st = Math.min(STAMINA_MAX, p.st + STAMINA_REGEN * DT);
  }

  // İki alt adımda hareket + çarpışma (hızlı deparda duvardan geçmeyi önler).
  const vaulting = p.ak === 2;
  for (let s = 0; s < 2; s++) {
    p.x += (p.vx * DT) / 2;
    p.y += (p.vy * DT) / 2;
    resolveCollisions(p, layout, vaulting);
  }

  if (p.ak !== 0) {
    p.at += DT;
    if (p.ak === 1 && p.at >= DASH_TIME - 1e-9) {
      p.ak = 0;
      p.cd = ACTION_COOLDOWN;
      p.vx = p.dx * maxSpeed;
      p.vy = p.dy * maxSpeed;
    } else if (p.ak === 2) {
      const clear = !overlapsAnyBox(p.x, p.y, layout);
      if ((p.at >= VAULT_MIN_TIME - 1e-9 && clear) || p.at >= VAULT_MAX_TIME - 1e-9) {
        p.ak = 0;
        p.cd = ACTION_COOLDOWN;
        p.vx = p.dx * maxSpeed * 0.85;
        p.vy = p.dy * maxSpeed * 0.85;
        if (!clear) resolveCollisions(p, layout, false);
      }
    }
  }

  return { out: !insideQuad(p.x, p.y), started };
}

export const TAG_DISTANCE = PLAYER_RADIUS * 2 + TAG_REACH;

export function isTag(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= TAG_DISTANCE * TAG_DISTANCE;
}
