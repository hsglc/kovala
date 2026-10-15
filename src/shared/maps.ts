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
}

export interface QuadLayout {
  id: string;
  name: string;
  obstacles: Obstacle[];
  spawns: [number, number][];
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
const b = (x: number, y: number, ww: number, h: number): Obstacle => ({ kind: "box", x, y, w: ww, h });
const r = (x: number, y: number, ww: number, h: number): Obstacle => ({ kind: "bar", x, y, w: ww, h });

export const LAYOUTS: QuadLayout[] = [
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
