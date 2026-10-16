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

  constructor(tpl: Template, shirt: number, shorts: number, ringColor: number) {
    this.model = cloneSkinned(tpl.scene);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const next = mats.map((mat) => {
        if (mat.name === "Jersey") {
          const c = (mat as THREE.MeshStandardMaterial).clone();
          c.color.setHex(shirt);
          return c;
        }
        if (mat.name === "Shorts") {
          const c = (mat as THREE.MeshStandardMaterial).clone();
          c.color.setHex(shorts);
          return c;
        }
        return mat;
      });
      m.material = Array.isArray(m.material) ? next : next[0];
    });
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
