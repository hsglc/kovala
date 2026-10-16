import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { FABRIC_COMMON, FABRIC_PARAMS, LOOK_FABRIC, fabricCode } from "./fabric";
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
  ACT_ROLL,
  ACT_FEINT,
} from "../../../shared/sim";
import { REGIONS, cleanFit, fitItem, fitSex } from "../../../shared/outfit";
import type { FigureAnim } from "./figure3d";

/**
 * Sporcular v2 (public/models/athlete_f.glb, athlete_m.glb): MakeHuman tabanlı erkek ve kadın gövde,
 * aynı Mixamo iskeletine bağlı ayrı giysi parçaları (G_<ad>). Seçilen kıyafetin parçaları görünür,
 * desenler takım rengine göre gölgelendiricide çizilir. Koşu/yürüme/bekleme mocap, parkur klipleri anahtar kare.
 */

export type Sex = "f" | "m";

interface Template {
  sex: Sex;
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  /** Bağ pozunda baş tepesi ve baş kemiği yüksekliği (m), baş yarıçapı */
  headTop: number;
  headBoneY: number;
  headR: number;
  /** Bağ pozunda eklemler: omuz/dirsek/bilek x, kalça/diz/bilek y (kırışık ve dikiş konumu) */
  joints: { sh: number; el: number; wr: number; hip: number; knee: number; ank: number };
}

const templates = new Map<Sex, Template>();
const JOINT_BONES: Record<string, string> = {
  mixamorigLeftArm: "sh",
  mixamorigLeftForeArm: "el",
  mixamorigLeftHand: "wr",
  mixamorigLeftUpLeg: "hip",
  mixamorigLeftLeg: "knee",
  mixamorigLeftFoot: "ank",
};
let loading: Promise<void> | null = null;

function measure(sex: Sex, scene: THREE.Group, clips: THREE.AnimationClip[]): Template {
  scene.updateMatrixWorld(true);
  let headTop = 0;
  let headBoneY = 1.5;
  const pts: THREE.Vector3[] = [];
  const jw: Record<string, THREE.Vector3> = {};
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
    }
    if (m.isMesh && m.name === "Body") {
      const pos = m.geometry.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.y > headTop) headTop = v.y;
        pts.push(v.clone());
      }
    }
    if ((o as THREE.Bone).isBone && o.name === "mixamorigHead") headBoneY = o.getWorldPosition(new THREE.Vector3()).y;
    if ((o as THREE.Bone).isBone && JOINT_BONES[o.name]) jw[JOINT_BONES[o.name]] = o.getWorldPosition(new THREE.Vector3());
  });
  let headR = 0;
  for (const p of pts) if (p.y > headTop - 0.1) headR = Math.max(headR, Math.abs(p.x));
  const J = (k: string, ax: "x" | "y", d: number) => (jw[k] ? Math.abs(jw[k][ax]) : d);
  const joints = {
    sh: J("sh", "x", 0.19),
    el: J("el", "x", 0.38),
    wr: J("wr", "x", 0.55),
    hip: J("hip", "y", 0.9),
    knee: J("knee", "y", 0.48),
    ank: J("ank", "y", 0.08),
  };
  return { sex, scene, clips: new Map(clips.map((c) => [c.name, c])), headTop, headBoneY, headR: headR || 0.08, joints };
}

export function loadAthlete(): Promise<void> {
  if (templates.size === 2) return Promise.resolve();
  if (!loading) {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loading = Promise.all(
      (["f", "m"] as Sex[]).map((sex) =>
        loader.loadAsync(`${(globalThis as { __ATHLETE_BASE?: string }).__ATHLETE_BASE ?? "/models/athlete_"}${sex}.glb`).then((g) => {
          templates.set(sex, measure(sex, g.scene as THREE.Group, g.animations));
        }),
      ),
    ).then(() => undefined);
  }
  return loading;
}

export function athleteTemplate(sex: Sex = "f"): Template | null {
  return templates.get(sex) ?? null;
}

export function athleteReady(): boolean {
  return templates.size === 2;
}

/** Parkur kliplerinin oyundaki süreleri (sn) — klipler bu süreye esnetilir. */
const ACTION_CLIP: Record<number, { clip: string; dur: number; loop?: boolean }> = {
  [ACT_VAULT]: { clip: "vault", dur: 0.4 },
  [ACT_KONG]: { clip: "kong", dur: 0.42 },
  [ACT_CLIMB]: { clip: "climb", dur: 0.8, loop: true },
  [ACT_SLIDE]: { clip: "slide", dur: 0.45 },
  [ACT_JUMP]: { clip: "jump", dur: 0.5 },
  [ACT_DIVE]: { clip: "dive", dur: 0.26 },
  [ACT_STUMBLE]: { clip: "stumble", dur: 0.5 },
  [ACT_JUKE]: { clip: "juke", dur: 0.14 },
  [ACT_KICK]: { clip: "wallkick", dur: 0.3 },
  [ACT_ROLL]: { clip: "kong", dur: 0.42 },
  [ACT_FEINT]: { clip: "juke", dur: 0.24 },
};

const SKIN: Record<Sex, number> = { f: 0xd09a7a, m: 0xc48a68 };
const HAIR: Record<string, number> = { default: 0x2a1a10, blond: 0xc9a04e, buzz: 0x3b2a1e };

export class Athlete {
  root = new THREE.Group();
  readonly sex: Sex;
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private lastAk = 0;
  private tpl: Template;
  private garments = new Map<string, THREE.Mesh>();
  private extras: THREE.Object3D[] = [];
  private fitKey = "";

  constructor(tplOrAny: Template | null | undefined, shirt: number, shorts: number, ringColor: number, fit = "0000000") {
    fit = cleanFit(fit);
    this.sex = fitSex(fit);
    const tpl = templates.get(this.sex) ?? tplOrAny!;
    this.model = cloneSkinned(tpl.scene);
    this.tpl = tpl;
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = m.name;
      if (name === "Feet") {
        m.visible = false; // ayakkabının içinde kalır
        return;
      }
      if (name === "Body") {
        const src = m.material as THREE.MeshStandardMaterial;
        // Deri: hafif "sheen" ile ışığa dönen kenarlarda yumuşak, kırmızımsı parlama (ucuz alt-yüzey saçılımı izlenimi)
        m.material = new THREE.MeshPhysicalMaterial({
          map: src.map,
          // gözenek ve ince kırışık (Blender'da üretilen normal haritası)
          normalMap: src.normalMap ?? null,
          normalScale: new THREE.Vector2(0.28, 0.28),
          color: SKIN[this.sex],
          roughness: 0.52,
          sheen: 0.35,
          sheenRoughness: 0.55,
          sheenColor: new THREE.Color(0xff8a6a),
          clearcoat: 0.06,
          clearcoatRoughness: 0.6,
        });
        return;
      }
      if (name === "Eyes") {
        m.material = eyeMaterial();
        return;
      }
      if (!name.startsWith("G_")) return;
      // Tüm giysiler tek ortak gölgelendirici kullanır; kombin değişince yalnızca görünürlük ve uniform değişir
      m.material = garmentMaterial(m as THREE.SkinnedMesh, tpl);
      this.garments.set(name.slice(2), m);
    });
    this.applyFit(fit, shirt, shorts);
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, clip] of tpl.clips) {
      const a = this.mixer.clipAction(clip);
      const spec = Object.values(ACTION_CLIP).find((s) => s.clip === name);
      if (spec && !spec.loop) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.ringMat = new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.85 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.45, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);
    this.play("idle", 0);
  }

  private play(name: string, fade = 0.12, restart = false, timeScale = 1) {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (name === this.current && !restart) return;
    const prev = this.actions.get(this.current);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  /** Fizik ve oyun durumundan animasyon seç. dt saniye. */
  update(a: FigureAnim, speed: number, dt: number) {
    this.root.rotation.y = Math.PI / 2 - a.heading;
    this.model.position.y = a.h;
    if (a.pose === ACT_ROLL) {
      // Takla: gövdeyi topa çevir ve merkezinden yuvarla
      const t = Math.min(1, a.at / 0.42);
      const th = t * Math.PI * 2;
      const tuck = Math.sin(t * Math.PI);
      const piv = 0.48 + (1 - tuck) * 0.4;
      this.model.scale.set(1, 1 - 0.45 * tuck, 1 - 0.2 * tuck);
      this.model.rotation.x = th;
      this.model.position.y = a.h + piv - piv * Math.cos(th);
      this.model.position.z = -piv * Math.sin(th);
    } else {
      this.model.rotation.x = 0;
      this.model.position.z = 0;
      this.model.scale.set(1, 1, 1);
    }
    this.ring.scale.setScalar(a.h > 0.3 ? 0.8 : 1);

    const ak = a.pose;
    if (a.mood === "cheer") this.play("cheer", 0.2);
    else if (a.mood === "tired") this.play("tired", 0.25);
    else if (ak !== -1 && ACTION_CLIP[ak]) {
      const spec = ACTION_CLIP[ak];
      const clip = this.actions.get(spec.clip)!.getClip();
      const restart = ak !== this.lastAk;
      this.play(spec.clip, 0.08, restart, clip.duration / spec.dur);
    } else if (a.airborne) {
      const act = this.actions.get("jump")!;
      this.play("jump", 0.1, false, 0);
      act.time = act.getClip().duration * (a.hv > 0 ? 0.35 : 0.65);
    } else if (speed > 2.6) {
      const clip = this.actions.get("run")!.getClip();
      this.play("run", 0.15, false, Math.max(0.7, (speed / 1.9) * clip.duration));
    } else if (speed > 0.35) {
      const clip = this.actions.get("walk")!.getClip();
      this.play("walk", 0.18, false, Math.max(0.6, (speed / 1.3) * clip.duration));
    } else {
      this.play("idle", 0.25);
    }
    this.lastAk = ak;
    this.mixer.update(dt);
  }

  /**
   * Kombini yerinde değiştir (yeni sporcu kurmadan): giysilerin görünürlüğü ve desen/kumaş uniform'ları.
   * Aynı cinsiyetteki her değişiklik anlık; gölgelendirici yeniden derlenmez.
   */
  applyFit(fit: string, shirt: number, shorts: number) {
    fit = cleanFit(fit);
    const key = `${fit}:${shirt}:${shorts}`;
    if (key === this.fitKey) return;
    this.fitKey = key;
    const top = fitItem(fit, "top");
    const bottom = fitItem(fit, "bottom");
    const shoes = fitItem(fit, "shoes");
    const hair = fitItem(fit, "hair");
    const hairMesh = hair.id === "natural" ? (this.sex === "f" ? ["hair_long", "ponytail"] : ["hair_short"]) : (hair.mesh ?? []);
    const visible = new Set<string>([...(top.mesh ?? []), ...(bottom.mesh ?? []), ...(shoes.mesh ?? []), ...hairMesh, "brief"]);
    // Sütyen yalnızca üst olarak seçilince çizilir; üstlerin içinden taşmasın
    if (this.sex === "f" && top.id === "bra") visible.add("bra");
    const team = new THREE.Color(shirt);
    const teamDark = new THREE.Color(shorts);
    for (const [id, m] of this.garments) {
      m.visible = visible.has(id);
      if (!m.visible) continue;
      let look = "plain";
      let role: Role = "top";
      if (top.mesh?.includes(id)) look = top.look ?? "plain";
      else if (bottom.mesh?.includes(id)) {
        look = bottom.look ?? "plain";
        role = "bottom";
      } else if (id === "socks") role = "sock";
      else if (shoes.mesh?.includes(id)) {
        look = shoes.look ?? "white";
        role = "shoe";
      } else if (hairMesh.includes(id)) {
        look = hair.look ?? "default";
        role = "hair";
      } else if (id === "bra" || id === "brief") {
        role = "under";
        look = id === "bra" && top.id === "bra" ? "bra-team" : "under";
      }
      setGarment(m.material as THREE.MeshPhysicalMaterial, id, role, look, team, teamDark);
    }
    for (const x of this.extras) {
      x.removeFromParent();
      x.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh) {
          mm.geometry.dispose();
          (mm.material as THREE.Material).dispose();
        }
      });
    }
    const before = new Set<THREE.Object3D>();
    this.model.traverse((o) => before.add(o));
    addHeadwear(this.model, this.tpl, fitItem(fit, "head").id, shirt);
    addAccessory(this.model, this.tpl, fitItem(fit, "acc").id, shirt);
    this.extras = [];
    this.model.traverse((o) => {
      if (!before.has(o) && o.parent && before.has(o.parent)) this.extras.push(o);
    });
    for (const x of this.extras) x.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
  }

  setRing(color: number, opacity: number, scale = 1) {
    this.ringMat.color.setHex(color);
    this.ringMat.opacity = opacity;
    this.ring.scale.setScalar(scale);
  }
}

/* ---------- Malzemeler ---------- */

const GLSL_COMMON = `
varying vec3 vBind;
varying vec3 vBindN;
uniform vec3 uTeam;
uniform vec3 uDark;
uniform vec3 uMin;
uniform vec3 uMax;
float fitHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fitNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fitHash(i), fitHash(i + vec3(1,0,0)), f.x), mix(fitHash(i + vec3(0,1,0)), fitHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fitHash(i + vec3(0,0,1)), fitHash(i + vec3(1,0,1)), f.x), mix(fitHash(i + vec3(0,1,1)), fitHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 fitHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

/**
 * Desenler bağ pozundaki konuma göre (metre, Y yukarı, Z ön; kollar A-pozunda yana-aşağı).
 * v: giysinin alt-üst arası 0..1, ax: merkezden yana uzaklık (0 gövde ortası, 1 en uç — kollarda bilek).
 * Her desen `c` rengini kurar; `glow` ışıma ekler; `rough` pürüzlülük çarpanı.
 */
const LOOK_GLSL: Record<string, string> = {
  // ----- Üstler -----
  plain: `c = uTeam; c = mix(c, uDark, step(0.955, v) + (1.0 - step(0.04, v)));`,
  jersey: `
    c = uTeam;
    float sidep = smoothstep(0.78, 0.84, abs(vBindN.x)) * (1.0 - step(0.55, ax));
    c = mix(c, vec3(0.96), sidep);
    // Sırtta numara bandı
    float back = step(0.5, -vBindN.z) * step(0.45, v) * (1.0 - step(0.7, v)) * (1.0 - step(0.16, abs(vBind.x)));
    float digit = step(0.5, fract(vBind.y * 9.0)) * (1.0 - step(0.06, abs(abs(vBind.x) - 0.05)));
    c = mix(c, vec3(0.96), back * digit);
    c = mix(c, vec3(0.96), step(0.955, v));`,
  stripe: `c = mix(uTeam, vec3(0.96), step(0.55, fract(vBind.y * 16.0)) * 0.92);`,
  sweat: `
    c = vec3(0.6, 0.63, 0.7);
    float rib = (1.0 - step(0.05, v)) + step(0.965, v) + step(0.93, ax);
    c = mix(c, c * 0.78 + 0.02 * step(0.5, fract(vBind.x * 120.0)), min(1.0, rib));
    c = mix(c, uTeam, (1.0 - step(0.012, abs(v - 0.62))) * (1.0 - step(0.5, ax)));`,
  varsity: `
    c = uTeam;
    c = mix(c, vec3(0.95), step(0.42, ax));
    float rib = (1.0 - step(0.05, v)) + step(0.965, v) + step(0.93, ax);
    c = mix(c, uDark, min(1.0, rib));
    c = mix(c, uDark, (1.0 - step(0.012, abs(ax - 0.62))) * step(0.42, ax));`,
  hoodie: `
    c = uTeam;
    float rib = (1.0 - step(0.05, v)) + step(0.94, ax);
    c = mix(c, uDark, min(1.0, rib));
    // Kanguru cep
    float pocket = step(0.4, vBindN.z) * step(0.1, v) * (1.0 - step(0.32, v)) * (1.0 - step(0.11, abs(vBind.x)));
    c = mix(c, uDark * 1.15, pocket);
    // İpler
    float cords = step(0.3, vBindN.z) * step(0.8, v) * (1.0 - step(0.008, abs(abs(vBind.x) - 0.035)));
    c = mix(c, vec3(0.95), cords);`,
  hood: `c = uTeam * 0.92;`,
  knit: `
    vec3 cream = vec3(0.9, 0.86, 0.78);
    float cable = sin(vBind.x * 70.0 + sin(vBind.y * 55.0) * 1.6);
    float knit = step(0.5, fract(vBind.y * 90.0 + abs(vBind.x) * 6.0));
    c = cream * (0.86 + 0.08 * knit + 0.06 * cable);
    c = mix(c, uTeam, (1.0 - step(0.03, abs(v - 0.68))) * (1.0 - step(0.5, ax)));
    rough = 1.2;`,
  camo: `
    float n1 = fitNoise(vBind * 18.0);
    float n2 = fitNoise(vBind * 34.0 + 7.0);
    c = uTeam;
    c = mix(c, uTeam * 0.35, step(0.55, n1));
    c = mix(c, uTeam * 0.7 + vec3(0.05), step(0.62, n2) * (1.0 - step(0.55, n1)));`,
  // ----- Altlar -----
  "b-plain": `c = uDark * 0.8; float slit = step(0.82, abs(vBindN.x)) * (1.0 - step(0.12, v)); c = mix(c, vec3(0.95), slit);`,
  joggers: `c = vec3(0.33, 0.37, 0.43); float cuff = 1.0 - step(0.06, v); c = mix(c, c * 0.7, cuff + step(0.96, v));`,
  tight: `c = vec3(0.08, 0.085, 0.11); rough = 0.55;`,
  bball: `c = uTeam; float s = step(0.86, abs(vBindN.x)); c = mix(c, vec3(0.96), s); c = mix(c, uDark, step(0.95, v));`,
  track: `
    c = uDark * 0.85;
    float tri = step(0.88, abs(vBindN.x)) * step(0.5, fract(vBind.z * 70.0 + 0.25));
    c = mix(c, vec3(0.97), tri);`,
  cargo: `
    float n1 = fitNoise(vBind * 14.0);
    float n2 = fitNoise(vBind * 26.0 + 3.0);
    c = vec3(0.33, 0.4, 0.23);
    c = mix(c, vec3(0.2, 0.25, 0.14), step(0.55, n1));
    c = mix(c, vec3(0.42, 0.35, 0.22), step(0.6, n2) * (1.0 - step(0.55, n1)));
    c = mix(c, c * 0.7, 1.0 - step(0.06, v));`,
  // Reflektörlü koşu taytı: yanlarda gümüş yansıtıcı biye (ışığı geri yansıtır, kendisi ışımaz)
  neon: `
    float pipe = (1.0 - smoothstep(0.0, 0.012, abs(abs(vBindN.x) - 0.93))) ;
    c = mix(vec3(0.07, 0.075, 0.09), vec3(0.82, 0.85, 0.88), pipe);
    rough = mix(1.0, 0.45, pipe);`,
  // Kot: indigo denim, uyluk önü ve dizde taşlanmış solma, turuncu dikiş, arka cepler, bel bandı
  denim: `
    c = vec3(0.12, 0.19, 0.35);
    float frontF = smoothstep(0.2, 0.9, vBindN.z);
    float fadeT = frontF * (1.0 - smoothstep(0.0, 0.22, abs(v - 0.66))) * 0.85;
    float fadeK = frontF * (1.0 - smoothstep(0.0, 0.07, abs(v - 0.42))) * 0.6;
    c = mix(c, vec3(0.38, 0.5, 0.68), (fadeT + fadeK) * (0.55 + 0.3 * fitNoise(vBind * 25.0)));
    float bx = abs(vBind.x);
    float back = step(vBindN.z, -0.35);
    float pk = back * step(0.035, bx) * (1.0 - step(0.13, bx)) * step(0.79, v) * (1.0 - step(0.935, v));
    float pkEdge = pk * (1.0 - step(0.006, min(min(bx - 0.035, 0.13 - bx), min(v - 0.79, 0.935 - v) * 0.6)));
    c = mix(c, c * 0.85, pk);
    c = mix(c, vec3(0.85, 0.55, 0.2), pkEdge * 0.8);
    float wbD = step(0.955, v);
    c = mix(c, c * 0.8, wbD);
    float sideD = (1.0 - smoothstep(0.0, 0.04, abs(vBindN.z))) * step(0.5, abs(vBindN.x));
    c = mix(c, vec3(0.8, 0.52, 0.2), sideD * 0.5 * step(0.5, fract(vBind.y * 220.0)));`,
  // ----- Ayakkabılar (y: zeminden metre) -----
  "s-white": `
    float sole = 1.0 - step(0.03, vBind.y);
    float swoosh = (1.0 - step(0.012, abs(vBind.y - 0.055 - 0.02 * sin(vBind.z * 40.0)))) * step(0.6, abs(vBindN.x));
    c = mix(vec3(0.95), uTeam, max(sole, swoosh));
    float lace = step(0.65, vBindN.y) * step(0.5, fract(vBind.z * 55.0)) * step(0.06, vBind.y);
    c = mix(c, vec3(0.8), lace);`,
  "s-neon": `
    float sole = 1.0 - step(0.03, vBind.y);
    c = mix(vec3(0.78, 1.0, 0.16), vec3(0.96), sole);
    float lace = step(0.65, vBindN.y) * step(0.5, fract(vBind.z * 55.0)) * step(0.06, vBind.y);
    c = mix(c, vec3(0.1), lace);`,
  "s-court": `
    float sole = 1.0 - step(0.035, vBind.y);
    c = mix(uTeam, vec3(0.97), sole);
    c = mix(c, vec3(0.97), (1.0 - step(0.012, abs(vBind.y - 0.075))) * step(0.5, abs(vBindN.x)));
    float lace = step(0.6, vBindN.z) * step(0.5, fract(vBind.y * 60.0)) * step(0.05, vBind.y);
    c = mix(c, vec3(0.97), lace);`,
  "s-gold": `
    float sole = 1.0 - step(0.03, vBind.y);
    c = mix(vec3(0.07), vec3(0.9, 0.72, 0.29), sole);
    c = mix(c, vec3(0.9, 0.72, 0.29), (1.0 - step(0.008, abs(vBind.y - 0.06))) * step(0.5, abs(vBindN.x)));
    rough = 0.45;`,
  // Retro koşu: gri file üst, lacivert süet paneller, takım renginde yan şerit, karamel kauçuk taban
  "s-retro": `
    float sole = 1.0 - step(0.022, vBind.y);
    float mid = (1.0 - step(0.034, vBind.y)) * (1.0 - sole);
    c = vec3(0.7, 0.71, 0.73);
    float panel = step(0.55, abs(vBindN.x)) * (step(0.085, vBind.y) + step(0.62, abs(vBindN.z)));
    c = mix(c, vec3(0.11, 0.15, 0.3), min(1.0, panel));
    float stripe = (1.0 - step(0.009, abs(vBind.y - 0.05 - 0.25 * (vBind.z)))) * step(0.6, abs(vBindN.x));
    c = mix(c, uTeam, stripe);
    c = mix(c, vec3(0.95), mid);
    c = mix(c, vec3(0.64, 0.42, 0.22), sole);`,
  // Siyah deri yüksek bilekli bot: beyaz kauçuk taban, ince beyaz yan çizgi
  "s-leather": `
    float sole = 1.0 - step(0.035, vBind.y);
    c = mix(vec3(0.055, 0.055, 0.065), vec3(0.95), sole);
    c = mix(c, vec3(0.95), (1.0 - step(0.006, abs(vBind.y - 0.078))) * step(0.5, abs(vBindN.x)));`,
  "s-rainbow": `
    float sole = 1.0 - step(0.03, vBind.y);
    c = mix(fitHue(fract(vBind.z * 3.0 + vBind.y * 4.0)), vec3(0.96), sole);`,
  "s-lava": `
    float sole = 1.0 - step(0.035, vBind.y);
    c = mix(vec3(1.0, 0.23, 0.12), vec3(1.0, 0.7, 0.12), smoothstep(0.04, 0.16, vBind.y + 0.03 * fitNoise(vBind * 60.0)));
    c = mix(c, vec3(0.07), sole);
    glow = vec3(0.4, 0.08, 0.0) * (1.0 - sole);`,
  sock: `c = vec3(0.96); c = mix(c, uTeam, (1.0 - step(0.01, abs(v - 0.8))));`,
  // ----- Saç ve iç giyim -----
  // Saç: teller geriye ve hafif yukarı taranmış akar; ince tel + tutam + geniş dalga katmanları,
  // tutam içinde parlaklık değişimi (plastik kask görünmesin)
  hair: `vec3 hn = normalize(vBindN);
    vec3 hd = vec3(0.0, 0.3, -1.0);
    hd = normalize(hd - hn * dot(hd, hn) + vec3(0.0, 1e-3, 0.0));
    vec3 ha = normalize(cross(hn, hd));
    float hu = dot(vBind, ha), hw = dot(vBind, hd);
    float s1 = fitNoise(vec3(hu * 700.0, hw * 12.0, 3.1));
    float s2 = fitNoise(vec3(hu * 190.0, hw * 4.0, 7.7));
    float s3 = fitNoise(vec3(hu * 45.0, hw * 1.2, 1.3));
    float st = s1 * 0.45 + s2 * 0.35 + s3 * 0.2;
    c = uTeam * (0.5 + 0.85 * st);
    rough = 0.8 - 0.2 * s2;`,
  under: `c = vec3(0.12, 0.12, 0.14);`,
  "bra-team": `c = uTeam; c = mix(c, uDark, step(0.85, v) + (1.0 - step(0.15, v)));`,
};

type Role = "top" | "bottom" | "shoe" | "sock" | "hair" | "under";

/** Rol + desenden gölgelendirici anahtarı */
function lookKey(role: Role, id: string, look: string): string {
  let key = look;
  if (role === "bottom" && look === "plain") key = "b-plain";
  if (role === "sock") key = "sock";
  if (role === "shoe") key = "s-" + look;
  if (role === "hair") key = "hair";
  if (role === "under") key = look;
  if (id === "hood") key = look === "camo" ? "camo" : "hood";
  if (!LOOK_GLSL[key]) key = role === "bottom" ? "b-plain" : role === "shoe" ? "s-white" : "plain";
  return key;
}

/**
 * Ortak giysi gölgelendiricisi: tüm desenler ve kumaş/kırışık kodları tek programda, uniform ile seçilir.
 * Eskiden her desen ayrı programdı (~40 derleme); şimdi bir kez derlenir, kombin değişimi anlıktır.
 */
let UBER: { look: string; fab: string; fabIndex: Map<string, number>; lookIndex: Map<string, number> } | null = null;
function fabCombo(key: string, role: Role, id: string) {
  return `${key}|${role}|${id === "hood" ? "h" : ""}`;
}
function uber() {
  if (UBER) return UBER;
  const lookIndex = new Map<string, number>();
  Object.keys(LOOK_GLSL).forEach((k, i) => lookIndex.set(k, i));
  const look = Object.keys(LOOK_GLSL)
    .map((k, i) => `${i ? "else " : ""}if (uLookI == ${i}) {\n${LOOK_GLSL[k]}\n}`)
    .join("\n");
  // Kullanılan tüm (desen, rol, kapüşon) birleşimlerinin kumaş kodu; aynı kodlar tek dalda
  const combos: [string, Role, string][] = [];
  const add = (role: Role, id: string, lk: string) => combos.push([lookKey(role, id, lk), role, id]);
  for (const r of REGIONS) {
    for (const it of r.items) {
      if (r.id === "top") {
        for (const id of it.mesh ?? []) add("top", id, it.look ?? "plain");
        if (it.id === "bra") add("under", "bra", "bra-team");
      } else if (r.id === "bottom") for (const id of it.mesh ?? []) add("bottom", id, it.look ?? "plain");
      else if (r.id === "shoes") {
        for (const id of it.mesh ?? []) id === "socks" ? add("sock", id, "sock") : add("shoe", id, it.look ?? "white");
      } else if (r.id === "hair") add("hair", "hair_short", it.look ?? "default");
    }
  }
  add("under", "brief", "under");
  add("under", "bra", "under");
  const codeIndex = new Map<string, number>();
  const fabIndex = new Map<string, number>();
  const parts: string[] = [];
  for (const [key, role, id] of combos) {
    const code = fabricCode(key, role, id);
    let i = codeIndex.get(code);
    if (i === undefined) {
      i = parts.length;
      codeIndex.set(code, i);
      parts.push(`${i ? "else " : ""}if (uFabI == ${i}) {\n${code}\n}`);
    }
    fabIndex.set(fabCombo(key, role, id), i);
  }
  UBER = { look, fab: parts.join("\n"), fabIndex, lookIndex };
  return UBER;
}

interface GarmentUniforms {
  uTeam: { value: THREE.Color };
  uDark: { value: THREE.Color };
  uLookI: { value: number };
  uFabI: { value: number };
}

function garmentMaterial(mesh: THREE.SkinnedMesh, tpl: Template) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const U = uber();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.84,
    // sheen ve clearcoat hep açık: değerleri değişse de program aynı kalsın
    sheen: 0.5,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0x5e5e64),
    clearcoat: 0.001,
    clearcoatRoughness: 0.4,
  });
  const u: GarmentUniforms = {
    uTeam: { value: new THREE.Color(0xffffff) },
    uDark: { value: new THREE.Color(0x888888) },
    uLookI: { value: 0 },
    uFabI: { value: 0 },
  };
  mat.userData.u = u;
  mat.customProgramCacheKey = () => "garment-uber-1";
  const maxX = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x));
  const j = tpl.joints;
  const uMin = { value: bb.min.clone() };
  const uMax = { value: new THREE.Vector3(maxX, bb.max.y, bb.max.z) };
  const uJ = { value: new THREE.Vector4(j.sh, j.el, j.wr, tpl.headTop) };
  const uL = { value: new THREE.Vector4(j.hip, j.knee, j.ank, 0) };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uMin, uMax, uJ, uL });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nvarying vec3 vBindN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;\nvBindN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform int uLookI;\nuniform int uFabI;\n" + GLSL_COMMON + FABRIC_COMMON)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 glow = vec3(0.0);
        float rough = 1.0;
        float fabH = 0.0;
        {
          float v = clamp((vBind.y - uMin.y) / max(0.001, uMax.y - uMin.y), 0.0, 1.0);
          float ax = clamp(abs(vBind.x) / max(0.001, uMax.x), 0.0, 1.0);
          vec3 c = uTeam;
          ${U.look}
          {
          ${U.fab}
          }
          diffuseColor.rgb *= c;
        }`,
      )
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = fabBump(-vViewPosition, normal, fabH);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor *= rough;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += glow;");
  };
  return mat;
}

/** Bir giysiyi desen ve kumaşa ayarla (yalnızca uniform ve malzeme değerleri) */
function setGarment(mat: THREE.MeshPhysicalMaterial, id: string, role: Role, look: string, team: THREE.Color, teamDark: THREE.Color) {
  const U = uber();
  const key = lookKey(role, id, look);
  const u = mat.userData.u as GarmentUniforms;
  u.uLookI.value = U.lookIndex.get(key) ?? 0;
  u.uFabI.value = U.fabIndex.get(fabCombo(key, role, id)) ?? U.fabIndex.get(fabCombo(key, role, "")) ?? 0;
  u.uTeam.value.copy(role === "hair" ? new THREE.Color(HAIR[look] ?? HAIR.default) : team);
  u.uDark.value.copy(teamDark);
  const fp = FABRIC_PARAMS[LOOK_FABRIC[key] ?? "jersey"];
  mat.roughness = fp.roughness;
  mat.sheen = Math.max(0.001, fp.sheen);
  mat.sheenRoughness = fp.sheenRoughness;
  mat.sheenColor.setHex(fp.sheenColor);
  mat.clearcoat = Math.max(0.001, fp.clearcoat ?? 0);
  mat.clearcoatRoughness = fp.clearcoatRoughness ?? 0.4;
  // Katman sırası: üst > alt > iç çamaşır. Birbirine çok yakın yüzeylerde (bel bandı, etek ucu)
  // titreşen derinlik yerine dıştaki katman kazanır.
  const layer = role === "top" ? -3 : role === "bottom" ? -1.5 : role === "sock" ? -0.5 : 0;
  mat.polygonOffset = layer !== 0;
  mat.polygonOffsetFactor = layer;
  mat.polygonOffsetUnits = layer * 2;
}

function eyeMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  mat.customProgramCacheKey = () => "eyes3";
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBN;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float f = vBN.z;
        vec3 c = vec3(0.93, 0.91, 0.88);
        c = mix(c, vec3(0.27, 0.17, 0.1), smoothstep(0.86, 0.88, f));
        c = mix(c, vec3(0.02), smoothstep(0.955, 0.965, f));
        diffuseColor.rgb = c;`,
      );
  };
  return mat;
}

/* ---------- Kemiğe bağlı aksesuarlar ---------- */

function findBone(model: THREE.Object3D, name: string): THREE.Bone | null {
  let b: THREE.Bone | null = null;
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === name) b = o as THREE.Bone;
  });
  return b;
}

/** Nesneyi kemiğe bağlar; içerideki ölçüler metre ve model eksenlerinde (bağ pozuna göre). */
function attachToBone(model: THREE.Object3D, boneName: string, g: THREE.Group, alongBone = false) {
  const bone = findBone(model, boneName);
  if (!bone) return;
  model.updateMatrixWorld(true);
  const s = bone.getWorldScale(new THREE.Vector3()).x;
  const holder = new THREE.Group();
  if (!alongBone) holder.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  holder.scale.setScalar(1 / s);
  holder.add(g);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  });
  bone.add(holder);
}

/** Başlıklar: ölçüler kafanın gerçek boyutundan (bağ pozunda tepe ve yarıçap) türetilir. */
function addHeadwear(model: THREE.Object3D, tpl: Template, id: string, team: number) {
  if (id === "none") return;
  const g = new THREE.Group();
  const top = tpl.headTop - tpl.headBoneY; // kemikten tepeye
  const R = tpl.headR * 1.08;
  const teamMat = new THREE.MeshStandardMaterial({ color: team, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.9 });
  const cy = top - R * 0.95; // kafa ortası
  const dome = (mat: THREE.Material, sy = 1.0) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    d.scale.set(1, sy, 1.12);
    d.position.set(0, cy + R * 0.1, -0.005);
    return d;
  };
  const brim = (mat: THREE.Material, len = 1.35) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), mat);
    b.scale.set(1.15, 1, len);
    b.position.set(0, cy + R * 0.12, R * 0.95);
    return b;
  };
  const ring = (mat: THREE.Material, r: number, h: number, y: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), mat);
    m.position.set(0, y, 0);
    m.scale.set(1, 1, 1.15);
    return m;
  };
  switch (id) {
    case "cap": {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), dark);
      btn.position.set(0, cy + R * 1.12, 0);
      g.add(dome(teamMat), brim(dark), btn);
      break;
    }
    case "backcap": {
      const cap = new THREE.Group();
      cap.add(dome(teamMat), brim(white, 1.1), ring(white, R * 1.02, 0.025, cy + R * 0.12));
      cap.rotation.y = Math.PI;
      g.add(cap);
      break;
    }
    case "beanie": {
      const knit = new THREE.MeshStandardMaterial({ color: 0x2f3440, roughness: 1 });
      const b = dome(knit, 1.3);
      b.position.y = cy;
      const cuff = ring(new THREE.MeshStandardMaterial({ color: team, roughness: 1 }), R * 1.08, 0.05, cy + 0.01);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), white);
      pom.position.set(0, cy + R * 1.42, 0);
      g.add(b, cuff, pom);
      break;
    }
    case "visor": {
      const visorMat = new THREE.MeshStandardMaterial({ color: 0x18c8ff, roughness: 0.2, transparent: true, opacity: 0.85 });
      g.add(ring(white, R * 1.02, 0.035, cy + R * 0.2), brim(visorMat, 1.6));
      break;
    }
    case "band":
    default: {
      g.add(ring(white, R * 1.0, 0.04, cy + R * 0.25));
      g.add(ring(new THREE.MeshStandardMaterial({ color: team, roughness: 0.8 }), R * 1.012, 0.012, cy + R * 0.25));
    }
  }
  attachToBone(model, "mixamorigHead", g);
}

function addAccessory(model: THREE.Object3D, tpl: Template, id: string, team: number) {
  if (id === "chain") {
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c75c, roughness: 0.25, metalness: 1 });
    const g = new THREE.Group();
    const r = tpl.sex === "m" ? 0.078 : 0.068;
    const chain = new THREE.Mesh(new THREE.TorusGeometry(r, 0.009, 8, 40), gold);
    chain.rotation.x = Math.PI / 2 + 0.75;
    chain.scale.set(1.0, 1.35, 1);
    chain.position.set(0, -0.03, 0.045);
    const charm = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), gold);
    charm.position.set(0, -0.095, 0.11);
    g.add(chain, charm);
    attachToBone(model, "mixamorigNeck", g);
  }
  if (id === "wrist") {
    for (const side of ["Left", "Right"]) {
      const g = new THREE.Group();
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 1 }));
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0365, 0.0365, 0.014, 20, 1, true), new THREE.MeshStandardMaterial({ color: team, roughness: 1 }));
      w.position.y = -0.02;
      s.position.y = -0.02;
      g.add(w, s);
      attachToBone(model, `mixamorig${side}Hand`, g, true);
    }
  }
  if (id === "captain") {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.8 }));
    b.position.y = 0.13;
    g.add(b);
    attachToBone(model, "mixamorigLeftArm", g, true);
  }
}
