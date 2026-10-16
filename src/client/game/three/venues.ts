import * as THREE from "three";
import { QUAD_H, QUAD_W } from "../../../shared/constants";
import type { VenueId } from "../../../shared/venues";

/**
 * Mekânlar: sahanın çevresi (kamera Quad'ın 2-4 m dışını görür), zemin dokusu ve ışık.
 * arena: gece arenası, LED panolar ve projektör direkleri
 * park: açık hava parkı, biçilmiş çim, ağaçlar, banklar, öğlen güneşi
 * depo: eski depo, beton zemin, sarı forklift çizgileri, palet ve sandık yığınları, sıcak lambalar
 * cati: gün batımında çatı katı, katran zemin, korkuluk, klima üniteleri, turuncu güneş
 */

export interface VenueLook {
  group: THREE.Group;
  background: number;
  fog: [number, number, number];
  hemi: [number, number, number];
  sun: [number, number];
  sunPos: [number, number, number];
  fill: [number, number];
  exposure: number;
}

const CX = QUAD_W / 2;
const CZ = QUAD_H / 2;

function canvasTex(size: number, draw: (x: CanvasRenderingContext2D, s: number) => void, repeat: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function rnd(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function ground(mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(110, 90), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(CX, -0.01, CZ);
  m.receiveShadow = true;
  return m;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

/** Sahanın çevresinde, kenara `min`-`max` m uzaklıkta rastgele noktalar (köşelere de yayılır). */
function around(r: () => number, n: number, min: number, max: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const side = Math.floor(r() * 4);
    const away = min + r() * (max - min);
    const alongX = -max + r() * (QUAD_W + max * 2);
    const alongZ = -max + r() * (QUAD_H + max * 2);
    if (side === 0) out.push([alongX, -away]);
    else if (side === 1) out.push([alongX, QUAD_H + away]);
    else if (side === 2) out.push([-away, alongZ]);
    else out.push([QUAD_W + away, alongZ]);
  }
  return out;
}

// ---------- Gece arenası ----------
function arena(steel: THREE.Material): VenueLook {
  const g = new THREE.Group();
  g.add(ground(new THREE.MeshStandardMaterial({ color: 0x0d1424, roughness: 1 })));
  const board = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.2 });
  const led = (col: number) => new THREE.MeshBasicMaterial({ color: col });
  const off = 1.8;
  const sides: [number, number, number, number, number][] = [
    [CX, -off, QUAD_W + off * 2, 0.12, 0xff3b2f],
    [CX, QUAD_H + off, QUAD_W + off * 2, 0.12, 0x2f6bff],
    [-off, CZ, 0.12, QUAD_H + off * 2, 0xffd400],
    [QUAD_W + off, CZ, 0.12, QUAD_H + off * 2, 0xffd400],
  ];
  for (const [x, z, w, d, col] of sides) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), board);
    m.position.set(x, 0.45, z);
    m.receiveShadow = true;
    g.add(m);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.08, d + 0.01), led(col));
    strip.position.set(x, 0.82, z);
    g.add(strip);
  }
  for (const [x, z] of [
    [-off, -off],
    [QUAD_W + off, -off],
    [-off, QUAD_H + off],
    [QUAD_W + off, QUAD_H + off],
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 10), steel);
    pole.position.set(x, 3.5, z);
    g.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.3), led(0xfff4dd));
    lamp.position.set(x, 7, z);
    lamp.lookAt(CX, 0, CZ);
    g.add(lamp);
  }
  return {
    group: g,
    background: 0x0a1020,
    fog: [0x0a1020, 26, 60],
    hemi: [0xcfe0ff, 0x2a2214, 1.7],
    sun: [0xfff1dc, 2.4],
    sunPos: [CX - 4, 16, CZ - 6],
    fill: [0x8fb6ff, 0.9],
    exposure: 1.05,
  };
}

// ---------- Açık hava parkı ----------
function park(): VenueLook {
  const g = new THREE.Group();
  const grass = canvasTex(
    512,
    (x, s) => {
      // Biçilmiş çim şeritleri + lekeler
      for (let i = 0; i < 8; i++) {
        x.fillStyle = i % 2 ? "#4f9a3c" : "#5aa845";
        x.fillRect((i * s) / 8, 0, s / 8, s);
      }
      const r = rnd(4);
      for (let i = 0; i < 2600; i++) {
        x.fillStyle = r() < 0.5 ? "rgba(30,70,20,0.18)" : "rgba(170,220,120,0.14)";
        x.fillRect(r() * s, r() * s, 2, 4);
      }
    },
    10,
  );
  g.add(ground(new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })));
  // Saha kenarında kauçuk koşu bandı (kırmızı tartan)
  const track = new THREE.MeshStandardMaterial({ color: 0xb8422f, roughness: 0.95 });
  const tw = 1.1;
  for (const [x, z, w, d] of [
    [CX, -tw / 2 - 0.15, QUAD_W + 2.6, tw],
    [CX, QUAD_H + tw / 2 + 0.15, QUAD_W + 2.6, tw],
    [-tw / 2 - 0.15, CZ, tw, QUAD_H + 0.3],
    [QUAD_W + tw / 2 + 0.15, CZ, tw, QUAD_H + 0.3],
  ]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), track);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    m.receiveShadow = true;
    g.add(m);
  }
  // Ağaçlar: yukarıdan yuvarlak taçlar
  const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
  const leafs = [0x2f7a32, 0x3b8f3a, 0x27682b, 0x4a9b3f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  const r = rnd(11);
  for (const [x, z] of around(r, 22, 2.2, 6)) {
    const t = new THREE.Group();
    const h = 2.2 + r() * 1.6;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 7), trunk);
    tr.position.y = h / 2;
    t.add(tr);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.7, 1), leafs[Math.floor(r() * leafs.length)]);
    crown.position.y = h + 0.4;
    crown.scale.y = 0.8;
    t.add(crown);
    t.position.set(x, 0, z);
    g.add(shadowed(t));
  }
  // Banklar
  const wood = new THREE.MeshStandardMaterial({ color: 0xc58a4a, roughness: 0.8 });
  for (const [x, z, rot] of [
    [CX - 3, -1.9, 0],
    [CX + 3, QUAD_H + 1.9, 0],
    [-1.9, CZ + 2, Math.PI / 2],
  ]) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), wood);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), wood);
    back.position.set(0, 0.7, -0.2);
    b.add(seat, back);
    b.position.set(x, 0, z);
    b.rotation.y = rot;
    g.add(shadowed(b));
  }
  return {
    group: g,
    background: 0x9fd4ff,
    fog: [0xbfe2ff, 30, 70],
    hemi: [0xffffff, 0x4c7a34, 2.0],
    sun: [0xfff4d6, 3.0],
    sunPos: [CX + 6, 18, CZ - 8],
    fill: [0xbfe2ff, 0.6],
    exposure: 1.0,
  };
}

// ---------- Eski depo ----------
function depo(steel: THREE.Material): VenueLook {
  const g = new THREE.Group();
  const concrete = canvasTex(
    512,
    (x, s) => {
      x.fillStyle = "#4a4743";
      x.fillRect(0, 0, s, s);
      const r = rnd(7);
      for (let i = 0; i < 5000; i++) {
        const v = 50 + Math.floor(r() * 40);
        x.fillStyle = `rgba(${v},${v - 2},${v - 5},0.35)`;
        x.fillRect(r() * s, r() * s, 2, 2);
      }
      // Derz çizgileri ve yağ lekeleri
      x.strokeStyle = "rgba(20,20,20,0.5)";
      x.lineWidth = 2;
      x.strokeRect(0, 0, s, s);
      for (let i = 0; i < 6; i++) {
        const cx = r() * s;
        const cy = r() * s;
        const gr = x.createRadialGradient(cx, cy, 2, cx, cy, 30 + r() * 40);
        gr.addColorStop(0, "rgba(10,10,10,0.35)");
        gr.addColorStop(1, "rgba(10,10,10,0)");
        x.fillStyle = gr;
        x.fillRect(0, 0, s, s);
      }
    },
    8,
  );
  g.add(ground(new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 })));
  // Sarı forklift şeritleri
  const yellow = new THREE.MeshBasicMaterial({ color: 0xffc400 });
  for (const i of [0, 1]) {
    for (const horiz of [true, false]) {
      const off = horiz ? (i ? QUAD_H + 1.2 : -1.2) : i ? QUAD_W + 1.2 : -1.2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? QUAD_W + 4 : 0.12, horiz ? 0.12 : QUAD_H + 4), yellow);
      m.rotation.x = -Math.PI / 2;
      m.position.set(horiz ? CX : off, 0.005, horiz ? off : CZ);
      g.add(m);
    }
  }
  // Palet ve sandık yığınları
  const pallet = new THREE.MeshStandardMaterial({ color: 0xa8784a, roughness: 0.9 });
  const crate = new THREE.MeshStandardMaterial({ color: 0x7c5a36, roughness: 0.85 });
  const drum = new THREE.MeshStandardMaterial({ color: 0x2a5bd7, roughness: 0.5, metalness: 0.3 });
  const drumR = new THREE.MeshStandardMaterial({ color: 0xc8321f, roughness: 0.5, metalness: 0.3 });
  const r = rnd(21);
  for (const [x, z] of around(r, 16, 2.0, 4.5)) {
    const s = new THREE.Group();
    const kind = r();
    if (kind < 0.45) {
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.0), pallet);
        p.position.y = 0.07 + i * 0.15;
        p.rotation.y = (r() - 0.5) * 0.2;
        s.add(p);
      }
    } else if (kind < 0.8) {
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crate);
        c.position.set((r() - 0.5) * 0.3, 0.4 + i * 0.8, (r() - 0.5) * 0.3);
        c.rotation.y = r() * 0.6;
        s.add(c);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14), r() < 0.5 ? drum : drumR);
        d.position.set((i % 2) * 0.62 - 0.3, 0.44, Math.floor(i / 2) * 0.62 - 0.3);
        s.add(d);
      }
    }
    s.position.set(x, 0, z);
    g.add(shadowed(s));
  }
  // Tavandan sarkan sıcak lambalar
  const shade = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.6, roughness: 0.4 });
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (const [x, z] of [
    [CX - 3.5, CZ - 3.5],
    [CX + 3.5, CZ - 3.5],
    [CX - 3.5, CZ + 3.5],
    [CX + 3.5, CZ + 3.5],
  ]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 16, 1, true), shade);
    cone.position.set(x, 7.5, z);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bulb);
    b.position.set(x, 7.35, z);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4), steel);
    cable.position.set(x, 9.7, z);
    const light = new THREE.PointLight(0xffb066, 22, 16, 1.6);
    light.position.set(x, 7.2, z);
    g.add(cone, b, cable, light);
  }
  return {
    group: g,
    background: 0x15110d,
    fog: [0x1a140f, 22, 50],
    hemi: [0xffd7a8, 0x2e2418, 1.25],
    sun: [0xffcf8f, 1.6],
    sunPos: [CX - 3, 15, CZ - 2],
    fill: [0xff9f55, 0.35],
    exposure: 1.1,
  };
}

// ---------- Gün batımında çatı ----------
function cati(steel: THREE.Material): VenueLook {
  const g = new THREE.Group();
  const tar = canvasTex(
    512,
    (x, s) => {
      x.fillStyle = "#2f2d33";
      x.fillRect(0, 0, s, s);
      const r = rnd(9);
      for (let i = 0; i < 7000; i++) {
        const v = 40 + Math.floor(r() * 50);
        x.fillStyle = `rgba(${v},${v},${v + 6},0.5)`;
        x.fillRect(r() * s, r() * s, 1.5, 1.5);
      }
      x.strokeStyle = "rgba(0,0,0,0.35)";
      x.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        x.beginPath();
        x.moveTo(0, (i * s) / 4);
        x.lineTo(s, (i * s) / 4);
        x.stroke();
      }
    },
    9,
  );
  g.add(ground(new THREE.MeshStandardMaterial({ map: tar, roughness: 1 })));
  // Korkuluk (parapet) ve üstünde boru
  const parapet = new THREE.MeshStandardMaterial({ color: 0x8c7f76, roughness: 0.9 });
  const o = 4.2;
  for (const [x, z, w, d] of [
    [CX, -o, QUAD_W + o * 2, 0.3],
    [CX, QUAD_H + o, QUAD_W + o * 2, 0.3],
    [-o, CZ, 0.3, QUAD_H + o * 2],
    [QUAD_W + o, CZ, 0.3, QUAD_H + o * 2],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), parapet);
    m.position.set(x, 0.5, z);
    g.add(shadowed(m));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w > d ? w : 0.06, 0.06, w > d ? 0.06 : d), steel);
    rail.position.set(x, 1.15, z);
    g.add(rail);
  }
  // Klima üniteleri, havalandırma bacaları, su deposu
  const unit = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.5, metalness: 0.4 });
  const fan = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.6 });
  const r = rnd(33);
  for (const [x, z] of around(r, 10, 1.8, 3.6)) {
    const a = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), unit);
    box.position.y = 0.4;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 20), fan);
    f.position.y = 0.82;
    a.add(box, f);
    a.position.set(x, 0, z);
    a.rotation.y = Math.floor(r() * 4) * (Math.PI / 2);
    g.add(shadowed(a));
  }
  const tank = new THREE.Group();
  const legs = new THREE.MeshStandardMaterial({ color: 0x4a3a2c });
  for (const [dx, dz] of [
    [-0.6, -0.6],
    [0.6, -0.6],
    [-0.6, 0.6],
    [0.6, 0.6],
  ]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2), legs);
    l.position.set(dx, 1, dz);
    tank.add(l);
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.6, 20), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 }));
  barrel.position.y = 2.8;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0x5c3d28 }));
  roof.position.y = 3.9;
  tank.add(barrel, roof);
  tank.position.set(QUAD_W + 3, 0, -2.6);
  g.add(shadowed(tank));
  return {
    group: g,
    background: 0xff9a6a,
    fog: [0xffa577, 28, 70],
    hemi: [0xffc7a0, 0x3a2a40, 1.5],
    sun: [0xffa260, 3.2],
    sunPos: [CX - 14, 7, CZ + 4],
    fill: [0x8e7cff, 0.6],
    exposure: 1.08,
  };
}

export function buildVenue(id: VenueId, steel: THREE.Material): VenueLook {
  switch (id) {
    case "park":
      return park();
    case "depo":
      return depo(steel);
    case "cati":
      return cati(steel);
    default:
      return arena(steel);
  }
}
