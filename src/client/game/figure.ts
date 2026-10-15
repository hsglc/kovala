/**
 * Prosedürel koşucu figürü (sprite dosyası yok, tamamen canvas çizimi).
 * Koordinatlar metre cinsinden, ayak tabanı (0,0), yukarı negatif y.
 */

export type FigureView = "side" | "front" | "back";
export type FigurePose = "run" | "cheer" | "tired";

export interface FigureLook {
  shirt: string;
  shorts: string;
  skin: string;
  hair: string;
  shoe: string;
  number: number;
}

export interface FigureState {
  view: FigureView;
  /** 1 sağa, -1 sola bakar (side görünüm) */
  face: 1 | -1;
  /** koşu döngüsü fazı (radyan) */
  phase: number;
  /** 0..1 koşu yoğunluğu */
  run: number;
  dashing: boolean;
  /** 0..1 atlama ilerlemesi, atlamıyorsa -1 */
  vault: number;
  /** kovalayan rakibe uzanıyor mu */
  reach: boolean;
  pose: FigurePose;
  time: number;
}

const SKINS = ["#f1c7a3", "#d9a77f", "#b97d55", "#8d5a3b", "#f4d2b8", "#c68e66"];
const HAIRS = ["#2a1d17", "#4a2f1f", "#151515", "#7a4a26", "#c99a4a", "#3b2a22"];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lookFor(id: string, shirt: string, shorts: string): FigureLook {
  const h = hash(id);
  return {
    shirt,
    shorts,
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >>> 8) % HAIRS.length],
    shoe: "#f1f4f9",
    number: 2 + ((h >>> 16) % 97),
  };
}

const OUTLINE = "rgba(6, 10, 20, 0.85)";

function limb(ctx: CanvasRenderingContext2D, pts: [number, number][], w: number, color: string, outline = true) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (outline) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = w + 0.045;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
}

const dir = (a: number): [number, number] => [Math.sin(a), Math.cos(a)];

/**
 * Figürü çizer. ctx, ayak noktasına çevrilmiş ve 1 birim = 1 metre olacak şekilde ölçeklenmiş olmalı.
 * Döndürdüğü değer: başın üst noktasının y'si (isim etiketi için).
 */
export function drawFigure(ctx: CanvasRenderingContext2D, look: FigureLook, st: FigureState): number {
  const vaulting = st.vault >= 0;
  const view: FigureView = vaulting || st.reach ? "side" : st.view;
  const r = vaulting ? 1 : st.run;
  let lift = 0;
  if (vaulting) lift = Math.sin(Math.min(1, st.vault) * Math.PI) * 0.55;
  if (st.pose === "cheer") lift = Math.abs(Math.sin(st.time / 170)) * 0.14;
  const bob = st.pose === "run" ? Math.abs(Math.sin(st.phase)) * 0.045 * r : 0;

  ctx.save();
  ctx.translate(0, -lift - bob);

  if (view === "side") {
    ctx.scale(st.face, 1);
    let lean = r * 0.16 + (st.dashing ? 0.32 : 0);
    if (st.pose === "tired") lean = 0.75;
    if (st.reach) lean = 0.3;
    const hip: [number, number] = [0, -0.8];
    const shoulder: [number, number] = [hip[0] + Math.sin(lean) * 0.46, hip[1] - Math.cos(lean) * 0.46];
    const headC: [number, number] = [shoulder[0] + Math.sin(lean) * 0.24, shoulder[1] - Math.cos(lean) * 0.24];

    const leg = (t: number): [number, number][] => {
      let thigh: number;
      let bend: number;
      if (vaulting) {
        thigh = 1.25;
        bend = -2.0;
      } else if (st.pose === "tired") {
        thigh = 0.35;
        bend = -0.5;
      } else if (st.pose === "cheer") {
        thigh = Math.sin(t) * 0.12;
        bend = -0.15;
      } else {
        thigh = Math.sin(t) * (0.08 + 0.72 * r);
        bend = -(0.12 + r * (0.5 + 0.75 * Math.max(0, Math.cos(t))));
      }
      const [kx, ky] = dir(thigh);
      const knee: [number, number] = [hip[0] + kx * 0.4, hip[1] + ky * 0.4];
      const [fx, fy] = dir(thigh + bend);
      const foot: [number, number] = [knee[0] + fx * 0.4, knee[1] + fy * 0.4];
      return [hip, knee, foot];
    };
    const arm = (t: number, near: boolean): [number, number][] => {
      let a: number;
      let fore: number;
      if (st.pose === "cheer") {
        a = Math.PI - 0.35 + (near ? 0.25 : -0.1);
        fore = a + 0.15;
      } else if (st.pose === "tired") {
        a = 0.95;
        fore = a - 0.6;
      } else if (st.reach && near) {
        a = 1.55;
        fore = 1.6;
      } else if (vaulting) {
        a = 1.9;
        fore = 2.2;
      } else {
        a = -Math.sin(t) * (0.15 + 0.95 * r);
        fore = a + (0.35 + 1.05 * r);
      }
      const [ex, ey] = dir(a);
      const elbow: [number, number] = [shoulder[0] + ex * 0.29, shoulder[1] + ey * 0.29];
      const [hx, hy] = dir(fore);
      const hand: [number, number] = [elbow[0] + hx * 0.27, elbow[1] + hy * 0.27];
      return [shoulder, elbow, hand];
    };

    const tFar = st.phase + Math.PI;
    const tNear = st.phase;
    // uzak bacak ve kol (gölgeli)
    const farLeg = leg(tFar);
    limb(ctx, farLeg, 0.13, shade(look.skin, 0.78));
    limb(ctx, [farLeg[0], [lerp(farLeg[0][0], farLeg[1][0], 0.55), lerp(farLeg[0][1], farLeg[1][1], 0.55)]], 0.16, shade(look.shorts, 0.75), false);
    shoeAt(ctx, farLeg[1], farLeg[2], shade(look.shoe, 0.8));
    limb(ctx, arm(tFar, false), 0.1, shade(look.skin, 0.78));

    // gövde
    torso(ctx, hip, shoulder, 0.32, look);

    const nearLeg = leg(tNear);
    limb(ctx, nearLeg, 0.13, look.skin);
    limb(ctx, [nearLeg[0], [lerp(nearLeg[0][0], nearLeg[1][0], 0.55), lerp(nearLeg[0][1], nearLeg[1][1], 0.55)]], 0.165, look.shorts, false);
    shoeAt(ctx, nearLeg[1], nearLeg[2], look.shoe);

    // baş
    head(ctx, headC, look, "side");
    limb(ctx, arm(tNear, true), 0.105, look.skin);
    ctx.restore();
    return -lift - bob + headC[1] - 0.2;
  }

  // Ön / arka görünüm
  const back = view === "back";
  const hipY = -0.8;
  const shY = -1.27;
  const headY = -1.5;
  const legX = 0.085;
  for (const side of [-1, 1] as const) {
    const t = st.phase + (side === 1 ? 0 : Math.PI);
    const up = st.pose === "run" ? Math.max(0, Math.sin(t)) * 0.22 * r : 0;
    const knee: [number, number] = [side * (legX + 0.02), hipY + 0.4 - up * 0.6];
    const foot: [number, number] = [side * (legX + 0.01), -up];
    const pts: [number, number][] = [[side * legX, hipY], knee, foot];
    limb(ctx, pts, 0.13, side === 1 ? look.skin : shade(look.skin, 0.9));
    limb(ctx, [pts[0], [knee[0], lerp(hipY, knee[1], 0.55)]], 0.16, look.shorts, false);
    ctx.fillStyle = look.shoe;
    ctx.beginPath();
    ctx.ellipse(foot[0], foot[1] - 0.02, 0.07, 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  torso(ctx, [0, hipY], [0, shY], 0.38, look, back);
  for (const side of [-1, 1] as const) {
    const t = st.phase + (side === 1 ? Math.PI : 0);
    let hand: [number, number];
    let elbow: [number, number];
    if (st.pose === "cheer") {
      elbow = [side * 0.32, shY - 0.2];
      hand = [side * 0.38, shY - 0.45];
    } else if (st.pose === "tired") {
      elbow = [side * 0.26, shY + 0.25];
      hand = [side * 0.16, hipY + 0.25];
    } else {
      const sw = Math.sin(t) * (0.08 + 0.2 * r);
      elbow = [side * 0.25, shY + 0.24 - sw * 0.4];
      hand = [side * 0.21, shY + 0.46 - sw];
    }
    limb(ctx, [[side * 0.18, shY + 0.03], elbow, hand], 0.1, look.skin);
  }
  head(ctx, [0, headY], look, back ? "back" : "front");
  ctx.restore();
  return -lift - bob + headY - 0.2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function shoeAt(ctx: CanvasRenderingContext2D, knee: [number, number], foot: [number, number], color: string) {
  const a = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) - Math.PI / 2;
  ctx.save();
  ctx.translate(foot[0], foot[1]);
  ctx.rotate(a * 0.6);
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.ellipse(0.05, 0, 0.11, 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0.05, -0.005, 0.09, 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function torso(
  ctx: CanvasRenderingContext2D,
  hip: [number, number],
  shoulder: [number, number],
  width: number,
  look: FigureLook,
  showNumber = false,
) {
  const ang = Math.atan2(shoulder[0] - hip[0], -(shoulder[1] - hip[1]));
  const len = Math.hypot(shoulder[0] - hip[0], shoulder[1] - hip[1]);
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(ang);
  // şort
  ctx.fillStyle = OUTLINE;
  roundedRect(ctx, -width / 2 - 0.025, -0.1 - 0.025, width + 0.05, 0.24, 0.07);
  ctx.fill();
  ctx.fillStyle = look.shorts;
  roundedRect(ctx, -width / 2, -0.1, width, 0.2, 0.06);
  ctx.fill();
  // forma
  ctx.fillStyle = OUTLINE;
  roundedRect(ctx, -width / 2 - 0.025, -len - 0.05, width + 0.05, len + 0.07, 0.11);
  ctx.fill();
  ctx.fillStyle = look.shirt;
  roundedRect(ctx, -width / 2, -len - 0.03, width, len + 0.03, 0.1);
  ctx.fill();
  // yan şerit
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(-width / 2 + 0.03, -len + 0.06, 0.04, len - 0.1);
  if (showNumber) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "800 0.2px 'Barlow Condensed', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(look.number), 0, -len / 2);
  }
  ctx.restore();
}

function head(ctx: CanvasRenderingContext2D, c: [number, number], look: FigureLook, view: FigureView) {
  const R = 0.2;
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(c[0], c[1], R + 0.025, 0, Math.PI * 2);
  ctx.fill();
  if (view === "back") {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(c[0], c[1], R, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(c[0], c[1], R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  if (view === "side") {
    // saç arkada ve üstte (yüz +x yönünde)
    ctx.arc(c[0], c[1], R, Math.PI * 0.55, Math.PI * 1.95);
    ctx.quadraticCurveTo(c[0] - 0.02, c[1] - 0.05, c[0] - 0.06, c[1] + 0.08);
    ctx.fill();
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.arc(c[0] + 0.1, c[1] + 0.0, 0.028, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.arc(c[0], c[1], R, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(c[0], c[1] - 0.1, c[0] - R * 0.98, c[1] - 0.02);
    ctx.fill();
    ctx.fillStyle = "#1a1410";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(c[0] + sx * 0.075, c[1] + 0.02, 0.026, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
