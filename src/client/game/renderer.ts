import { DASH_COST, PLAYER_RADIUS, QUAD_SIZE, SPEED_EVADER, STAMINA_MAX } from "../../shared/constants";
import type { PublicState } from "../../shared/engine";
import type { Obstacle, QuadLayout } from "../../shared/maps";
import { TAG_DISTANCE, type PlayerState } from "../../shared/sim";
import { TEAM_COLORS, TEAM_DARK, memberName, memberTeam } from "../lib/text";
import { drawFigure, lookFor, type FigureLook, type FigurePose, type FigureView } from "./figure";

export interface View {
  /** css piksel */
  w: number;
  h: number;
  dpr: number;
  /** sahanın sol-üst köşesi ve boyutu (css piksel) */
  qx: number;
  qy: number;
  qs: number;
  portrait: boolean;
}

export const HUD_TOP = 70;
/** Sahanın üst kenarındaki figürlerin kafası için boşluk. */
const HEADROOM = 50;
/** Figürler okunaklı olsun diye dünyaya göre biraz büyük çizilir (çarpışma etkilenmez). */
const FIG_SCALE = 1.22;

export function computeView(w: number, h: number, dpr: number): View {
  const portrait = h > w * 1.15;
  let qs: number;
  let qx: number;
  let qy: number;
  if (portrait) {
    qs = Math.min(w - 20, h - HUD_TOP - HEADROOM - 190);
    qx = (w - qs) / 2;
    qy = HUD_TOP + HEADROOM;
  } else {
    qs = Math.min(h - HUD_TOP - HEADROOM * 0.8 - 14, w - 2 * 150);
    qx = (w - qs) / 2;
    qy = HUD_TOP + HEADROOM * 0.8 + Math.max(0, (h - HUD_TOP - HEADROOM * 0.8 - 14 - qs) / 2);
  }
  qs = Math.max(120, qs);
  return { w, h, dpr, qx, qy, qs, portrait };
}

export interface JoyVisual {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
  r: number;
}

const COLORS = {
  bg: "#0b1220",
  floor: "#17243a",
  grid: "rgba(160, 190, 230, 0.06)",
  line: "#e8eef7",
  wallTop: "#5a6d8e",
  wallTopHi: "#7084a8",
  wallFront: "#33415a",
  wallFrontDark: "#27334a",
  boxTop: "#f7bd45",
  boxFront: "#c98a1d",
  shadow: "rgba(0, 0, 0, 0.32)",
};

/** Görsel yükseklikler (metre). Fizik etkilenmez; sadece 3/4 bakış için. */
const WALL_H = 0.95;
const BOX_H = 0.42;

// ---------- Animasyon durumu ----------

interface Anim {
  phase: number;
  lx: number;
  ly: number;
  face: 1 | -1;
  view: FigureView;
  run: number;
  last: number;
}
const anims = new Map<string, Anim>();
const looks = new Map<string, FigureLook>();

function animFor(id: string, p: PlayerState, now: number): Anim {
  let a = anims.get(id);
  if (!a) {
    a = { phase: 0, lx: p.x, ly: p.y, face: p.fx >= 0 ? 1 : -1, view: "side", run: 0, last: now };
    anims.set(id, a);
  }
  const dt = Math.max(1, now - a.last) / 1000;
  a.last = now;
  let d = Math.hypot(p.x - a.lx, p.y - a.ly);
  if (d > 1.5) d = 0; // yeni chase'te ışınlanma
  a.lx = p.x;
  a.ly = p.y;
  const speed = Math.min(9, d / dt);
  const target = Math.min(1, speed / SPEED_EVADER);
  a.run += (target - a.run) * Math.min(1, dt * 10);
  a.phase += (d / 1.3) * Math.PI * 2;
  if (Math.abs(p.fx) > 0.3) a.face = p.fx > 0 ? 1 : -1;
  a.view = Math.abs(p.fy) > Math.abs(p.fx) * 1.5 ? (p.fy < 0 ? "back" : "front") : "side";
  return a;
}

function lookForPlayer(id: string, team: number): FigureLook {
  const key = `${id}:${team}`;
  let l = looks.get(key);
  if (!l) {
    l = lookFor(id, TEAM_COLORS[team as 0 | 1], TEAM_DARK[team as 0 | 1]);
    looks.set(key, l);
  }
  return l;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, qx: number, qy: number, s: number) {
  const H = (o.kind === "wall" ? WALL_H : BOX_H) * s;
  const x = qx + o.x * s;
  const y = qy + o.y * s;
  const w = o.w * s;
  const h = o.h * s;
  // ön yüz (güney cephesi)
  ctx.fillStyle = o.kind === "wall" ? COLORS.wallFront : COLORS.boxFront;
  ctx.fillRect(x, y + h - H, w, H);
  if (o.kind === "wall") {
    ctx.strokeStyle = COLORS.wallFrontDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let bx = x + s * 0.5; bx < x + w - 2; bx += s * 0.5) {
      ctx.moveTo(bx, y + h - H + 2);
      ctx.lineTo(bx, y + h);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x, y + h - H * 0.35, w, H * 0.35);
  }
  // üst yüz
  const ty = y - H;
  ctx.fillStyle = o.kind === "wall" ? COLORS.wallTop : COLORS.boxTop;
  roundRect(ctx, x, ty, w, h, 2);
  ctx.fill();
  if (o.kind === "wall") {
    ctx.fillStyle = COLORS.wallTopHi;
    roundRect(ctx, x + 2, ty + 2, w - 4, Math.max(2, h * 0.25), 2);
    ctx.fill();
  } else {
    // atlanabilir olduğunu belirten çizgiler
    ctx.save();
    roundRect(ctx, x, ty, w, h, 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(120, 70, 0, 0.3)";
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.beginPath();
    const step = s * 0.3;
    for (let d = -h; d < w + h; d += step) {
      ctx.moveTo(x + d, ty + h);
      ctx.lineTo(x + d + h, ty);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(5, 9, 18, 0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, ty + 0.5, w - 1, h + H - 1);
}

interface PlayerDraw {
  id: string;
  p: PlayerState;
  team: number;
  px: number;
  py: number;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  v: View,
  layout: QuadLayout,
  state: PublicState | null,
  players: Map<string, PlayerState>,
  selfId: string,
  joy: JoyVisual,
  now: number,
) {
  const { dpr, qx, qy, qs } = v;
  const s = qs / QUAD_SIZE;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, v.w, v.h);

  // ---------- Zemin ----------
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = COLORS.floor;
  roundRect(ctx, qx - 8, qy - 8, qs + 16, qs + 16, 10);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < QUAD_SIZE; i++) {
    ctx.moveTo(qx + i * s, qy);
    ctx.lineTo(qx + i * s, qy + qs);
    ctx.moveTo(qx, qy + i * s);
    ctx.lineTo(qx + qs, qy + i * s);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.strokeRect(qx, qy, qs, qs);

  const chaserId = state?.chaserId;
  const evaderId = state?.evaderId;
  const phase = state?.phase;
  const list: PlayerDraw[] = [];
  for (const [id, p] of players) {
    list.push({ id, p, team: memberTeam(state, id) ?? 0, px: qx + p.x * s, py: qy + p.y * s });
  }

  // Saha çizgisine yaklaşan oyuncu için uyarı parıltısı
  for (const d of list) {
    const m = Math.min(d.p.x, d.p.y, QUAD_SIZE - d.p.x, QUAD_SIZE - d.p.y);
    if (m < 0.9 && phase === "chase") {
      const a = Math.min(1, (0.9 - m) / 0.6);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 90, 79, ${0.85 * a})`;
      ctx.lineWidth = Math.max(3, s * 0.12);
      ctx.beginPath();
      const L = s * 1.6;
      if (d.p.x < 0.9) {
        ctx.moveTo(qx, d.py - L);
        ctx.lineTo(qx, d.py + L);
      }
      if (QUAD_SIZE - d.p.x < 0.9) {
        ctx.moveTo(qx + qs, d.py - L);
        ctx.lineTo(qx + qs, d.py + L);
      }
      if (d.p.y < 0.9) {
        ctx.moveTo(d.px - L, qy);
        ctx.lineTo(d.px + L, qy);
      }
      if (QUAD_SIZE - d.p.y < 0.9) {
        ctx.moveTo(d.px - L, qy + qs);
        ctx.lineTo(d.px + L, qy + qs);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Engel gölgeleri
  ctx.fillStyle = COLORS.shadow;
  for (const o of layout.obstacles) {
    const off = o.kind === "wall" ? 0.28 : 0.14;
    roundRect(ctx, qx + (o.x + off) * s, qy + (o.y + off * 0.5) * s, o.w * s, o.h * s, 3);
    ctx.fill();
  }

  // Zemindeki işaretler: gölge, kendi halkan, yakalama menzili
  for (const d of list) {
    const vaulting = d.p.ak === 2;
    const lift = vaulting ? Math.sin(Math.min(1, d.p.at / 0.4) * Math.PI) : 0;
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(d.px, d.py, PLAYER_RADIUS * s * (1 - lift * 0.3), PLAYER_RADIUS * s * 0.5 * (1 - lift * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    if (d.id === chaserId && phase === "chase") {
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = "rgba(255, 209, 102, 0.28)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(d.px, d.py, (TAG_DISTANCE - PLAYER_RADIUS) * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const ringColor = d.id === selfId ? "#ffffff" : TEAM_COLORS[d.team as 0 | 1];
    ctx.strokeStyle = ringColor;
    ctx.globalAlpha = d.id === selfId ? 0.9 : 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(d.px, d.py, PLAYER_RADIUS * s * 1.25, PLAYER_RADIUS * s * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Kendi enerjin: ayağının altındaki yay
    if (d.id === selfId && phase === "chase") {
      ctx.lineWidth = 3;
      ctx.strokeStyle = d.p.st >= DASH_COST ? "#39d98a" : "#f5b83d";
      ctx.beginPath();
      ctx.ellipse(
        d.px,
        d.py,
        PLAYER_RADIUS * s * 1.25 + 4,
        PLAYER_RADIUS * s * 0.62 + 3,
        0,
        Math.PI * 0.5 - (Math.PI * d.p.st) / STAMINA_MAX,
        Math.PI * 0.5 + (Math.PI * d.p.st) / STAMINA_MAX,
      );
      ctx.stroke();
    }
  }

  // ---------- Derinliğe göre sıralı çizim (engeller + figürler) ----------
  type Item = { key: number; draw: () => void };
  const items: Item[] = [];
  for (const o of layout.obstacles) {
    items.push({ key: o.y + o.h, draw: () => drawObstacle(ctx, o, qx, qy, s) });
  }
  const headTops = new Map<string, number>();
  const figureFns = new Map<string, (alpha: number) => void>();
  for (const d of list) {
    const anim = animFor(d.id, d.p, now);
    const look = lookForPlayer(d.id, d.team);
    let pose: FigurePose = "run";
    if (phase === "result" && state?.last) {
      const winnerId = state.last.winner === "chaser" ? state.last.chaser : state.last.evader;
      pose = d.id === winnerId ? "cheer" : "tired";
    }
    const other = d.id === chaserId ? players.get(evaderId ?? "") : undefined;
    const reach = !!other && phase === "chase" && Math.hypot(other.x - d.p.x, other.y - d.p.y) < 1.3;
    const reachFace: 1 | -1 = other && other.x < d.p.x ? -1 : 1;
    const draw = (alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(d.px, d.py);
      ctx.scale(s * FIG_SCALE, s * FIG_SCALE);
      const top = drawFigure(ctx, look, {
        view: anim.view,
        face: reach ? reachFace : anim.face,
        phase: anim.phase,
        run: phase === "chase" ? anim.run : 0,
        dashing: d.p.ak === 1,
        vault: d.p.ak === 2 ? Math.min(1, d.p.at / 0.4) : -1,
        reach,
        pose,
        time: now,
      });
      ctx.restore();
      headTops.set(d.id, d.py + top * s * FIG_SCALE);
    };
    figureFns.set(d.id, draw);
    items.push({ key: d.p.y, draw: () => draw(1) });
  }
  items.sort((a, b) => a.key - b.key);
  for (const it of items) it.draw();

  // Engelin arkasında kalan figürü hayalet olarak göster
  for (const d of list) {
    const hidden = layout.obstacles.some((o) => {
      if (o.y + o.h <= d.p.y) return false;
      const H = o.kind === "wall" ? WALL_H : BOX_H;
      return d.p.x + 0.4 > o.x && d.p.x - 0.4 < o.x + o.w && o.y - H < d.p.y;
    });
    if (hidden) figureFns.get(d.id)!(0.35);
  }

  // İsim etiketleri (her zaman en üstte)
  ctx.font = "600 12px 'Barlow Condensed', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const d of list) {
    const isChaser = d.id === chaserId;
    const label = memberName(state, d.id) + (d.id === selfId ? " (sen)" : "");
    const ty = (headTops.get(d.id) ?? d.py - 1.8 * s) - 3;
    const tw = ctx.measureText(label).width + 22;
    const lx = Math.max(tw / 2 + 4, Math.min(v.w - tw / 2 - 4, d.px));
    ctx.fillStyle = "rgba(8, 14, 26, 0.75)";
    roundRect(ctx, lx - tw / 2, ty - 16, tw, 17, 8);
    ctx.fill();
    ctx.fillStyle = isChaser ? "#ffd166" : "#bfe9ff";
    ctx.fillText((isChaser ? "◆ " : "● ") + label, lx, ty);
  }

  // Sanal joystick
  if (joy.active) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joy.ox, joy.oy, joy.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(joy.x, joy.y, joy.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}
