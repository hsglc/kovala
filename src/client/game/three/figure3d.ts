import * as THREE from "three";
import {
  ACT_CLIMB,
  ACT_DIVE,
  ACT_JUKE,
  ACT_JUMP,
  ACT_KICK,
  ACT_KONG,
  ACT_SLIDE,
  ACT_STUMBLE,
  ACT_VAULT,
  type PlayerState,
} from "../../../shared/sim";

/** Eklemli, prosedürel 3B koşucu. Bir metre = bir birim. */

export interface Look {
  shirt: number;
  shorts: number;
  skin: number;
  hair: number;
}

const SKINS = [0xf1c7a3, 0xd9a77f, 0xb97d55, 0x8d5a3b, 0xf4d2b8, 0xc68e66];
const HAIRS = [0x2a1d17, 0x4a2f1f, 0x151515, 0x7a4a26, 0xc99a4a, 0x3b2a22];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lookFor(id: string, shirt: number, shorts: number): Look {
  const h = hash(id);
  return { shirt, shorts, skin: SKINS[h % SKINS.length], hair: HAIRS[(h >>> 8) % HAIRS.length] };
}

export type Pose = "run" | "cheer" | "tired";

export interface FigureAnim {
  phase: number;
  run: number;
  pose: PlayerState["ak"] | -1;
  at: number;
  now: number;
  mood: Pose;
  /** yön (radyan, saha düzleminde) */
  heading: number;
}

function limb(len: number, radius: number, mat: THREE.Material): THREE.Group {
  // pivot üstte; mesh aşağı sarkar
  const g = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 4, 8);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  g.add(m);
  return g;
}

export class Figure3D {
  root = new THREE.Group();
  private body = new THREE.Group();
  private torso: THREE.Mesh;
  private head: THREE.Mesh;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private foreL: THREE.Group;
  private foreR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private shinL: THREE.Group;
  private shinR: THREE.Group;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;

  constructor(look: Look, ringColor: number) {
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.75 });
    const shirt = new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.6 });
    const shorts = new THREE.MeshStandardMaterial({ color: look.shorts, roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xf1f4f9, roughness: 0.5 });

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.3, 4, 10), shirt);
    this.torso.scale.set(1, 1, 0.65);
    this.torso.position.y = 1.05;
    this.torso.castShadow = true;
    this.body.add(this.torso);

    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.08, 4, 10), shorts);
    hips.scale.set(1, 1, 0.7);
    hips.position.y = 0.82;
    hips.castShadow = true;
    this.body.add(hips);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), skin);
    this.head.position.y = 1.5;
    this.head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 0.01;
    cap.rotation.x = -0.35;
    this.head.add(cap);
    this.body.add(this.head);

    const mkArm = (side: number) => {
      const upper = limb(0.3, 0.055, skin);
      upper.position.set(side * 0.24, 1.3, 0);
      const fore = limb(0.28, 0.05, skin);
      fore.position.y = -0.3;
      upper.add(fore);
      this.body.add(upper);
      return [upper, fore] as const;
    };
    [this.armL, this.foreL] = mkArm(-1);
    [this.armR, this.foreR] = mkArm(1);

    const mkLeg = (side: number) => {
      const thigh = limb(0.42, 0.07, shorts);
      thigh.position.set(side * 0.1, 0.84, 0);
      const shin = limb(0.4, 0.06, skin);
      shin.position.y = -0.42;
      thigh.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.24), shoe);
      foot.position.set(0, -0.4, 0.06);
      foot.castShadow = true;
      shin.add(foot);
      this.body.add(thigh);
      return [thigh, shin] as const;
    };
    [this.legL, this.shinL] = mkLeg(-1);
    [this.legR, this.shinR] = mkLeg(1);

    this.ringMat = new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.85 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);
    this.root.add(this.body);
  }

  setRing(color: number, opacity: number) {
    this.ringMat.color.setHex(color);
    this.ringMat.opacity = opacity;
  }

  update(a: FigureAnim) {
    const ak = a.pose;
    const t = a.at;
    const r = a.run;
    const sin = Math.sin(a.phase);
    const cos = Math.cos(a.phase);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.root.rotation.y = -a.heading + Math.PI / 2; // +z ekranda aşağı; heading atan2(dy,dx)

    // varsayılan: koşu döngüsü
    let lean = 0.1 + 0.25 * r;
    let lift = Math.abs(sin) * 0.04 * r;
    let thighL = sin * (0.15 + 0.75 * r);
    let thighR = -sin * (0.15 + 0.75 * r);
    let shinL = -(0.15 + r * (0.4 + 0.7 * Math.max(0, -cos)));
    let shinR = -(0.15 + r * (0.4 + 0.7 * Math.max(0, cos)));
    let armL = -sin * (0.2 + 0.9 * r);
    let armR = sin * (0.2 + 0.9 * r);
    let foreL = -(0.5 + 1.0 * r);
    let foreR = -(0.5 + 1.0 * r);
    let armOut = 0.15;
    let headTilt = 0;
    let roll = 0;

    if (a.mood === "cheer") {
      lift = Math.abs(Math.sin(a.now / 160)) * 0.12;
      armL = Math.PI - 0.3;
      armR = Math.PI - 0.3;
      foreL = foreR = -0.2;
      armOut = 0.5;
      thighL = thighR = 0;
      shinL = shinR = -0.1;
      lean = -0.05;
    } else if (a.mood === "tired") {
      lean = 0.8;
      thighL = thighR = 0.5;
      shinL = shinR = -0.9;
      armL = armR = 0.9;
      foreL = foreR = -0.5;
      lift = -0.25;
    } else if (ak === ACT_VAULT) {
      const k = Math.min(1, t / 0.4);
      const h = Math.sin(k * Math.PI);
      lift = h * 0.55;
      lean = 0.5;
      roll = 0.5 * h;
      thighL = 1.2;
      thighR = 0.6;
      shinL = -1.6;
      shinR = -1.2;
      armL = 1.5;
      armR = -0.6;
      foreL = -0.3;
      foreR = -1.2;
    } else if (ak === ACT_KONG) {
      const k = Math.min(1, t / 0.4);
      const h = Math.sin(k * Math.PI);
      lift = h * 0.7;
      lean = 0.9;
      thighL = thighR = 1.9 * h + 0.2;
      shinL = shinR = -2.1 * h - 0.2;
      armL = armR = 1.6;
      foreL = foreR = -0.2;
      armOut = 0.35;
    } else if (ak === ACT_CLIMB) {
      const k = Math.min(1, t / 1.1);
      lift = Math.sin(k * Math.PI) * 1.0;
      lean = 0.2;
      armL = Math.PI - 0.4 + Math.sin(a.now / 120) * 0.15;
      armR = Math.PI - 0.6 - Math.sin(a.now / 120) * 0.15;
      foreL = foreR = -0.6;
      armOut = 0.35;
      thighL = 0.9 + Math.sin(a.now / 120) * 0.3;
      thighR = 0.6 - Math.sin(a.now / 120) * 0.3;
      shinL = shinR = -1.4;
    } else if (ak === ACT_DIVE) {
      lean = 1.35;
      lift = 0.2;
      armL = armR = 1.5;
      foreL = foreR = -0.1;
      armOut = 0.25;
      thighL = thighR = -0.3;
      shinL = shinR = 0.15;
    } else if (ak === ACT_STUMBLE) {
      lean = 0.55 + Math.sin(a.now / 60) * 0.12;
      roll = Math.sin(a.now / 90) * 0.15;
      armL = armR = 0.6;
      foreL = foreR = -0.9;
      thighL = 0.6;
      thighR = 0.1;
      shinL = -1.0;
      shinR = -0.4;
      lift = -0.1;
    } else if (ak === ACT_SLIDE) {
      lean = -0.6; // geriye yatar
      lift = -0.5;
      thighL = -1.2;
      thighR = -0.6;
      shinL = 0.2;
      shinR = -0.9;
      armL = -0.8;
      armR = 1.0;
      foreL = -0.3;
      foreR = -0.6;
      headTilt = 0.3;
    } else if (ak === ACT_JUMP) {
      const k = Math.min(1, t / 0.42);
      lift = Math.sin(k * Math.PI) * 0.75;
      lean = 0.3;
      thighL = 1.3;
      thighR = 0.3;
      shinL = -1.8;
      shinR = -0.6;
      armL = 0.9;
      armR = -0.3;
      foreL = foreR = -0.9;
    } else if (ak === ACT_JUKE || ak === ACT_KICK) {
      lean = 0.55;
      lift = 0.05;
    }

    this.body.position.y = lift;
    this.body.rotation.x = lean;
    this.body.rotation.z = roll;
    this.head.rotation.x = -lean * 0.7 + headTilt;
    this.legL.rotation.x = thighL;
    this.legR.rotation.x = thighR;
    this.shinL.rotation.x = shinL;
    this.shinR.rotation.x = shinR;
    this.armL.rotation.x = armL;
    this.armR.rotation.x = armR;
    this.armL.rotation.z = armOut;
    this.armR.rotation.z = -armOut;
    this.foreL.rotation.x = foreL;
    this.foreR.rotation.x = foreR;
    this.ring.position.y = 0.02;
  }
}
