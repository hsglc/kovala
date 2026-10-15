import { JUKE_COST, QUAD_SIZE, STAMINA_MAX } from "../../shared/constants";
import type { PublicState } from "../../shared/engine";
import type { QuadLayout } from "../../shared/maps";
import type { PlayerState } from "../../shared/sim";
import { TEAM_COLORS, memberName, memberTeam } from "../lib/text";
import type { Projected } from "./three/Scene3D";

export interface View {
  w: number;
  h: number;
  dpr: number;
  portrait: boolean;
}

export const HUD_TOP = 70;

export function computeView(w: number, h: number, dpr: number): View {
  return { w, h, dpr, portrait: h > w * 1.15 };
}

export interface Camera {
  x: number;
  y: number;
  init: boolean;
}

export function updateCamera(cam: Camera, tx: number, ty: number, dtMs: number) {
  tx = Math.max(-1, Math.min(QUAD_SIZE + 1, tx));
  ty = Math.max(-1, Math.min(QUAD_SIZE + 1, ty));
  if (!cam.init) {
    cam.x = tx;
    cam.y = ty;
    cam.init = true;
    return;
  }
  const k = 1 - Math.exp(-dtMs / 120);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

export interface JoyVisual {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
  r: number;
  zoneX: number;
  zoneY: number;
  zoneW: number;
  zoneH: number;
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

/** 3B sahnenin üstüne çizilen şeffaf katman. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  v: View,
  layout: QuadLayout,
  state: PublicState | null,
  players: Map<string, PlayerState>,
  proj: Map<string, Projected>,
  selfId: string,
  joy: JoyVisual,
) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.clearRect(0, 0, v.w, v.h);
  const chaserId = state?.chaserId;
  const phase = state?.phase;

  // İsim etiketleri
  ctx.font = "600 12px 'Barlow Condensed', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const [id] of players) {
    const pr = proj.get(id);
    if (!pr || !pr.on) continue;
    const isChaser = id === chaserId;
    const label = memberName(state, id) + (id === selfId ? " (sen)" : "");
    const tw = ctx.measureText(label).width + 22;
    const lx = Math.max(tw / 2 + 4, Math.min(v.w - tw / 2 - 4, pr.x));
    const ty = pr.y;
    ctx.fillStyle = "rgba(8, 14, 26, 0.75)";
    roundRect(ctx, lx - tw / 2, ty - 16, tw, 17, 8);
    ctx.fill();
    ctx.fillStyle = isChaser ? "#ffd166" : "#bfe9ff";
    ctx.fillText((isChaser ? "◆ " : "● ") + label, lx, ty);
  }

  // Kendi enerjin: etiketin altında ince çubuk
  const me = players.get(selfId);
  const mp = proj.get(selfId);
  if (me && mp && mp.on && phase === "chase") {
    const bw = 44;
    const bx = mp.x - bw / 2;
    const by = mp.y + 3;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(ctx, bx, by, bw, 4, 2);
    ctx.fill();
    ctx.fillStyle = me.st >= JUKE_COST ? "#39d98a" : "#f5b83d";
    roundRect(ctx, bx, by, (bw * me.st) / STAMINA_MAX, 4, 2);
    ctx.fill();
  }

  // Ekran dışındaki rakip için kenar oku
  for (const [id, p] of players) {
    if (id === selfId) continue;
    const pr = proj.get(id);
    if (!pr) continue;
    const m = 28;
    if (pr.on && pr.x > m && pr.x < v.w - m && pr.y > HUD_TOP + m && pr.y < v.h - m) continue;
    const ax = Math.max(m, Math.min(v.w - m, pr.x));
    const ay = Math.max(HUD_TOP + m, Math.min(v.h - m, pr.y));
    const ang = Math.atan2(pr.y - ay, pr.x - ax);
    const team = memberTeam(state, id) ?? 0;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = TEAM_COLORS[team];
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (me) {
      const dist = Math.hypot(p.x - me.x, p.y - me.y);
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${dist.toFixed(0)} m`, ax, ay + (ay < v.h / 2 ? 22 : -22));
    }
  }

  // Mini harita (sağ üst)
  {
    const mw = 72;
    const mx = v.w - mw - 10;
    const my = HUD_TOP + 2;
    const ms = mw / QUAD_SIZE;
    ctx.fillStyle = "rgba(9, 15, 28, 0.72)";
    roundRect(ctx, mx - 3, my - 3, mw + 6, mw + 6, 6);
    ctx.fill();
    ctx.fillStyle = "#1b2a44";
    ctx.fillRect(mx, my, mw, mw);
    for (const o of layout.obstacles) {
      ctx.fillStyle = o.kind === "wall" ? "#5b6d8f" : o.kind === "box" ? "#c98a1d" : "#7fe0ff";
      ctx.fillRect(mx + o.x * ms, my + o.y * ms, Math.max(2, o.w * ms), Math.max(2, o.h * ms));
    }
    for (const [id, p] of players) {
      const team = memberTeam(state, id) ?? 0;
      ctx.fillStyle = TEAM_COLORS[team];
      ctx.beginPath();
      ctx.arc(mx + p.x * ms, my + p.y * ms, id === selfId ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (id === selfId) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mw - 1);
  }

  // Joystick
  if (!joy.active && phase === "chase") {
    const cx = joy.zoneX + Math.min(joy.zoneW * 0.5, 110);
    const cy = joy.zoneY + joy.zoneH * 0.62;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.setLineDash([5, 7]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, joy.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  if (joy.active) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joy.ox, joy.oy, joy.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(joy.x, joy.y, joy.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}
