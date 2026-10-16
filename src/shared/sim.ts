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
  JUMP_COST,
  JUMP_SPEED,
  JUMP_V,
  GRAVITY,
  WALL_H,
  BOX_H,
  TOP_DRAIN,
  TAG_MAX_DH,
  KICK_COST,
  ROLL_SPEED,
  ROLL_TIME,
  ROLL_COST,
  HARD_LANDING_V,
  CHAIN_KICK_COST,
  CHAIN_KICK_BOOST,
  FEINT_TIME,
  FEINT_COST,
  FEINT_EXIT,
  KICK_RANGE,
  KICK_SPEED,
  KICK_TIME,
  PLAYER_RADIUS,
  QUAD_SIZE,
  SLIDE_MAX_TIME,
  SLIDE_MIN_TIME,
  SLIDE_SPEED,
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
export const ACT_SLIDE = 8;
export const ACT_JUMP = 9;
export const ACT_ROLL = 10; // takla (iniş)
export const ACT_FEINT = 11; // sahte çıkış

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
  /** yükseklik ve dikey hız (duvar/kutu üstü, zıplama, düşme) */
  h: number;
  hv: number;
}

export function createPlayer(x: number, y: number, faceX: number, faceY: number): PlayerState {
  const l = Math.hypot(faceX, faceY) || 1;
  return { x, y, vx: 0, vy: 0, st: STAMINA_MAX, ak: 0, at: 0, dx: 0, dy: 0, cd: 0, fx: faceX / l, fy: faceY / l, h: 0, hv: 0 };
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

export function obstacleHeight(o: Obstacle): number {
  return o.hgt ?? (o.kind === "wall" ? WALL_H : o.kind === "box" ? BOX_H : 1.15);
}

/** Üstünde durulabilen yükseklik (bar'ın üstünde durulmaz). */
export function obstacleTop(o: Obstacle): number {
  return o.kind === "bar" ? 0 : obstacleHeight(o);
}

/** Oyuncunun merkezinin altındaki zemin yüksekliği (duvar/kutu üstü). Barın üstünde durulmaz. */
export function groundAt(x: number, y: number, layout: QuadLayout): number {
  let g = 0;
  for (const o of layout.obstacles) {
    if (o.kind === "bar") continue;
    if (x >= o.x - 0.05 && x <= o.x + o.w + 0.05 && y >= o.y - 0.05 && y <= o.y + o.h + 0.05) g = Math.max(g, obstacleTop(o));
  }
  return g;
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

/**
 * Yakındaki duvarın normalini döndürür (duvar sıçraması için). Oyuncu KICK_RANGE içinde
 * bir duvara bakıyorsa ya da ona yaslanmışsa normal, yoksa null.
 */
export function nearWall(x: number, y: number, layout: QuadLayout): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = KICK_RANGE;
  for (const o of layout.obstacles) {
    if (o.kind !== "wall") continue;
    const cx = Math.max(o.x, Math.min(x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(y, o.y + o.h));
    const nx = x - cx;
    const ny = y - cy;
    const d = Math.hypot(nx, ny);
    if (d < bestD) {
      bestD = d;
      const l = d || 1;
      // Köşe değil kenar normali: baskın ekseni al
      best = Math.abs(nx) >= Math.abs(ny) ? [Math.sign(nx / l) || 1, 0] : [0, Math.sign(ny / l) || 1];
    }
  }
  return best;
}

/** Duvar sıçraması yönü: gidiş yönünün duvar normaline göre yansıması, biraz normale doğru açılmış. */
export function wallJumpDir(dx: number, dy: number, n: [number, number]): [number, number] {
  const dot = dx * n[0] + dy * n[1];
  // Duvara doğru gidiyorsan yansıt; duvardan uzaklaşıyorsan yönü koru.
  let rx = dot < 0 ? dx - 2 * dot * n[0] : dx;
  let ry = dot < 0 ? dy - 2 * dot * n[1] : dy;
  // Duvara dik gelindiyse tam geri, aksi halde yansıma; her durumda duvardan uzaklaş
  rx += n[0] * 0.6;
  ry += n[1] * 0.6;
  const l = Math.hypot(rx, ry) || 1;
  return [rx / l, ry / l];
}

/** Geriye uyumluluk: eski isim. */
export const wallBehind = (x: number, y: number, _dx: number, _dy: number, layout: QuadLayout) => nearWall(x, y, layout);

/** PARKUR tuşu şu an ne yapar? (UI etiketi ve sim için aynı mantık) */
export function parkourPreview(p: PlayerState, input: Input, layout: QuadLayout): number {
  // Havada iniyorsan: yanında duvar varsa zincir sıçrama, yoksa iniş taklası
  const gnd = groundAt(p.x, p.y, layout);
  if (p.h > gnd + 0.35 && p.hv < 0.5) {
    if (nearWall(p.x, p.y, layout)) return ACT_KICK;
    return ACT_ROLL;
  }
  const l = Math.hypot(input.mx, input.my);
  const dx = l > 0.05 ? input.mx / l : p.fx;
  const dy = l > 0.05 ? input.my / l : p.fy;
  const ahead = obstacleAhead(p.x, p.y, dx, dy, layout, VAULT_PROBE + 0.25);
  const n = nearWall(p.x, p.y, layout);
  if (ahead === "wall") {
    // Duvara dik ve yavaş yaklaşıyorsan tırman; açıyla/hızla geliyorsan sıçra (tic-tac).
    const speed = Math.hypot(p.vx, p.vy);
    const into = n ? -(dx * n[0] + dy * n[1]) : 1;
    if (into > 0.85 && speed < 3.5) return ACT_CLIMB;
    return ACT_KICK;
  }
  if (ahead === "box") return ACT_VAULT;
  if (ahead === "bar") return ACT_SLIDE;
  if (n) return ACT_KICK;
  return ACT_JUMP;
}

/** Önümüzdeki duvarın normali (sıçrama için), bulunamazsa gidişin tersi. */
function obstacleNormalAhead(p: PlayerState, dx: number, dy: number, layout: QuadLayout): [number, number] {
  const px = p.x + dx * 0.6;
  const py = p.y + dy * 0.6;
  const n = nearWall(px, py, layout);
  return n ?? [-dx, -dy];
}

export function roleAction(role: Role): number {
  return role === "chaser" ? ACT_DIVE : ACT_JUKE;
}

function resolveCollisions(p: PlayerState, layout: QuadLayout, ignore: "box" | "bar" | "all" | null) {
  if (ignore === "all") return;
  const r = PLAYER_RADIUS;
  for (let iter = 0; iter < 2; iter++) {
    for (const o of layout.obstacles) {
      if (ignore === "box" && o.kind === "box") continue;
      if (ignore === "bar" && o.kind === "bar") continue;
      // Engelin üstündeysen (ya da üstünden geçiyorsan) çarpışma yok
      const top = obstacleHeight(o);
      if (p.h >= top - 0.25) continue;
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
  if (!(p.ak === ACT_KICK && p.cd < 0)) p.cd = Math.max(0, p.cd - DT);
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
  // Zıplama/sıçrama havasındayken de PARKUR basılabilir (takla, tic-tac zinciri)
  const inAir = (p.ak === ACT_JUMP || p.ak === ACT_KICK || p.ak === 0) && p.h > groundAt(p.x, p.y, layout) + 0.35;
  if (input.act && inAir && (p.ak !== 0 || p.cd <= 0)) {
    const kind = parkourPreview(p, input, layout);
    if (kind === ACT_ROLL && p.st >= ROLL_COST) {
      begin(p, ACT_ROLL, dx, dy, ROLL_COST);
      started = ACT_ROLL;
    } else if (kind === ACT_KICK && p.st >= CHAIN_KICK_COST && (p.ak !== ACT_KICK || p.at > 0.12)) {
      const n = nearWall(p.x, p.y, layout)!;
      const jd = wallJumpDir(dx, dy, n);
      begin(p, ACT_KICK, jd[0], jd[1], CHAIN_KICK_COST);
      p.hv = 3.6;
      p.cd = -1; // zincir işareti: bu sıçrama daha hızlı
      started = ACT_KICK;
    }
  } else if (free && p.cd <= 0) {
    if (input.act2) {
      if (role === "chaser" && p.st >= DIVE_COST) {
        begin(p, ACT_DIVE, dx, dy, DIVE_COST);
      } else if (role === "evader" && il < 0.05 && Math.hypot(p.vx, p.vy) > 2 && p.st >= FEINT_COST) {
        // Sahte çıkış: joystick bırakılmışken SIÇRA → dur, geldiğin yöne fırla
        begin(p, ACT_FEINT, -p.fx, -p.fy, FEINT_COST);
      } else if (role === "evader" && p.st >= JUKE_COST) {
        begin(p, ACT_JUKE, dx, dy, JUKE_COST);
      }
    } else if (input.act) {
      const kind = parkourPreview(p, input, layout);
      if (kind === ACT_CLIMB && p.st >= CLIMB_COST) {
        begin(p, ACT_CLIMB, dx, dy, CLIMB_COST);
        p.hv = 0;
      }
      else if (kind === ACT_VAULT) begin(p, vaultStyle(p), dx, dy, 0);
      else if (kind === ACT_SLIDE) begin(p, ACT_SLIDE, dx, dy, 0);
      else if (kind === ACT_KICK && p.st >= KICK_COST) {
        const n = nearWall(p.x, p.y, layout) ?? obstacleNormalAhead(p, dx, dy, layout);
        const jd = wallJumpDir(dx, dy, n);
        begin(p, ACT_KICK, jd[0], jd[1], KICK_COST);
        p.hv = 3.2;
      } else if (kind === ACT_JUMP && p.st >= JUMP_COST) {
        begin(p, ACT_JUMP, dx, dy, JUMP_COST);
        p.hv = JUMP_V;
      }
    }
    if (p.ak !== 0) started = p.ak;
  }
  // Otomatik atlama: koşarak kutuya girince kendiliğinden aşar.
  if (p.ak === 0 && speed >= VAULT_AUTO_SPEED && il > 0.05) {
    const vx = p.vx / speed;
    const vy = p.vy / speed;
    const ahead = obstacleAhead(p.x, p.y, vx, vy, layout, 0.3);
    if (ahead === "box") {
      begin(p, vaultStyle(p), vx, vy, 0);
      started = p.ak;
    } else if (ahead === "bar") {
      begin(p, ACT_SLIDE, vx, vy, 0);
      started = p.ak;
    }
  }

  const ground = groundAt(p.x, p.y, layout);
  const onTop = p.ak === 0 && ground > 0.5 && p.h >= ground - 0.02;
  const airborne = p.ak === 0 && p.h > ground + 0.02;
  if (onTop) {
    // Tepede durmak enerji yakar; biterse aşağı atlarsın.
    p.st -= TOP_DRAIN * DT;
    if (p.st <= 0) {
      p.st = 0;
      begin(p, ACT_JUMP, p.fx, p.fy, 0);
      p.hv = 2.5;
    }
  }

  // ---- Hız ----
  switch (p.ak) {
    case ACT_VAULT:
    case ACT_KONG:
      p.vx = p.dx * VAULT_SPEED;
      p.vy = p.dy * VAULT_SPEED;
      break;
    case ACT_CLIMB: {
      // Önce yerinde yukarı çekil (yatayda neredeyse dur), tepeye varınca üstüne adım at.
      const k = p.h >= WALL_H - 1e-6 ? CLIMB_SPEED : 0.25;
      p.vx = p.dx * k;
      p.vy = p.dy * k;
      break;
    }
    case ACT_KICK: {
      const k = p.cd < 0 ? KICK_SPEED * CHAIN_KICK_BOOST : KICK_SPEED;
      p.vx = p.dx * k;
      p.vy = p.dy * k;
      break;
    }
    case ACT_ROLL:
      p.vx = p.dx * ROLL_SPEED;
      p.vy = p.dy * ROLL_SPEED;
      break;
    case ACT_FEINT: {
      // İlk yarı: fren (sahte), ikinci yarı: ters yöne patlama
      const half = p.at < FEINT_TIME * 0.5;
      const k = half ? maxSpeed * 0.15 : maxSpeed * FEINT_EXIT;
      p.vx = p.dx * k;
      p.vy = p.dy * k;
      break;
    }
    case ACT_DIVE:
      p.vx = p.dx * DIVE_SPEED;
      p.vy = p.dy * DIVE_SPEED;
      break;
    case ACT_JUKE:
      p.vx = p.dx * JUKE_SPEED;
      p.vy = p.dy * JUKE_SPEED;
      break;
    case ACT_SLIDE:
      p.vx = p.dx * SLIDE_SPEED;
      p.vy = p.dy * SLIDE_SPEED;
      break;
    case ACT_JUMP: {
      // Havada hafif yön kontrolü
      const jl = Math.hypot(input.mx, input.my);
      if (jl > 0.05) {
        p.dx += (input.mx / jl - p.dx) * 0.08;
        p.dy += (input.my / jl - p.dy) * 0.08;
        const l = Math.hypot(p.dx, p.dy) || 1;
        p.dx /= l;
        p.dy /= l;
      }
      p.vx = p.dx * JUMP_SPEED;
      p.vy = p.dy * JUMP_SPEED;
      break;
    }
    default: {
      const k = p.ak === ACT_STUMBLE ? 0.25 : onTop ? 0.7 : airborne ? 1 : 1;
      const tx = input.mx * maxSpeed * k;
      const ty = input.my * maxSpeed * k;
      let ddx = tx - p.vx;
      let ddy = ty - p.vy;
      const dl = Math.hypot(ddx, ddy);
      const maxDv = accel * DT * (p.ak === ACT_STUMBLE ? 0.6 : airborne ? 0.3 : 1);
      if (dl > maxDv) {
        ddx = (ddx / dl) * maxDv;
        ddy = (ddy / dl) * maxDv;
      }
      p.vx += ddx;
      p.vy += ddy;
      if (p.ak === 0 && !onTop) p.st = Math.min(STAMINA_MAX, p.st + STAMINA_REGEN * DT);
    }
  }

  // ---- Hareket + çarpışma (iki alt adım) ----
  const ignore = p.ak === ACT_VAULT || p.ak === ACT_KONG ? "box" : p.ak === ACT_SLIDE ? "bar" : p.ak === ACT_CLIMB ? "all" : null;
  for (let s = 0; s < 2; s++) {
    p.x += (p.vx * DT) / 2;
    p.y += (p.vy * DT) / 2;
    resolveCollisions(p, layout, ignore);
  }
  // ---- Dikey fizik ----
  const g2 = groundAt(p.x, p.y, layout);
  if (p.ak === ACT_CLIMB) {
    p.h = Math.min(WALL_H, p.h + (WALL_H / 0.7) * DT);
    p.hv = 0;
  } else if (p.ak === ACT_VAULT || p.ak === ACT_KONG) {
    p.h = Math.max(g2, Math.sin(Math.min(1, p.at / 0.4) * Math.PI) * (vaultClear(p, layout) + 0.3));
    p.hv = 0;
  } else if (p.ak === ACT_SLIDE) {
    p.h = g2;
    p.hv = 0;
  } else {
    p.hv -= GRAVITY * DT;
    p.h += p.hv * DT;
    if (p.h <= g2) {
      // Sert iniş: takla atmadan yüksekten düştüysen hızın yarıya iner
      if (p.hv < HARD_LANDING_V && p.ak !== ACT_ROLL && p.ak !== ACT_KICK) {
        // Sert iniş: kısa tökezleme
        p.ak = ACT_STUMBLE;
        p.at = STUMBLE_TIME * 0.55;
        p.vx *= 0.4;
        p.vy *= 0.4;
      }
      p.h = g2;
      p.hv = 0;
    }
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
        // Tepeye vardıysan orada dur; süre dolduysa bırak (yerçekimi indirir).
        if (p.h >= WALL_H - 1e-6 && groundAt(p.x, p.y, layout) >= WALL_H) {
          p.ak = 0;
          p.cd = 0.1;
          p.vx = 0;
          p.vy = 0;
        } else if (p.at >= CLIMB_MAX_TIME - 1e-9) {
          end(0.4);
          p.hv = 0;
        }
        break;
      }
      case ACT_KICK:
        if (p.at >= KICK_TIME - 1e-9) end(p.cd < 0 ? CHAIN_KICK_BOOST : 1, 0.1);
        break;
      case ACT_ROLL:
        // Yere değmeden bitmez; indikten sonra kısa yuvarlanma
        if (p.at >= ROLL_TIME - 1e-9 && p.h <= groundAt(p.x, p.y, layout) + 1e-6) end(1.05, 0.05);
        else if (p.at >= ROLL_TIME * 3) end(1, 0.05);
        break;
      case ACT_FEINT:
        if (p.at >= FEINT_TIME - 1e-9) end(FEINT_EXIT);
        break;
      case ACT_SLIDE: {
        const clear = !overlapsAny(p.x, p.y, layout, "bar");
        if ((p.at >= SLIDE_MIN_TIME - 1e-9 && clear) || p.at >= SLIDE_MAX_TIME - 1e-9) {
          end(1, 0);
          if (!clear) resolveCollisions(p, layout, null);
        }
        break;
      }
      case ACT_JUMP: {
        // Yere (ya da bir engelin üstüne) inince biter
        if (p.at >= 0.1 && p.hv <= 0 && p.h <= groundAt(p.x, p.y, layout) + 1e-6) {
          end(0.9, 0.05);
          if (overlapsAny(p.x, p.y, layout, "box") && p.h < BOX_H - 0.25) resolveCollisions(p, layout, null);
        }
        break;
      }
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

/** Atlanan kutunun yüksekliği (vault yayı için). */
function vaultClear(p: PlayerState, layout: QuadLayout): number {
  let h = BOX_H;
  for (const o of layout.obstacles) {
    if (o.kind !== "box") continue;
    if (Math.abs(p.x - (o.x + o.w / 2)) < o.w / 2 + 1.2 && Math.abs(p.y - (o.y + o.h / 2)) < o.h / 2 + 1.2) h = Math.max(h, obstacleHeight(o));
  }
  return h;
}

/** Deterministik çeşitlilik: konuma göre speed vault ya da kong. */
function vaultStyle(p: PlayerState): number {
  return Math.floor((p.x + p.y) * 7) % 2 === 0 ? ACT_VAULT : ACT_KONG;
}

export const TAG_DISTANCE = PLAYER_RADIUS * 2 + TAG_REACH;

/** Kovalayan dalıştaysa erişimi uzar. */
export function isTag(ax: number, ay: number, bx: number, by: number, extraReach = 0, ah = 0, bh = 0): boolean {
  if (Math.abs(ah - bh) > TAG_MAX_DH) return false;
  const dx = ax - bx;
  const dy = ay - by;
  const d = TAG_DISTANCE + extraReach;
  return dx * dx + dy * dy <= d * d;
}

export function chaserReach(p: PlayerState): number {
  return p.ak === ACT_DIVE ? DIVE_REACH : 0;
}
