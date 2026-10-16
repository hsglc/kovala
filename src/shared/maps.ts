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

/** Kolaydan zora sıralı. */
export const LAYOUTS: QuadLayout[] = [...ALL_LAYOUTS].sort((a, b) => a.level - b.level);

export const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "Kolay", 2: "Orta", 3: "Zor" };

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
