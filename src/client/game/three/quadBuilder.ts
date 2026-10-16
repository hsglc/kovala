import * as THREE from "three";
import { QUAD_SIZE } from "../../../shared/constants";
import type { Obstacle, QuadLayout } from "../../../shared/maps";
import { obstacleHeight } from "../../../shared/sim";

/**
 * Resmî Quad malzemelerini taklit eden prosedürel engeller:
 * - 18 mm deniz kontrplağı yüzeyler (üstte doğal huş, yanlarda koyu boyalı panel)
 * - Galvanizli çelik boru iskele ve kelepçeler
 * - Altından kayılan platform boşlukları, üstünden vault yapılan bloklar
 */

function woodTexture(base: string, grain: string, seed: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // damar çizgileri
  for (let i = 0; i < 46; i++) {
    const y = rnd() * 256;
    const amp = 2 + rnd() * 6;
    const freq = 0.01 + rnd() * 0.03;
    g.strokeStyle = grain;
    g.globalAlpha = 0.08 + rnd() * 0.16;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * freq + i) * amp);
    g.stroke();
  }
  // budak
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.18;
    g.fillStyle = grain;
    g.beginPath();
    g.ellipse(rnd() * 256, rnd() * 256, 4 + rnd() * 5, 2 + rnd() * 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export interface QuadMaterials {
  birch: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  edge: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  clamp: THREE.MeshStandardMaterial;
  pad: THREE.MeshStandardMaterial;
}

export function makeMaterials(): QuadMaterials {
  return {
    birch: new THREE.MeshStandardMaterial({ map: woodTexture("#d8b98a", "#8a5f2e", 7), roughness: 0.78 }),
    panel: new THREE.MeshStandardMaterial({ map: woodTexture("#23293a", "#0e121c", 13), roughness: 0.85 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xe9c995, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc7ced8, roughness: 0.32, metalness: 0.85 }),
    clamp: new THREE.MeshStandardMaterial({ color: 0x8b939e, roughness: 0.4, metalness: 0.9 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.95 }),
  };
}

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Kenarlara 18 mm kontrplak kalınlığını gösteren açık renk şerit. */
function plyEdgeTrim(w: number, d: number, y: number, mats: QuadMaterials): THREE.Group {
  const g = new THREE.Group();
  const t = 0.018;
  for (const [x, z, sx, sz] of [
    [0, d / 2, w, t],
    [0, -d / 2, w, t],
    [w / 2, 0, t, d],
    [-w / 2, 0, t, d],
  ] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.002, 0.022, sz + 0.002), mats.edge);
    m.position.set(x, y, z);
    g.add(m);
  }
  return g;
}

function tube(len: number, r: number, mat: THREE.Material): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat));
}

function clampAt(x: number, y: number, z: number, mats: QuadMaterials): THREE.Mesh {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.07, 8), mats.clamp);
  c.position.set(x, y, z);
  return c;
}

/** Duvar / kule: koyu boyalı kontrplak gövde, doğal huş üst, köşelerde galvaniz direkler. */
function buildWall(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = new THREE.Group();
  const birch = mats.birch.clone();
  birch.map = mats.birch.map!.clone();
  birch.map.repeat.set(Math.max(1, o.w), Math.max(1, o.h));
  birch.map.needsUpdate = true;
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(o.w, H - 0.02, o.h), [mats.panel, mats.panel, birch, mats.pad, mats.panel, mats.panel]));
  body.position.y = (H - 0.02) / 2;
  g.add(body);
  g.add(plyEdgeTrim(o.w, o.h, H - 0.01, mats));
  // Köşe direkleri ve yatay kuşaklar (iskelenin dışarıdan görünen kısmı)
  const post = 0.024;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = tube(H, post, mats.steel);
      t.position.set((sx * o.w) / 2, H / 2, (sz * o.h) / 2);
      g.add(t);
      g.add(clampAt((sx * o.w) / 2, H * 0.5, (sz * o.h) / 2, mats));
    }
  }
  // Tutunma kenarı: üst kenarda yuvarlatılmış boru
  for (const [x, z, len, rotY] of [
    [0, o.h / 2, o.w, 0],
    [0, -o.h / 2, o.w, 0],
    [o.w / 2, 0, o.h, Math.PI / 2],
    [-o.w / 2, 0, o.h, Math.PI / 2],
  ] as const) {
    const t = tube(len, post * 0.9, mats.steel);
    t.rotation.z = Math.PI / 2;
    t.rotation.y = rotY;
    t.position.set(x, H - 0.03, z);
    g.add(t);
  }
  // Uzun duvarlarda tic-tac için basamak çizgileri (görsel ipucu)
  if (Math.max(o.w, o.h) / Math.min(o.w, o.h) > 3) {
    const along = o.w > o.h;
    for (let i = 1; i < 4; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(along ? 0.02 : o.w + 0.004, H * 0.6, along ? o.h + 0.004 : 0.02), mats.edge);
      line.position.set(along ? -o.w / 2 + (o.w * i) / 4 : 0, H * 0.45, along ? 0 : -o.h / 2 + (o.h * i) / 4);
      g.add(line);
    }
  }
  return g;
}

/** Vault bloğu: her yüzü doğal kontrplak, yuvarlatılmış koyu kenar pedi. */
function buildBox(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = new THREE.Group();
  const birch = mats.birch.clone();
  birch.map = mats.birch.map!.clone();
  birch.map.repeat.set(Math.max(1, o.w), Math.max(1, o.h));
  birch.map.needsUpdate = true;
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(o.w, H, o.h), birch));
  body.position.y = H / 2;
  g.add(body);
  g.add(plyEdgeTrim(o.w, o.h, H + 0.001, mats));
  // Üst kenar pedleri (vault yapılan kenar)
  for (const [x, z, sx, sz] of [
    [0, o.h / 2, o.w, 0.06],
    [0, -o.h / 2, o.w, 0.06],
    [o.w / 2, 0, 0.06, o.h],
    [-o.w / 2, 0, 0.06, o.h],
  ] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.01, 0.05, sz + 0.01), mats.pad);
    p.position.set(x, H - 0.02, z);
    g.add(p);
  }
  // Alt çelik ayak çerçevesi
  const foot = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.03, 0.05, o.h + 0.03), mats.steel);
  foot.position.y = 0.025;
  g.add(foot);
  return g;
}

/**
 * Kayma boşluğu: iki iskele ayağı üzerinde yükseltilmiş kontrplak platform.
 * Altı açık (kayarak geçilir), üstü 0,6 m genişliğinde.
 */
function buildBar(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = new THREE.Group();
  const horizontal = o.w >= o.h;
  const len = horizontal ? o.w : o.h;
  const depth = 0.6;
  const deckT = 0.12;
  const birch = mats.birch.clone();
  birch.map = mats.birch.map!.clone();
  birch.map.repeat.set(Math.max(1, len), 1);
  birch.map.needsUpdate = true;
  const deck = shadowed(
    new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : depth, deckT, horizontal ? depth : len), [mats.panel, mats.panel, birch, mats.panel, mats.panel, mats.panel]),
  );
  deck.position.y = H + deckT / 2;
  g.add(deck);
  // Alt kenarda yakalama borusu (kaymada tutunulan bar)
  const bar = tube(len, 0.03, mats.steel);
  bar.rotation.z = horizontal ? Math.PI / 2 : 0;
  bar.rotation.x = horizontal ? 0 : Math.PI / 2;
  bar.position.set(0, H - 0.02, 0);
  g.add(bar);
  // İskele ayakları + çapraz destek
  for (const s of [-1, 1]) {
    for (const sd of [-1, 1]) {
      const t = tube(H + deckT, 0.026, mats.steel);
      const px = horizontal ? (s * len) / 2 : (sd * depth) / 2;
      const pz = horizontal ? (sd * depth) / 2 : (s * len) / 2;
      t.position.set(px, (H + deckT) / 2, pz);
      g.add(t);
      g.add(clampAt(px, H - 0.08, pz, mats));
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.14), mats.clamp);
      base.position.set(px, 0.006, pz);
      g.add(base);
    }
    const brace = tube(Math.hypot(depth, H * 0.7), 0.018, mats.steel);
    brace.position.set(horizontal ? (s * len) / 2 : 0, H * 0.45, horizontal ? 0 : (s * len) / 2);
    brace.rotation.set(horizontal ? Math.atan2(depth, H * 0.7) : 0, 0, horizontal ? 0 : Math.atan2(depth, H * 0.7));
    g.add(brace);
  }
  // Zeminde "altından geç" oku
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(horizontal ? len - 0.2 : 0.5, horizontal ? 0.5 : len - 0.2),
    new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.012;
  g.add(mark);
  return g;
}


/* ---------- Resmî WCT Quad modülleri ---------- */

function birchFor(mats: QuadMaterials, rx: number, ry: number): THREE.MeshStandardMaterial {
  const m = mats.birch.clone();
  m.map = mats.birch.map!.clone();
  m.map.repeat.set(Math.max(1, rx), Math.max(1, ry));
  m.map.needsUpdate = true;
  return m;
}

/** Üstü eğik kontrplak gövde: üst yüz yüksekliği bir eksen boyunca hA → hB. */
function slopedBlock(w: number, d: number, hA: number, hB: number, alongX: boolean, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, 1, d);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0.5) continue;
    const t = alongX ? pos.getX(i) / w + 0.5 : pos.getZ(i) / d + 0.5;
    pos.setY(i, hA + (hB - hA) * t);
  }
  geo.computeVertexNormals();
  return shadowed(new THREE.Mesh(geo, mat));
}

/** Kontrplak kenarlarını gösteren ince açık çizgiler. */
function edgeLines(mesh: THREE.Mesh, color = 0xe9c995): THREE.LineSegments {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  l.position.copy(mesh.position);
  l.rotation.copy(mesh.rotation);
  return l;
}

function railAround(g: THREE.Group, w: number, d: number, y: number, mats: QuadMaterials) {
  for (const [x, z, len, rotY] of [
    [0, d / 2, w, 0],
    [0, -d / 2, w, 0],
    [w / 2, 0, d, Math.PI / 2],
    [-w / 2, 0, d, Math.PI / 2],
  ] as const) {
    const t = tube(len, 0.022, mats.steel);
    t.rotation.z = Math.PI / 2;
    t.rotation.y = rotY;
    t.position.set(x, y, z);
    g.add(t);
  }
}

/** The Mountain: eğimli kontrplak etekler üstünde dik kule; tepede huş platform. */
function buildMountain(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = new THREE.Group();
  const base = Math.min(o.w, o.h);
  const top = base * 0.66;
  const skirtH = H * 0.55;
  const r = Math.SQRT1_2;
  const skirt = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(top * r, base * r, skirtH, 4, 1), [mats.panel, mats.pad, mats.pad]));
  skirt.rotation.y = Math.PI / 4;
  skirt.position.y = skirtH / 2;
  skirt.scale.set(o.w / base, 1, o.h / base);
  g.add(skirt);
  g.add(edgeLines(skirt));
  const upperH = H - skirtH;
  const tw = top * (o.w / base);
  const td = top * (o.h / base);
  const upper = shadowed(new THREE.Mesh(new THREE.BoxGeometry(tw, upperH, td), [mats.panel, mats.panel, birchFor(mats, tw, td), mats.pad, mats.panel, mats.panel]));
  upper.position.y = skirtH + upperH / 2;
  g.add(upper);
  g.add(plyEdgeTrim(tw, td, H - 0.005, mats));
  railAround(g, tw, td, H - 0.03, mats);
  // Eteklerdeki tutunma çıtaları
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const slat = new THREE.Mesh(new THREE.BoxGeometry((base + top) * 0.42, 0.035, 0.035), mats.edge);
    const rr = (base + top) / 4 + 0.02;
    slat.position.set(Math.sin(a) * rr * (o.w / base), skirtH * 0.5, Math.cos(a) * rr * (o.h / base));
    slat.rotation.y = a;
    g.add(slat);
  }
  // Köşe direkleri
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const t = tube(upperH, 0.022, mats.steel);
      t.position.set((sx * tw) / 2, skirtH + upperH / 2, (sz * td) / 2);
      g.add(t);
    }
  return g;
}

/** The Sisters: aynı yükseklikte yan yana iki ince kule, aralarında dar yarık. */
function buildSisters(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = new THREE.Group();
  const gap = 0.12;
  const alongX = o.w >= o.h;
  const tw = alongX ? (o.w - gap) / 2 : o.w;
  const td = alongX ? o.h : (o.h - gap) / 2;
  for (const s of [-1, 1]) {
    const off = s * ((alongX ? tw : td) / 2 + gap / 2);
    const tower = shadowed(new THREE.Mesh(new THREE.BoxGeometry(tw, H - 0.02, td), [mats.panel, mats.panel, birchFor(mats, tw, td), mats.pad, mats.panel, mats.panel]));
    tower.position.set(alongX ? off : 0, (H - 0.02) / 2, alongX ? 0 : off);
    g.add(tower);
    const trim = plyEdgeTrim(tw, td, H - 0.01, mats);
    trim.position.set(tower.position.x, 0, tower.position.z);
    g.add(trim);
    // Her kulede iki yatay tutunma çıtası
    for (const y of [H * 0.38, H * 0.7]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(alongX ? tw + 0.01 : td + 0.01, 0.035, 0.03), mats.edge);
      slat.position.set(tower.position.x, y, tower.position.z);
      if (!alongX) slat.rotation.y = Math.PI / 2;
      const front = slat.clone();
      slat.position[alongX ? "z" : "x"] += (alongX ? td : tw) / 2 + 0.012;
      front.position[alongX ? "z" : "x"] -= (alongX ? td : tw) / 2 + 0.012;
      g.add(slat, front);
    }
  }
  // Yarığı iki kuleyi bağlayan çelik kuşaklar (üst ve alt)
  for (const y of [0.15, H - 0.08]) {
    for (const sd of [-1, 1]) {
      const t = tube((alongX ? o.w : o.h) + 0.02, 0.02, mats.steel);
      t.rotation.z = alongX ? Math.PI / 2 : 0;
      t.rotation.x = alongX ? 0 : Math.PI / 2;
      t.position.set(alongX ? 0 : (sd * o.w) / 2, y, alongX ? (sd * o.h) / 2 : 0);
      g.add(t);
    }
  }
  return g;
}

/** The Ridge: uzun tic-tac duvarı; açık iskele çaprazları ve sırtında yuvarlak çelik tutamak. */
function buildRidge(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = buildWall(o, mats, H);
  const alongX = o.w > o.h;
  const len = alongX ? o.w : o.h;
  const thick = alongX ? o.h : o.w;
  // Sırt boru (tepede, duvar boyunca)
  const ridge = tube(len + 0.04, 0.045, mats.steel);
  ridge.rotation.z = alongX ? Math.PI / 2 : 0;
  ridge.rotation.x = alongX ? 0 : Math.PI / 2;
  ridge.position.y = H + 0.02;
  g.add(ridge);
  // Uçlarda iskele çaprazı (dışarıdan görünen galvaniz)
  for (const s of [-1, 1]) {
    for (const sd of [-1, 1]) {
      const b = tube(Math.hypot(thick, H * 0.8), 0.016, mats.steel);
      b.rotation.set(alongX ? 0 : 0, 0, 0);
      const ang = Math.atan2(thick, H * 0.8) * sd;
      if (alongX) b.rotation.x = ang;
      else b.rotation.z = ang;
      const end = (s * len) / 2 + s * 0.03;
      b.position.set(alongX ? end : 0, H * 0.45, alongX ? 0 : end);
      g.add(b);
    }
  }
  // Ayak plakaları
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.2 : 0.6, 0.02, alongX ? 0.6 : 0.2), mats.clamp);
    foot.position.set(alongX ? (s * len) / 2 : 0, 0.01, alongX ? 0 : (s * len) / 2);
    g.add(foot);
  }
  return g;
}

/** Loading Bay: kayma boşluğu olan platform; uçlarda kapalı kontrplak bölmeler ve sarı-siyah uyarı bandı. */
function buildLoadingBay(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = buildBar(o, mats, H);
  const horizontal = o.w >= o.h;
  const len = horizontal ? o.w : o.h;
  const depth = 0.6;
  // Uyarı bandı dokusu
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f5c518";
  x.fillRect(0, 0, 256, 32);
  x.fillStyle = "#14161c";
  for (let i = -32; i < 288; i += 32) {
    x.beginPath();
    x.moveTo(i, 32);
    x.lineTo(i + 16, 32);
    x.lineTo(i + 32, 0);
    x.lineTo(i + 16, 0);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(len * 2, 1);
  const hazard = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  for (const sd of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.1), hazard);
    band.position.set(horizontal ? 0 : (sd * (depth / 2 + 0.002)), H + 0.06, horizontal ? sd * (depth / 2 + 0.002) : 0);
    band.rotation.y = horizontal ? (sd > 0 ? 0 : Math.PI) : (sd > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.add(band);
  }
  // Uçlarda kapalı bölmeler (bay duvarları)
  for (const s of [-1, 1]) {
    const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 0.04 : depth, H, horizontal ? depth : 0.04), mats.panel));
    wall.position.set(horizontal ? (s * (len / 2 - 0.02)) : 0, H / 2, horizontal ? 0 : s * (len / 2 - 0.02));
    g.add(wall);
  }
  return g;
}

/** Tilted Cube: üst yüzü eğik vault bloğu (alçak kenardan basılır, yüksek kenardan atlanır). */
function buildTiltedCube(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = new THREE.Group();
  const alongX = o.w >= o.h;
  const birch = birchFor(mats, o.w, o.h);
  const body = slopedBlock(o.w, o.h, H * 0.78, H * 1.1, !alongX, [birch, birch, birch, birch, birch, birch]);
  g.add(body);
  g.add(edgeLines(body, 0x8a5f2e));
  // Eğik yüzde koyu kaymaz şeritler
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = H * 0.78 + (H * 1.1 - H * 0.78) * t + 0.006;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(alongX ? o.w - 0.06 : 0.05, 0.012, alongX ? 0.05 : o.h - 0.06), mats.pad);
    if (alongX) strip.position.set(0, y, -o.h / 2 + o.h * t);
    else strip.position.set(-o.w / 2 + o.w * t, y, 0);
    g.add(strip);
  }
  const foot = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.03, 0.05, o.h + 0.03), mats.steel);
  foot.position.y = 0.025;
  g.add(foot);
  return g;
}

/** Lazy Boy: yaslanmış koltuk biçimli blok; bir yanı alçak oturak, diğer yanı yüksek sırtlık. */
function buildLazyBoy(o: Obstacle, mats: QuadMaterials, H: number): THREE.Group {
  const g = new THREE.Group();
  const alongX = o.w >= o.h;
  const birch = birchFor(mats, o.w, o.h);
  const seatH = H * 0.86;
  const len = alongX ? o.w : o.h;
  const thick = alongX ? o.h : o.w;
  const seatLen = len * 0.55;
  // Oturak (alçak düz kısım)
  const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(alongX ? seatLen : thick, seatH, alongX ? thick : seatLen), birch));
  seat.position.set(alongX ? -len / 2 + seatLen / 2 : 0, seatH / 2, alongX ? 0 : -len / 2 + seatLen / 2);
  g.add(seat, edgeLines(seat, 0x8a5f2e));
  // Yaslanmış sırtlık (yükselen eğim)
  const backLen = len - seatLen;
  const back = slopedBlock(alongX ? backLen : thick, alongX ? thick : backLen, seatH, H * 1.12, alongX, [mats.panel, mats.panel, birch, mats.pad, mats.panel, mats.panel]);
  back.position.set(alongX ? len / 2 - backLen / 2 : 0, 0, alongX ? 0 : len / 2 - backLen / 2);
  g.add(back, edgeLines(back, 0x8a5f2e));
  // Kol dayama çıtaları
  for (const sd of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(alongX ? seatLen : 0.05, 0.05, alongX ? 0.05 : seatLen), mats.pad);
    arm.position.set(alongX ? seat.position.x : (sd * thick) / 2, seatH + 0.02, alongX ? (sd * thick) / 2 : seat.position.z);
    g.add(arm);
  }
  const foot = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.03, 0.05, o.h + 0.03), mats.steel);
  foot.position.y = 0.025;
  g.add(foot);
  return g;
}

export function buildObstacle(o: Obstacle, mats: QuadMaterials): THREE.Group {
  const H = obstacleHeight(o);
  let g: THREE.Group;
  switch (o.mod) {
    case "mountain":
      g = buildMountain(o, mats, H);
      break;
    case "sisters":
      g = buildSisters(o, mats, H);
      break;
    case "ridge":
      g = buildRidge(o, mats, H);
      break;
    case "loadingbay":
      g = buildLoadingBay(o, mats, H);
      break;
    case "tiltedcube":
      g = buildTiltedCube(o, mats, H);
      break;
    case "lazyboy":
      g = buildLazyBoy(o, mats, H);
      break;
    default:
      g = o.kind === "wall" ? buildWall(o, mats, H) : o.kind === "box" ? buildBox(o, mats, H) : buildBar(o, mats, H);
  }
  g.position.set(o.x + o.w / 2, 0, o.y + o.h / 2);
  g.userData.obstacle = o;
  return g;
}

/** Saha zemini: resmî Quad'daki gibi koyu kauçuk zemin, beyaz sınır, başlangıç plakaları. */
export function buildFloor(layout: QuadLayout): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const x = c.getContext("2d")!;
  const arena = layout.theme === "arena";
  x.fillStyle = arena ? "#1b2433" : "#26395a";
  x.fillRect(0, 0, 1024, 1024);
  // ince kauçuk dokusu
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    x.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // metre çizgileri (çok silik)
  x.strokeStyle = "rgba(170,200,240,0.05)";
  x.lineWidth = 2;
  const step = 1024 / QUAD_SIZE;
  for (let i = step; i < 1024; i += step) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 1024);
    x.moveTo(0, i);
    x.lineTo(1024, i);
    x.stroke();
  }
  // merkez logo halkası
  x.strokeStyle = "rgba(232,238,247,0.16)";
  x.lineWidth = 5;
  x.beginPath();
  x.arc(512, 512, 150, 0, Math.PI * 2);
  x.stroke();
  x.font = "italic 800 64px 'Barlow Condensed', system-ui, sans-serif";
  x.fillStyle = "rgba(232,238,247,0.10)";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("EVADE", 512, 512);
  // başlangıç plakaları
  if (layout.plates) {
    const cols = ["#ff5a4f", "#35b8ff"];
    layout.plates.forEach(([px, py], i) => {
      const cx = px * step;
      const cy = py * step;
      x.fillStyle = cols[i];
      x.globalAlpha = 0.28;
      x.fillRect(cx - 0.45 * step, cy - 0.45 * step, 0.9 * step, 0.9 * step);
      x.globalAlpha = 1;
      x.strokeStyle = cols[i];
      x.lineWidth = 6;
      x.strokeRect(cx - 0.45 * step, cy - 0.45 * step, 0.9 * step, 0.9 * step);
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(QUAD_SIZE, QUAD_SIZE), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(QUAD_SIZE / 2, 0, QUAD_SIZE / 2);
  floor.receiveShadow = true;
  g.add(floor);
  return g;
}
