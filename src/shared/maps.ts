import { OUT_MARGIN, QUAD_H, QUAD_W } from "./constants";

/**
 * wall: yüksek engel; tırmanılır, geçilemez.
 * box : alçak kutu; koşarken üstünden atlanır (vault) ya da zıplanır.
 * bar : yüksekte korkuluk; altından kayılır (slide), üstünden geçilemez.
 * x,y sol-üst köşe; w,h metre.
 */
export type ObstacleKind = "wall" | "box" | "bar";
export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Yükseklik (metre). Verilmezse türün varsayılanı: duvar 1,85, kutu 0,7, bar 1,15. */
  hgt?: number;
  /** Görsel modül (resmî WCT Quad parçaları). Fiziği değiştirmez. */
  mod?: QuadModule;
}

export type QuadModule = "mountain" | "sisters" | "ridge" | "loadingbay" | "tiltedcube" | "lazyboy";

export interface QuadLayout {
  id: string;
  name: string;
  obstacles: Obstacle[];
  spawns: [number, number][];
  /** Resmî başlangıç plakaları: [kovalayan, kaçan]. Varsa spawn seçimi yerine kullanılır. */
  plates?: [[number, number], [number, number]];
  /** Zorluk: 1 kolay (açık, az karar), 2 orta, 3 zor (sık engel, tırmanma ve duvar hamlesi ister) */
  level: 1 | 2 | 3;
  /** Lobide kısa açıklama */
  blurb: string;
  /** Saha teması (zemin rengi) */
  theme?: "night" | "arena";
}

const SPAWNS: [number, number][] = [
  [1, 1],
  [11, 1],
  [11, 11],
  [1, 11],
  [6, 1],
  [6, 11],
  [1, 6],
  [11, 6],
];

const w = (x: number, y: number, ww: number, h: number): Obstacle => ({ kind: "wall", x, y, w: ww, h });
const b = (x: number, y: number, ww: number, h: number, hgt?: number): Obstacle => ({ kind: "box", x, y, w: ww, h, hgt });
const r = (x: number, y: number, ww: number, h: number): Obstacle => ({ kind: "bar", x, y, w: ww, h });
const m = (o: Obstacle, mod: QuadModule): Obstacle => ({ ...o, mod });

const ALL_LAYOUTS: QuadLayout[] = [
  {
    // Kolay: açık saha, sadece kendiliğinden geçilen alçak engeller
    id: "isinma",
    name: "Isınma",
    level: 1,
    blurb: "Açık saha, alçak bloklar; hamleleri öğrenmek için",
    theme: "arena",
    spawns: SPAWNS,
    obstacles: [
      m(b(3.0, 3.0, 1.4, 0.6, 0.7), "lazyboy"),
      m(b(7.6, 8.4, 1.4, 0.6, 0.7), "lazyboy"),
      m(b(8.4, 2.8, 0.6, 1.4, 1.0), "tiltedcube"),
      m(b(3.0, 7.8, 0.6, 1.4, 1.0), "tiltedcube"),
      m(r(5.1, 5.75, 1.8, 0.45), "loadingbay"),
      // Etrafında dönülecek iki kule
      m(w(2.4, 5.4, 1.2, 1.2), "mountain"),
      m(w(8.4, 5.4, 1.2, 1.2), "mountain"),
    ],
  },
  {
    // Kolay: tek kule etrafında döngü, iki kayma platformu
    id: "avlu",
    name: "Açık Avlu",
    level: 1,
    blurb: "Büyük merkez kule ve dört küçük kule; sadece koş ve dön",
    theme: "arena",
    spawns: SPAWNS,
    obstacles: [
      m(w(5.1, 5.1, 1.8, 1.8), "mountain"),
      m(w(2.9, 2.9, 0.9, 0.9), "sisters"),
      m(w(8.2, 2.9, 0.9, 0.9), "sisters"),
      m(w(2.9, 8.2, 0.9, 0.9), "sisters"),
      m(w(8.2, 8.2, 0.9, 0.9), "sisters"),
      m(b(5.4, 1.9, 1.2, 0.5, 0.7), "lazyboy"),
      m(b(5.4, 9.6, 1.2, 0.5, 0.7), "lazyboy"),
    ],
  },
  {
    // Resmî 12 m Quad'dan esinlenilmiş düzen: ortada 1,85 m kule, iki "kardeş" duvar çifti,
    // altından kayılan iki platform boşluğu, farklı yükseklikte vault blokları, çapraz başlangıç plakaları.
    id: "quad",
    name: "Resmî Quad",
    level: 2,
    blurb: "Gerçek WCT modülleri: Mountain, Sisters, Ridge, Loading Bay",
    theme: "arena",
    spawns: SPAWNS,
    plates: [
      [1.1, 10.9],
      [10.9, 1.1],
    ],
    obstacles: [
      // The Mountain: merkezdeki eğimli etekli 1,85 m kule
      m(w(5.4, 5.4, 1.2, 1.2), "mountain"),
      // The Sisters: köşelerde yan yana ikiz kuleler
      m(w(2.4, 2.4, 1.0, 1.0), "sisters"),
      m(w(8.6, 8.6, 1.0, 1.0), "sisters"),
      // The Ridge: uzun tic-tac duvarları, sırtında çelik tutamak
      m(w(2.0, 7.9, 0.3, 2.1), "ridge"),
      m(w(9.7, 2.0, 0.3, 2.1), "ridge"),
      // Loading Bay: altından kayılan yükseltilmiş platform
      m(r(5.1, 2.6, 1.8, 0.45), "loadingbay"),
      m(r(5.1, 8.95, 1.8, 0.45), "loadingbay"),
      // Tilted Cube: eğik üstlü 1,0 m vault bloğu
      m(b(8.5, 2.6, 1.2, 0.6, 1.0), "tiltedcube"),
      m(b(2.3, 8.8, 1.2, 0.6, 1.0), "tiltedcube"),
      // Lazy Boy: yaslanmış koltuk gibi eğimli 0,7 m blok
      m(b(3.0, 5.3, 0.6, 1.4, 0.7), "lazyboy"),
      m(b(8.4, 5.3, 0.6, 1.4, 0.7), "lazyboy"),
    ],
  },
  {
    id: "klasik",
    name: "Klasik",
    level: 2,
    blurb: "Merkez kule, köşe duvarları, iki kayma barı",
    spawns: SPAWNS,
    obstacles: [
      w(5, 5, 2, 2),
      w(2, 2, 1.6, 0.35),
      w(9.65, 2, 0.35, 1.6),
      w(8.4, 9.65, 1.6, 0.35),
      w(2, 8.4, 0.35, 1.6),
      r(5, 2.5, 2, 0.4),
      r(5, 9.1, 2, 0.4),
      b(2.3, 5, 0.8, 2),
      b(8.9, 5, 0.8, 2),
    ],
  },
  {
    id: "labirent",
    name: "Labirent",
    level: 3,
    blurb: "L duvarlar ve köşe kuleleri; kör noktalar çok",
    spawns: SPAWNS,
    obstacles: [
      w(3, 3, 2.2, 0.35),
      w(3, 3, 0.35, 2.2),
      w(6.8, 8.65, 2.2, 0.35),
      w(8.65, 6.8, 0.35, 2.2),
      w(5.6, 5.6, 0.8, 0.8),
      w(8.2, 2.4, 1.4, 1.4),
      w(2.4, 8.2, 1.4, 1.4),
      b(5.2, 3.6, 1.6, 0.7),
      b(5.2, 7.7, 1.6, 0.7),
      r(3.75, 5.2, 0.4, 1.6),
      r(7.85, 5.2, 0.4, 1.6),
    ],
  },
  {
    id: "sutunlar",
    name: "Dört Sütun",
    level: 2,
    blurb: "Dört kule etrafında döngüler",
    spawns: SPAWNS,
    obstacles: [
      w(2.7, 2.7, 1.1, 1.1),
      w(8.2, 2.7, 1.1, 1.1),
      w(2.7, 8.2, 1.1, 1.1),
      w(8.2, 8.2, 1.1, 1.1),
      w(5.65, 5.65, 0.7, 0.7),
      r(5.1, 2.75, 1.8, 0.4),
      b(5.1, 8.7, 1.8, 0.7),
      b(2.6, 5.1, 0.7, 1.8),
      r(8.85, 5.1, 0.4, 1.8),
    ],
  },
  {
    // Zor: 3×3 kule ızgarası; aralar bar, blok ya da ikiz kule. Her köşede karar.
    id: "kafes",
    name: "Kafes",
    level: 3,
    blurb: "Dokuz kule ızgarası; aralar bar, blok ve dar yarıklarla dolu",
    theme: "arena",
    spawns: SPAWNS,
    obstacles: [
      m(w(2.4, 2.4, 0.8, 0.8), "sisters"),
      m(w(5.6, 2.4, 0.8, 0.8), "sisters"),
      m(w(8.8, 2.4, 0.8, 0.8), "sisters"),
      m(w(2.4, 5.6, 0.8, 0.8), "sisters"),
      m(w(5.5, 5.5, 1.0, 1.0), "mountain"),
      m(w(8.8, 5.6, 0.8, 0.8), "sisters"),
      m(w(2.4, 8.8, 0.8, 0.8), "sisters"),
      m(w(5.6, 8.8, 0.8, 0.8), "sisters"),
      m(w(8.8, 8.8, 0.8, 0.8), "sisters"),
      // Kule araları: kayılır ya da atlanır, hiçbiri yolu kapatmaz
      m(r(3.65, 2.55, 1.5, 0.45), "loadingbay"),
      m(b(7.05, 2.6, 1.2, 0.4, 0.7), "lazyboy"),
      m(r(8.95, 3.65, 0.45, 1.5), "loadingbay"),
      m(b(2.6, 7.05, 0.4, 1.2, 0.7), "lazyboy"),
      m(r(2.55, 3.65, 0.45, 1.5), "loadingbay"),
      m(b(9.0, 7.05, 0.4, 1.2, 1.0), "tiltedcube"),
      m(b(3.75, 9.0, 1.2, 0.4, 1.0), "tiltedcube"),
      m(r(6.85, 8.95, 1.5, 0.45), "loadingbay"),
    ],
  },
  {
    // Zor: üç uzun tic-tac duvarı yılan gibi koridorlar açar; kısa yol duvarın üstünden.
    id: "yilan",
    name: "Yılan Yolu",
    level: 3,
    blurb: "Uzun duvarlar arasında zikzak koridorlar; kestirme duvarın üstünden",
    theme: "arena",
    spawns: SPAWNS,
    obstacles: [
      m(w(2.0, 3.1, 5.8, 0.3), "ridge"),
      m(w(4.2, 5.85, 5.8, 0.3), "ridge"),
      m(w(2.0, 8.6, 5.8, 0.3), "ridge"),
      // Koridor içi engeller
      m(r(8.4, 3.05, 1.8, 0.45), "loadingbay"),
      m(b(2.6, 5.6, 1.2, 0.6, 1.0), "tiltedcube"),
      m(r(8.4, 8.55, 1.8, 0.45), "loadingbay"),
      m(b(5.4, 1.6, 1.2, 0.5, 0.7), "lazyboy"),
      m(b(5.4, 9.9, 1.2, 0.5, 0.7), "lazyboy"),
      m(w(9.9, 4.2, 0.8, 0.8), "sisters"),
    ],
  },
];

/* ---------- Büyük saha ----------
 * Düzenler 12 m Quad için çizildi. Saha QUAD_W × QUAD_H'ye (yatay dikdörtgen) büyür:
 * 1. Engel merkezleri orantılı yayılır, boyutları gerçek ekipman ölçüsünde kalır.
 * 2. Açılan boşluğa, alan oranında (≈1,8×) yeni engel eklenir: haritanın kendi parça
 *    paletinden, merkeze göre nokta simetrik çiftler hâlinde (iki başlangıç köşesi eşit kalsın),
 *    koşu koridorları ve doğma noktaları açık bırakılarak. Tohum harita kimliğinden gelir:
 *    sunucu ve istemci aynı haritayı üretir.
 */
const BASE = 12;
const KX = QUAD_W / BASE;
const KY = QUAD_H / BASE;
/** Seviyeye göre engeller arası en dar koridor (m) */
const LANE: Record<1 | 2 | 3, number> = { 1: 1.7, 2: 1.45, 3: 1.25 };

function hashStr(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function seededRnd(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
/**
 * Doğma noktaları: geniş sahada köşeden köşeye başlamak chase'i koşu yarışına çevirirdi.
 * Orta bantta, kenardan 1 m içeride bir ızgara; eşleştirme 9-15 m arası çiftleri seçer.
 */
function spawnGrid(): [number, number][] {
  const out: [number, number][] = [];
  for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) for (const y of [1, QUAD_H / 2, QUAD_H - 1]) out.push([+(QUAD_W * fx).toFixed(2), +y.toFixed(2)]);
  return out;
}
function gapBetween(a: Obstacle, b: Obstacle) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}
function ptDist(o: Obstacle, x: number, y: number) {
  const cx = Math.max(o.x, Math.min(x, o.x + o.w));
  const cy = Math.max(o.y, Math.min(y, o.y + o.h));
  return Math.hypot(x - cx, y - cy);
}

function grow(L: QuadLayout): QuadLayout {
  if ((QUAD_W as number) === BASE && (QUAD_H as number) === BASE) return L;
  const W = QUAD_W;
  const H = QUAD_H;
  // Birbirine değen parçalar (ör. L duvar) tek grup olarak taşınır; uzun duvarlar (≥3 m) sahayla uzar
  const n = L.obstacles.length;
  const group = L.obstacles.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (gapBetween(L.obstacles[i], L.obstacles[j]) < 0.05) group[root(i)] = root(j);
  const shift = new Map<number, [number, number]>();
  for (let i = 0; i < n; i++) {
    const r = root(i);
    if (shift.has(r)) continue;
    const mem = L.obstacles.filter((_, j) => root(j) === r);
    const x0 = Math.min(...mem.map((o) => o.x));
    const x1 = Math.max(...mem.map((o) => o.x + o.w));
    const y0 = Math.min(...mem.map((o) => o.y));
    const y1 = Math.max(...mem.map((o) => o.y + o.h));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    shift.set(r, [cx * KX - cx, cy * KY - cy]);
  }
  const spread = L.obstacles.map((o, i) => {
    const [dx, dy] = shift.get(root(i))!;
    let { x, y, w: ow, h: oh } = o;
    const solo = L.obstacles.every((e, j) => j === i || root(j) !== root(i));
    if (solo && o.kind === "wall" && Math.max(ow, oh) >= 3) {
      // Uzun duvar: merkezini koruyarak uzun kenarını o eksenin oranında büyüt (en çok 1,8 kat)
      const cx = x + ow / 2;
      const cy = y + oh / 2;
      if (ow >= oh) ow *= Math.min(1.8, KX);
      else oh *= Math.min(1.8, KY);
      x = cx - ow / 2;
      y = cy - oh / 2;
    }
    return { ...o, w: +ow.toFixed(2), h: +oh.toFixed(2), x: +(x + dx).toFixed(2), y: +(y + dy).toFixed(2) };
  });
  const spawns = spawnGrid();
  const plates = L.plates
    ? ([
        [+(W * 0.3).toFixed(2), +(H * 0.78).toFixed(2)],
        [+(W * 0.7).toFixed(2), +(H * 0.22).toFixed(2)],
      ] as QuadLayout["plates"])
    : undefined;
  const keepClear: [number, number][] = [...spawns, ...(plates ?? [])];
  const lane = LANE[L.level];
  const rnd = seededRnd(hashStr(L.id));
  // Yayılmış özgün engellerden doğma noktasına çakışanları at
  const out = spread.filter((o) => keepClear.every(([x, y]) => ptDist(o, x, y) >= 1.0));
  const target = Math.round(L.obstacles.length * KX * KY);
  const fits = (o: Obstacle) => {
    if (o.x < 0.9 || o.y < 0.9 || o.x + o.w > W - 0.9 || o.y + o.h > H - 0.9) return false;
    for (const e of out) if (gapBetween(o, e) < lane) return false;
    for (const [x, y] of keepClear) if (ptDist(o, x, y) < 1.4) return false;
    return true;
  };
  for (let tries = 0; tries < 9000 && out.length < target; tries++) {
    const t = L.obstacles[Math.floor(rnd() * L.obstacles.length)];
    const rot = rnd() < 0.5;
    const ww = rot ? t.h : t.w;
    const hh = rot ? t.w : t.h;
    const cx = 1 + rnd() * (W - 2);
    const cy = 1 + rnd() * (H - 2);
    const a: Obstacle = { ...t, w: ww, h: hh, x: +(cx - ww / 2).toFixed(2), y: +(cy - hh / 2).toFixed(2) };
    // Merkeze göre 180° döndürülmüş eşi (aynı en/boy): iki başlangıç tarafı eşit
    const bb: Obstacle = { ...a, x: +(W - a.x - a.w).toFixed(2), y: +(H - a.y - a.h).toFixed(2) };
    if (!fits(a)) continue;
    out.push(a);
    if (gapBetween(a, bb) < lane || !fits(bb)) {
      out.pop();
      continue;
    }
    out.push(bb);
  }
  return { ...L, obstacles: out, spawns, plates };
}

/** Kolaydan zora sıralı. */
export const LAYOUTS: QuadLayout[] = ALL_LAYOUTS.map(grow).sort((a, b) => a.level - b.level);

export const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "Kolay", 2: "Orta", 3: "Zor" };

export function getLayout(id: string): QuadLayout {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** Birbirinden en az `minDist` uzak iki doğma noktası seçer. rnd: 0..1 üreteci. */
export function pickSpawnPair(layout: QuadLayout, rnd: () => number, minDist = 9, maxDist = 15): [[number, number], [number, number]] {
  const pairs: [[number, number], [number, number]][] = [];
  for (const a of layout.spawns) {
    for (const c of layout.spawns) {
      if (a === c) continue;
      const d = Math.hypot(a[0] - c[0], a[1] - c[1]);
      if (d >= minDist && d <= maxDist) pairs.push([a, c]);
    }
  }
  return pairs[Math.floor(rnd() * pairs.length) % pairs.length];
}

export function insideQuad(x: number, y: number): boolean {
  return x >= -OUT_MARGIN && x <= QUAD_W + OUT_MARGIN && y >= -OUT_MARGIN && y <= QUAD_H + OUT_MARGIN;
}
