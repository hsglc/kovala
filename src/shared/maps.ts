import { OUT_MARGIN, QUAD_SIZE } from "./constants";

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

export const LAYOUTS: QuadLayout[] = [
  {
    // Resmî 12 m Quad'dan esinlenilmiş düzen: ortada 1,85 m kule, iki "kardeş" duvar çifti,
    // altından kayılan iki platform boşluğu, farklı yükseklikte vault blokları, çapraz başlangıç plakaları.
    id: "quad",
    name: "Resmî Quad",
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
];

export function getLayout(id: string): QuadLayout {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** Birbirinden en az `minDist` uzak iki doğma noktası seçer. rnd: 0..1 üreteci. */
export function pickSpawnPair(layout: QuadLayout, rnd: () => number, minDist = 7): [[number, number], [number, number]] {
  const pairs: [[number, number], [number, number]][] = [];
  for (const a of layout.spawns) {
    for (const c of layout.spawns) {
      if (a === c) continue;
      if (Math.hypot(a[0] - c[0], a[1] - c[1]) >= minDist) pairs.push([a, c]);
    }
  }
  return pairs[Math.floor(rnd() * pairs.length) % pairs.length];
}

export function insideQuad(x: number, y: number): boolean {
  return x >= -OUT_MARGIN && x <= QUAD_SIZE + OUT_MARGIN && y >= -OUT_MARGIN && y <= QUAD_SIZE + OUT_MARGIN;
}
