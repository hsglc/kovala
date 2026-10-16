import { JUKE_COST, QUAD_H, QUAD_W, STAMINA_MAX } from "../../shared/constants";
import type { PublicState } from "../../shared/engine";
import type { QuadLayout } from "../../shared/maps";
import type { PlayerState } from "../../shared/sim";
import { TEAM_COLORS, memberName, memberTeam } from "../lib/text";
import type { Projected } from "./three/Scene3D";
import { ROLE_COLOR } from "./roles";

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
  /** 0..1: ne kadar açılacağı (iki oyuncu uzaksa artar) */
  zoom: number;
  init: boolean;
}

/**
 * Kamera hedefi: kendi karakterin, rakibe doğru kaydırılmış; ikisi uzaksa kamera yükselir.
 * Böylece chase başında ve kovalama sırasında rakip hep kadrajda.
 */
export function updateCamera(cam: Camera, me: { x: number; y: number } | null, other: { x: number; y: number } | null, dtMs: number) {
  let tx = QUAD_W / 2;
  let ty = QUAD_H / 2;
  let zoom = 0.3;
  if (me && other) {
    const d = Math.hypot(other.x - me.x, other.y - me.y);
    const w = Math.min(0.36, 0.18 + d * 0.02);
    const off = Math.min(2.2, d * w);
    tx = me.x + ((other.x - me.x) / (d || 1)) * off;
    ty = me.y + ((other.y - me.y) / (d || 1)) * off;
    zoom = Math.max(0, Math.min(1, (d - 3) / 9));
  } else if (me) {
    tx = me.x;
    ty = me.y;
    zoom = 0;
  } else if (other) {
    tx = other.x;
    ty = other.y;
  }
  tx = Math.max(-1, Math.min(QUAD_W + 1, tx));
  ty = Math.max(-1, Math.min(QUAD_H + 1, ty));
  if (!cam.init) {
    cam.x = tx;
    cam.y = ty;
    cam.zoom = zoom;
    cam.init = true;
    return;
  }
  const k = 1 - Math.exp(-dtMs / 140);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.zoom += (zoom - cam.zoom) * (1 - Math.exp(-dtMs / 260));
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

  // Baş üstü etiket: maç sırasında büyük rol rozeti (renkli, okla oyuncuyu gösterir) + üstünde isim
  const evaderId = state?.evaderId;
  const live = phase === "countdown" || phase === "chase" || phase === "result";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [id] of players) {
    const pr = proj.get(id);
    if (!pr || !pr.on) continue;
    const role = id === chaserId ? "chaser" : id === evaderId ? "evader" : null;
    const mine = id === selfId;
    const name = memberName(state, id);
    if (live && role) {
      // Yalnızca isim; rol, rol rengindeki alt çizgi ve ayak altındaki halkadan anlaşılır
      const label = mine ? "Sen" : name;
      ctx.font = "700 13px 'Barlow Condensed', system-ui, sans-serif";
      const tw = ctx.measureText(label).width + 18;
      const lx = Math.max(tw / 2 + 4, Math.min(v.w - tw / 2 - 4, pr.x));
      const ty = pr.y - 18;
      ctx.fillStyle = "rgba(8, 14, 26, 0.72)";
      roundRect(ctx, lx - tw / 2, ty, tw, 18, 6);
      ctx.fill();
      ctx.fillStyle = ROLE_COLOR[role];
      roundRect(ctx, lx - tw / 2 + 4, ty + 15, tw - 8, 3, 1.5);
      ctx.fill();
      ctx.fillStyle = "#f4f7fb";
      ctx.fillText(label, lx, ty + 8.5);
    } else {
      ctx.font = "600 12px 'Barlow Condensed', system-ui, sans-serif";
      const label = name + (mine ? " (sen)" : "");
      const tw = ctx.measureText(label).width + 18;
      const lx = Math.max(tw / 2 + 4, Math.min(v.w - tw / 2 - 4, pr.x));
      ctx.fillStyle = "rgba(8, 14, 26, 0.75)";
      roundRect(ctx, lx - tw / 2, pr.y - 16, tw, 17, 8);
      ctx.fill();
      ctx.fillStyle = "#e8eef8";
      ctx.fillText(label, lx, pr.y - 7);
    }
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
    ctx.fillStyle = id === chaserId ? ROLE_COLOR.chaser : id === state?.evaderId ? ROLE_COLOR.evader : TEAM_COLORS[team];
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
