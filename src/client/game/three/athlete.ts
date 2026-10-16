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
} from "../../../shared/sim";
import { cleanFit, fitIndex } from "../../../shared/outfit";
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
    const top = fitIndex(fit, "top");
    const bottom = fitIndex(fit, "bottom");
    const shoes = fitIndex(fit, "shoes");
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const next = mats.map((mat) => {
        const c = (mat as THREE.MeshStandardMaterial).clone();
        if (mat.name === "Jersey") {
          c.color.setHex(shirt);
          patchOutfit(c, top === 0 ? "proTop" : "stripeTop", shirt);
        } else if (mat.name === "Shorts") {
          c.color.setHex(shorts);
          c.roughness = 0.75;
          patchOutfit(c, bottom === 0 ? "plainBottom" : "stripeBottom", shorts);
        } else {
          patchOutfit(c, shoes === 0 ? "neonShoes" : "whiteShoes", shirt, top === 0 ? "proTop" : "stripeTop");
        }
        return c;
      });
      m.material = Array.isArray(m.material) ? next : next[0];
    });
    addHeadwear(this.model, fitIndex(fit, "head"), shirt);
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

type Look = "proTop" | "stripeTop" | "plainBottom" | "stripeBottom" | "neonShoes" | "whiteShoes";

/**
 * Desenler bağ pozundaki (bind pose) yerel konuma göre çizilir; bu yüzden animasyonla kaymaz.
 * Model ölçüsü: ayak 0, baş tepesi ~1,8 m; x sağ-sol, z ön.
 */
const TOP_GLSL: Record<string, string> = {
  proTop: `
    float side = smoothstep(0.80, 0.86, abs(vBindN.x));
    float collar = step(1.405, vBind.y);
    float hem = 1.0 - step(1.06, vBind.y);
    tc = mix(tc, vec3(0.95), max(side, max(collar, hem)));`,
  stripeTop: `
    float band = step(0.55, fract(vBind.y * 24.0));
    tc = mix(tc, vec3(0.96), band * 0.9);`,
};

function patchOutfit(mat: THREE.MeshStandardMaterial, look: Look, team: number, bodyTop?: "proTop" | "stripeTop") {
  const teamCol = new THREE.Color(team);
  mat.customProgramCacheKey = () => "fit-" + look + (bodyTop ?? "");
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTeam = { value: teamCol };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nvarying vec3 vBindN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;\nvBindN = normal;");
    let frag = "";
    switch (look) {
      case "proTop":
      case "stripeTop":
        frag = `vec3 tc = diffuseColor.rgb; ${TOP_GLSL[look]} diffuseColor.rgb = tc;`;
        break;
      case "plainBottom":
        frag = `diffuseColor.rgb *= 0.85;`;
        break;
      case "stripeBottom":
        // Bacağın dış ve iç yanlarında üçlü şerit
        frag = `
          float s = abs(vBindN.x);
          float tri = step(0.86, s) * step(0.5, fract(vBind.z * 70.0 + 0.25));
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.75, vec3(0.97), tri);`;
        break;
      case "neonShoes":
        frag = `
          float shoe = 1.0 - smoothstep(0.105, 0.125, vBind.y);
          float sole = 1.0 - step(0.028, vBind.y);
          float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 c = mix(vec3(0.78, 1.0, 0.16) * (0.7 + 0.6 * l), vec3(0.96), sole);
          diffuseColor.rgb = mix(diffuseColor.rgb, c, shoe);`;
        break;
      case "whiteShoes":
        frag = `
          float shoe = 1.0 - smoothstep(0.105, 0.125, vBind.y);
          float sole = 1.0 - step(0.028, vBind.y);
          float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 c = mix(vec3(0.95) * (0.85 + 0.3 * l), uTeam, sole);
          diffuseColor.rgb = mix(diffuseColor.rgb, c, shoe);`;
        break;
    }
    if (bodyTop) {
      // Modelin dokusundaki gri üstü de formaya çevir (gövdede, düşük doygunluklu pikseller)
      frag += `
        {
          vec3 t0 = diffuseColor.rgb;
          float mx = max(t0.r, max(t0.g, t0.b));
          float mn = min(t0.r, min(t0.g, t0.b));
          float gray = 1.0 - smoothstep(0.04, 0.09, mx - mn);
          float torso = step(1.12, vBind.y) * (1.0 - step(1.40, vBind.y)) * (1.0 - step(0.17, abs(vBind.x)));
          float l = dot(t0, vec3(0.3, 0.59, 0.11));
          vec3 tc = uTeam * (0.65 + 0.7 * l);
          ${TOP_GLSL[bodyTop]}
          diffuseColor.rgb = mix(t0, tc, gray * torso);
        }`;
    }
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nvarying vec3 vBindN;\nuniform vec3 uTeam;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + frag);
  };
  mat.needsUpdate = true;
}

/** Kafa kemiğine bağlı şapka / ter bandı. */
function addHeadwear(model: THREE.Object3D, item: 0 | 1, team: number) {
  let head: THREE.Bone | null = null;
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === "mixamorigHead") head = o as THREE.Bone;
  });
  if (!head) return;
  const bone = head as THREE.Bone;
  model.updateMatrixWorld(true);
  const s = bone.getWorldScale(new THREE.Vector3()).x;
  const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const g = new THREE.Group();
  if (item === 0) {
    // Snapback kep: kubbe + düz siperlik + düğme
    const capMat = new THREE.MeshStandardMaterial({ color: team, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.7 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    dome.scale.set(1.12, 0.95, 1.2);
    dome.position.set(0, 0.165, 0.0);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), dark);
    brim.scale.set(1.2, 1, 1.35);
    brim.position.set(0, 0.17, 0.13);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), dark);
    btn.position.set(0, 0.272, 0);
    g.add(dome, brim, btn);
  } else {
    // Ter bandı: alın hizasında beyaz halka, ortada takım renginde şerit
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.9 });
    const stripe = new THREE.MeshStandardMaterial({ color: team, roughness: 0.8 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.04, 24, 1, true), white);
    band.position.set(0, 0.165, 0.008);
    band.scale.set(1, 1, 1.12);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.1075, 0.1075, 0.012, 24, 1, true), stripe);
    mid.position.copy(band.position);
    mid.scale.copy(band.scale);
    g.add(band, mid);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m) m.side = THREE.DoubleSide;
  });
  g.quaternion.copy(q);
  g.scale.setScalar(1 / s);
  g.position.set(0, 0, 0);
  bone.add(g);
}
