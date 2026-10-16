import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
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
import { cleanFit, fitItem } from "../../../shared/outfit";
import type { FigureAnim } from "./figure3d";

/**
 * Blender'da üretilen riglenmiş sporcu (public/models/athlete.glb).
 * Koşu / yürüme / bekleme mocap'tir; parkur hareketleri aynı iskelete yazılmış kliplerdir.
 * Fizik durumuna göre klipler arasında yumuşak geçiş (crossfade) yapılır.
 */

interface Template {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

let template: Template | null = null;
let loading: Promise<Template> | null = null;

export function loadAthlete(): Promise<Template> {
  if (template) return Promise.resolve(template);
  if (!loading) {
    loading = new GLTFLoader().loadAsync("/models/athlete.glb").then((g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = false;
          m.frustumCulled = false;
        }
      });
      template = { scene: g.scene as THREE.Group, clips: new Map(g.animations.map((c) => [c.name, c])) };
      return template;
    });
  }
  return loading;
}

export function athleteTemplate(): Template | null {
  return template;
}

export function athleteReady(): boolean {
  return template !== null;
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

export class Athlete {
  root = new THREE.Group();
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private lastAk = 0;

  constructor(tpl: Template, shirt: number, shorts: number, ringColor: number, fit = "0000") {
    fit = cleanFit(fit);
    this.model = cloneSkinned(tpl.scene);
    const top = fitItem(fit, "top").id;
    const bottom = fitItem(fit, "bottom").id;
    const shoes = fitItem(fit, "shoes").id;
    const acc = fitItem(fit, "acc").id;
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const next = mats.map((mat) => {
        const c = (mat as THREE.MeshStandardMaterial).clone();
        if (mat.name === "Jersey") {
          c.color.setHex(0xffffff);
          patchOutfit(c, { part: "jersey", top }, shirt);
        } else if (mat.name === "Shorts") {
          c.color.setHex(0xffffff);
          c.roughness = 0.75;
          patchOutfit(c, { part: "pants", bottom }, shorts);
        } else {
          patchOutfit(c, { part: "body", top, shoes, acc }, shirt);
        }
        return c;
      });
      m.material = Array.isArray(m.material) ? next : next[0];
    });
    addHeadwear(this.model, fitItem(fit, "head").id, shirt);
    addAccessory(this.model, acc);
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
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32), this.ringMat);
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
    // Takla: modeli kalça hizasında öne doğru bir tur döndür
    if (a.pose === ACT_ROLL) {
      const t = Math.min(1, a.at / 0.42);
      const th = t * Math.PI * 2;
      // Gövdeyi topa çevir (ezilmiş ölçek) ve merkezinden yuvarla; zeminin altına inmez
      const tuck = Math.sin(t * Math.PI);
      const sy = 1 - 0.45 * tuck;
      const piv = 0.48 + (1 - tuck) * 0.4;
      this.model.scale.set(1, sy, 1 - 0.2 * tuck);
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
      // Havada: zıplama klibinin tepe noktasında dur
      const act = this.actions.get("jump")!;
      this.play("jump", 0.1, false, 0);
      act.time = act.getClip().duration * (a.hv > 0 ? 0.35 : 0.65);
    } else if (speed > 2.6) {
      // Koşu klibini gerçek hıza göre ölçekle (adım ~1,9 m/döngü)
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

  setRing(color: number, opacity: number) {
    this.ringMat.color.setHex(color);
    this.ringMat.opacity = opacity;
  }
}

/* ---------- Gardırop görünümleri ---------- */

/**
 * Desenler bağ pozundaki (bind pose, T-pozu) yerel konuma göre çizilir; animasyonla kaymaz.
 * Ölçüler metre: ayak 0, omuz ~1,40, baş tepesi ~1,8. x sağ-sol (kollar ±0,11…0,62), z ön.
 * Her desen `tc` (takım rengiyle boyanmış taban) üzerinde çalışır.
 */
const GLSL_COMMON = `
varying vec3 vBind;
varying vec3 vBindN;
uniform vec3 uTeam;
float fitHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fitNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(mix(fitHash(i), fitHash(i + vec3(1,0,0)), f.x), mix(fitHash(i + vec3(0,1,0)), fitHash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(fitHash(i + vec3(0,0,1)), fitHash(i + vec3(1,0,1)), f.x), mix(fitHash(i + vec3(0,1,1)), fitHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  return n;
}
vec3 fitHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

const TOP_GLSL: Record<string, string> = {
  pro: `
    float side = smoothstep(0.80, 0.86, abs(vBindN.x));
    float collar = step(1.395, vBind.y);
    float hem = 1.0 - step(1.06, vBind.y);
    tc = mix(tc, vec3(0.95), max(side, max(collar, hem)));`,
  stripe: `
    float band = step(0.55, fract(vBind.y * 24.0));
    tc = mix(tc, vec3(0.96), band * 0.9);`,
  camo: `
    float n1 = fitNoise(vBind * 18.0);
    float n2 = fitNoise(vBind * 34.0 + 7.0);
    tc = mix(tc, uTeam * 0.35, step(0.55, n1));
    tc = mix(tc, uTeam * 0.7 + vec3(0.05), step(0.62, n2) * (1.0 - step(0.55, n1)));`,
  sunset: `
    float g = clamp((vBind.y - 1.06) / 0.34, 0.0, 1.0);
    tc = mix(uTeam, vec3(1.0, 0.62, 0.2), smoothstep(0.15, 0.6, g));
    tc = mix(tc, vec3(1.0, 0.25, 0.6), smoothstep(0.6, 1.0, g));`,
  bolt: `
    float zz = 1.27 + 0.035 * (abs(fract(vBind.x * 9.0) - 0.5) * 4.0 - 1.0);
    float bolt = 1.0 - step(0.022, abs(vBind.y - zz));
    tc = mix(tc, vec3(1.0, 0.84, 0.0), bolt);
    tc = mix(tc, vec3(0.08), step(1.395, vBind.y));`,
  carbon: `
    float weave = step(0.5, fract((vBind.x + vBind.y) * 60.0)) * 0.035;
    tc = mix(vec3(0.07 + weave), uTeam, step(1.395, vBind.y));`,
};

const BOTTOM_GLSL: Record<string, string> = {
  tights: `tc = uTeam * 0.85;`,
  tracks: `
    float tri = step(0.86, abs(vBindN.x)) * step(0.5, fract(vBind.z * 70.0 + 0.25));
    tc = mix(uTeam * 0.75, vec3(0.97), tri);`,
  cargo: `
    float n1 = fitNoise(vBind * 14.0);
    float n2 = fitNoise(vBind * 26.0 + 3.0);
    tc = vec3(0.33, 0.4, 0.23);
    tc = mix(tc, vec3(0.2, 0.25, 0.14), step(0.55, n1));
    tc = mix(tc, vec3(0.42, 0.35, 0.22), step(0.6, n2) * (1.0 - step(0.55, n1)));`,
  neon: `
    float pipe = step(0.9, abs(vBindN.x)) * (1.0 - step(0.012, abs(fract(vBind.z * 18.0) - 0.5) - 0.45));
    pipe = step(0.9, abs(vBindN.x));
    tc = mix(vec3(0.07), vec3(0.17, 1.0, 0.84), pipe);
    fitGlow = vec3(0.1, 0.7, 0.6) * pipe;`,
  split: `tc = mix(uTeam * 0.85, vec3(0.08), step(0.0, vBind.x));`,
};

const SHOE_GLSL: Record<string, string> = {
  neon: `sc = mix(vec3(0.78, 1.0, 0.16) * (0.7 + 0.6 * l), vec3(0.96), sole);`,
  white: `sc = mix(vec3(0.95) * (0.85 + 0.3 * l), uTeam, sole);`,
  gold: `sc = mix(vec3(0.07) + 0.1 * l, vec3(0.9, 0.72, 0.29), max(sole, step(0.5, fract(vBind.z * 40.0)) * step(0.07, vBind.y) * (1.0 - step(0.08, vBind.y))));`,
  rainbow: `sc = mix(fitHue(fract(vBind.z * 4.0 + vBind.y * 3.0)) * (0.75 + 0.4 * l), vec3(0.96), sole);`,
  lava: `sc = mix(mix(vec3(1.0, 0.23, 0.12), vec3(1.0, 0.7, 0.12), smoothstep(0.03, 0.11, vBind.y + 0.03 * fitNoise(vBind * 60.0))), vec3(0.07), sole);
    fitGlow += vec3(0.35, 0.08, 0.0) * shoe * (1.0 - sole);`,
};

type PatchSpec =
  | { part: "jersey"; top: string }
  | { part: "pants"; bottom: string }
  | { part: "body"; top: string; shoes: string; acc: string };

function patchOutfit(mat: THREE.MeshStandardMaterial, spec: PatchSpec, team: number) {
  const teamCol = new THREE.Color(team);
  const key = JSON.stringify(spec);
  mat.customProgramCacheKey = () => "fit-" + key;
  let frag = "vec3 fitGlow = vec3(0.0);\n";
  if (spec.part === "jersey") {
    frag += `{ vec3 tc = uTeam; ${TOP_GLSL[spec.top] ?? ""} diffuseColor.rgb *= tc; }`;
  } else if (spec.part === "pants") {
    frag += `{ vec3 tc = uTeam; ${BOTTOM_GLSL[spec.bottom] ?? ""} diffuseColor.rgb *= tc; }`;
  } else {
    // Modelin dokusundaki gri üst de formaya dönüşür (gövdede düşük doygunluklu pikseller)
    frag += `
      {
        vec3 t0 = diffuseColor.rgb;
        float mx = max(t0.r, max(t0.g, t0.b));
        float mn = min(t0.r, min(t0.g, t0.b));
        float gray = 1.0 - smoothstep(0.04, 0.09, mx - mn);
        float torso = step(1.12, vBind.y) * (1.0 - step(1.40, vBind.y)) * (1.0 - step(0.17, abs(vBind.x)));
        float l = dot(t0, vec3(0.3, 0.59, 0.11));
        vec3 tc = uTeam * (0.65 + 0.7 * l);
        ${TOP_GLSL[spec.top] ?? ""}
        diffuseColor.rgb = mix(t0, tc * (0.75 + 0.5 * l), gray * torso);
      }
      {
        float shoe = 1.0 - smoothstep(0.105, 0.125, vBind.y);
        float sole = 1.0 - step(0.028, vBind.y);
        float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        vec3 sc = diffuseColor.rgb;
        ${SHOE_GLSL[spec.shoes] ?? ""}
        diffuseColor.rgb = mix(diffuseColor.rgb, sc, shoe);
      }`;
    // Kollardaki aksesuarlar (T-pozunda kollar x ekseni boyunca, y≈1,39)
    const arm = "(step(1.32, vBind.y) * (1.0 - step(1.47, vBind.y)))";
    if (spec.acc === "sleeve")
      frag += `{ float m = ${arm} * step(0.16, abs(vBind.x)) * (1.0 - step(0.6, abs(vBind.x)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08) + 0.04 * step(0.5, fract(abs(vBind.x) * 30.0)), m); }`;
    if (spec.acc === "wrist")
      frag += `{ float m = ${arm} * step(0.545, abs(vBind.x)) * (1.0 - step(0.6, abs(vBind.x)));
        float mid = step(0.563, abs(vBind.x)) * (1.0 - step(0.582, abs(vBind.x)));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.95), uTeam, mid), m); }`;
    if (spec.acc === "captain")
      frag += `{ float m = ${arm} * step(0.22, vBind.x) * (1.0 - step(0.285, vBind.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.83, 0.0), m); }`;
  }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTeam = { value: teamCol };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nvarying vec3 vBindN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;\nvBindN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + GLSL_COMMON)
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + frag)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += fitGlow;");
  };
  mat.needsUpdate = true;
}

function findBone(model: THREE.Object3D, name: string): THREE.Bone | null {
  let b: THREE.Bone | null = null;
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === name) b = o as THREE.Bone;
  });
  return b;
}

/** Nesneyi kemiğe bağlar; içerideki ölçüler metre ve model eksenlerinde (bağ pozuna göre). */
function attachToBone(model: THREE.Object3D, boneName: string, g: THREE.Group) {
  const bone = findBone(model, boneName);
  if (!bone) return;
  model.updateMatrixWorld(true);
  const s = bone.getWorldScale(new THREE.Vector3()).x;
  const bonePos = bone.getWorldPosition(new THREE.Vector3());
  const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const modelScale = model.getWorldScale(new THREE.Vector3()).x;
  // g, model uzayında kemiğe göre konumlanır: önce kemik dönüşümünü geri al
  const holder = new THREE.Group();
  holder.quaternion.copy(q);
  holder.scale.setScalar(1 / s);
  void bonePos;
  void modelScale;
  holder.add(g);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  });
  bone.add(holder);
}

/** Kafa kemiğine bağlı başlıklar (kemiğe göre: alın ~+0,17 m yukarıda, +z ön). */
function addHeadwear(model: THREE.Object3D, id: string, team: number) {
  const g = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color: team, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.9 });
  const dome = (mat: THREE.Material, sy = 0.95) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.112, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    d.scale.set(1.12, sy, 1.2);
    d.position.set(0, 0.165, 0);
    return d;
  };
  const brim = (mat: THREE.Material, len = 1.35) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), mat);
    b.scale.set(1.2, 1, len);
    b.position.set(0, 0.17, 0.13);
    return b;
  };
  const ring = (mat: THREE.Material, r: number, h: number, y: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), mat);
    m.position.set(0, y, 0.008);
    m.scale.set(1.12, 1, 1.18);
    return m;
  };
  switch (id) {
    case "cap": {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), dark);
      btn.position.set(0, 0.272, 0);
      g.add(dome(teamMat), brim(dark), btn);
      break;
    }
    case "backcap": {
      const cap = new THREE.Group();
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), white);
      btn.position.set(0, 0.272, 0);
      const strap = ring(white, 0.11, 0.025, 0.175);
      cap.add(dome(teamMat), brim(white, 1.1), btn, strap);
      cap.rotation.y = Math.PI;
      g.add(cap);
      break;
    }
    case "beanie": {
      const knit = new THREE.MeshStandardMaterial({ color: 0x2f3440, roughness: 1 });
      const b = dome(knit, 1.25);
      b.position.y = 0.15;
      const cuff = ring(new THREE.MeshStandardMaterial({ color: team, roughness: 1 }), 0.118, 0.05, 0.165);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 1 }));
      pom.position.set(0, 0.3, 0);
      g.add(b, cuff, pom);
      break;
    }
    case "visor": {
      const visorMat = new THREE.MeshStandardMaterial({ color: 0x18c8ff, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 });
      g.add(ring(white, 0.108, 0.035, 0.18), brim(visorMat, 1.6));
      break;
    }
    case "band":
    default: {
      g.add(ring(white, 0.106, 0.04, 0.165));
      const mid = ring(new THREE.MeshStandardMaterial({ color: team, roughness: 0.8 }), 0.1075, 0.012, 0.165);
      g.add(mid);
    }
  }
  attachToBone(model, "mixamorigHead", g);
}

/** Boyun zinciri gibi takılar. */
function addAccessory(model: THREE.Object3D, id: string) {
  if (id !== "chain") return;
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c75c, roughness: 0.25, metalness: 1 });
  const g = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 8, 40), gold);
  chain.rotation.x = Math.PI / 2 + 0.75;
  chain.scale.set(1.0, 1.35, 1);
  chain.position.set(0, -0.045, 0.055);
  const charm = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), gold);
  charm.position.set(0, -0.105, 0.115);
  g.add(chain, charm);
  attachToBone(model, "mixamorigNeck", g);
}
