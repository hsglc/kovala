import * as THREE from "three";
import { PLAYER_RADIUS, QUAD_SIZE, SPEED_EVADER } from "../../../shared/constants";
import type { PublicState } from "../../../shared/engine";
import type { Obstacle, QuadLayout } from "../../../shared/maps";
import { ACT_DIVE, ACT_KICK, ACT_JUKE, TAG_DISTANCE, chaserReach, groundAt, type PlayerState } from "../../../shared/sim";
import { TEAM_COLORS, TEAM_DARK, memberTeam } from "../../lib/text";
import { Figure3D, lookFor, type Pose } from "./figure3d";
import { CameraRig } from "./CameraRig";
import { Athlete, athleteTemplate, loadAthlete } from "./athlete";
import { buildVenue } from "./venues";
import type { VenueId } from "../../../shared/venues";
import { buildFloor, buildObstacle, makeMaterials, type QuadMaterials } from "./quadBuilder";

/**
 * three.js sahnesi. Saha düzlemi: x → X, y → Z, yukarı → Y.
 * Kamera karakterin arkasından/üstünden eğik bakar; ekranda yukarı = sahada -y.
 */



interface FigEntry {
  fig: Figure3D | null;
  ath: Athlete | null;
  obj: THREE.Object3D;
  phase: number;
  run: number;
  lx: number;
  ly: number;
  heading: number;
  last: number;
  team: number;
  fit: string;
}

export interface Projected {
  x: number;
  y: number;
  /** ekranda mı */
  on: boolean;
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
  private world = new THREE.Group();
  private figures = new Map<string, FigEntry>();
  private layoutId = "";
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private venueId = "";
  private venueGroup: THREE.Group | null = null;
  private reachRing: THREE.Mesh;
  private edgeGlow: THREE.Mesh[] = [];
  private w = 1;
  private h = 1;
  private rig: CameraRig;
  private mats: QuadMaterials;
  private floorGroup: THREE.Group | null = null;
  private obstacleGroups: THREE.Group[] = [];
  private faded = new Set<THREE.Group>();
  private ray = new THREE.Raycaster();
  private portrait = true;
  private lastChaseKey = -1;
  private lastNow = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x0a1020);
    this.scene.fog = new THREE.Fog(0x0a1020, 26, 60);

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x2a2214, 1.7);
    this.scene.add(this.hemi);
    this.fill = new THREE.DirectionalLight(0x8fb6ff, 0.9);
    this.fill.position.set(10, 6, 14);
    this.scene.add(this.fill);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.scene.add(this.world);
    this.mats = makeMaterials();
    this.rig = new CameraRig(this.camera);
    // Blender sporcu modeli yüklenince mevcut basit figürleri değiştir
    loadAthlete()
      .then(() => {
        for (const [id, e] of this.figures) {
          this.scene.remove(e.obj);
          this.figures.delete(id);
        }
      })
      .catch(() => {});
    this.buildGround();

    this.reachRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.56, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35 }),
    );
    this.reachRing.rotation.x = -Math.PI / 2;
    this.reachRing.position.y = 0.015;
    this.reachRing.visible = false;
    this.scene.add(this.reachRing);
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h > w * 1.15;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.dispose();
  }

  // ---------- Statik sahne ----------

  private buildGround() {
    // Saha çizgisi (parlak beyaz şerit)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8eef7 });
    const lw = 0.1;
    for (const [x, z, w, d] of [
      [QUAD_SIZE / 2, 0, QUAD_SIZE + lw, lw],
      [QUAD_SIZE / 2, QUAD_SIZE, QUAD_SIZE + lw, lw],
      [0, QUAD_SIZE / 2, lw, QUAD_SIZE + lw],
      [QUAD_SIZE, QUAD_SIZE / 2, lw, QUAD_SIZE + lw],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      this.scene.add(m);
    }
    // Kenar uyarı parıltıları (oyuncu çizgiye yaklaşınca yanar)
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.014;
      this.scene.add(m);
      this.edgeGlow.push(m);
    }

  }

  /** Mekânı (çevre, zemin, ışık) kurar. */
  private applyVenue(id: VenueId) {
    if (this.venueGroup) {
      this.scene.remove(this.venueGroup);
      this.venueGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mt of mats) {
            (mt as THREE.MeshStandardMaterial).map?.dispose();
            mt.dispose();
          }
        }
      });
    }
    const v = buildVenue(id, this.mats.steel);
    this.venueGroup = v.group;
    this.scene.add(v.group);
    (this.scene.background as THREE.Color).setHex(v.background);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(v.fog[0]);
    fog.near = v.fog[1];
    fog.far = v.fog[2];
    this.hemi.color.setHex(v.hemi[0]);
    this.hemi.groundColor.setHex(v.hemi[1]);
    this.hemi.intensity = v.hemi[2];
    this.sun.color.setHex(v.sun[0]);
    this.sun.intensity = v.sun[1];
    this.sunOffset = v.sunPos;
    this.fill.color.setHex(v.fill[0]);
    this.fill.intensity = v.fill[1];
    this.renderer.toneMappingExposure = v.exposure;
  }

  private sunOffset: [number, number, number] | null = null;

  private buildLayout(layout: QuadLayout) {
    this.world.clear();
    this.obstacleGroups = [];
    this.faded.clear();
    if (this.floorGroup) this.scene.remove(this.floorGroup);
    this.floorGroup = buildFloor(layout);
    this.scene.add(this.floorGroup);
    for (const o of layout.obstacles) {
      const g = buildObstacle(o, this.mats);
      // Saydamlaşabilsin diye her engelin malzemeleri kendine ait
      g.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : (m.material as THREE.Material).clone();
      });
      this.world.add(g);
      this.obstacleGroups.push(g);
    }
  }

  /** Kamera ile oyuncu arasına giren engeli saydamlaştır. */
  private updateOcclusion(targets: THREE.Vector3[]) {
    const hit = new Set<THREE.Group>();
    for (const t of targets) {
      const dir = t.clone().sub(this.camera.position);
      const len = dir.length();
      this.ray.set(this.camera.position, dir.normalize());
      this.ray.far = len - 0.3;
      const res = this.ray.intersectObjects(this.obstacleGroups, true);
      for (const r of res) {
        let o: THREE.Object3D | null = r.object;
        while (o && !this.obstacleGroups.includes(o as THREE.Group)) o = o.parent;
        if (o) hit.add(o as THREE.Group);
      }
    }
    for (const g of this.obstacleGroups) {
      const want = hit.has(g) ? 0.28 : 1;
      g.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          const sm = mat as THREE.MeshStandardMaterial;
          const cur = sm.opacity ?? 1;
          const next = cur + (want - cur) * 0.25;
          sm.transparent = next < 0.99;
          sm.opacity = next;
          sm.depthWrite = next > 0.9;
        }
        m.castShadow = true;
      });
    }
  }

  // ---------- Çerçeve ----------

  private figureFor(id: string, team: number, fit: string, selfId: string, now: number, p: PlayerState): FigEntry {
    let e = this.figures.get(id);
    if (!e || e.team !== team || (e.ath && e.fit !== fit)) {
      if (e) this.scene.remove(e.obj);
      const shirt = team === 0 ? 0xff3b2f : 0x2f6bff;
      const shorts = team === 0 ? 0xb0201a : 0x173fb0;
      const ringColor = id === selfId ? 0xffffff : parseInt(TEAM_DARK[team as 0 | 1].slice(1), 16);
      let fig: Figure3D | null = null;
      let ath: Athlete | null = null;
      let obj: THREE.Object3D;
      const tpl = athleteTemplate();
      if (tpl) {
        ath = new Athlete(tpl, shirt, shorts, ringColor, fit);
        obj = ath.root;
      } else {
        fig = new Figure3D(lookFor(id, shirt, shorts), ringColor);
        obj = fig.root;
      }
      e = { fig, ath, obj, phase: 0, run: 0, lx: p.x, ly: p.y, heading: Math.atan2(p.fy, p.fx), last: now, team, fit };
      this.figures.set(id, e);
      this.scene.add(obj);
    }
    return e;
  }

  render(
    layout: QuadLayout,
    state: PublicState | null,
    players: Map<string, PlayerState>,
    selfId: string,
    now: number,
  ): Map<string, Projected> {
    const venue = (state?.venue ?? "arena") as VenueId;
    if (venue !== this.venueId) {
      this.venueId = venue;
      this.applyVenue(venue);
    }
    if (layout.id !== this.layoutId) {
      this.layoutId = layout.id;
      this.buildLayout(layout);
    }
    const dtMs = this.lastNow ? Math.min(100, now - this.lastNow) : 16;
    this.lastNow = now;
    const me = players.get(selfId) ?? null;
    let other: PlayerState | null = null;
    for (const [id, p] of players) if (id !== selfId) other = p;
    const chaseKey = state?.chaseStartTick ?? -1;
    if (chaseKey !== this.lastChaseKey && state?.phase === "countdown") {
      this.rig.snap();
      this.lastChaseKey = chaseKey;
    }
    this.rig.update(
      {
        me: me ? { x: me.x, y: me.y, h: me.h, vx: me.vx, vy: me.vy } : null,
        other: other ? { x: other.x, y: other.y, h: other.h } : null,
        wide: state?.phase !== "chase",
      },
      dtMs,
      this.portrait,
    );
    const cam = { x: this.rig.center.x, y: this.rig.center.z };
    const z = Math.min(1, Math.max(0, (this.rig.dist - 10) / 14));

    // Güneş kamerayla gelir (gölge alanı dar ve keskin kalsın)
    const so = this.sunOffset ?? [QUAD_SIZE / 2 - 5, 11, QUAD_SIZE / 2 - 4];
    const ox = so[0] - QUAD_SIZE / 2;
    const oz = so[2] - QUAD_SIZE / 2;
    const ol = Math.hypot(ox, so[1], oz) || 1;
    this.sun.position.set(cam.x + (ox / ol) * 14, (so[1] / ol) * 14, cam.y + (oz / ol) * 14);
    this.sun.target.position.set(cam.x, 0, cam.y);
    this.sun.shadow.camera.far = 50;
    const sc = this.sun.shadow.camera;
    const sr = 11 + z * 6;
    sc.left = -sr;
    sc.right = sr;
    sc.top = sr;
    sc.bottom = -sr;
    sc.updateProjectionMatrix();

    // Figürler
    const seen = new Set<string>();
    const phase = state?.phase;
    const chaserId = state?.chaserId;
    const evaderId = state?.evaderId;
    this.reachRing.visible = false;
    for (const [id, p] of players) {
      seen.add(id);
      const team = memberTeam(state, id) ?? 0;
      const fit = state?.members.find((m) => m.id === id)?.fit ?? "0000";
      const e = this.figureFor(id, team, fit, selfId, now, p);
      const dt = Math.max(1, now - e.last) / 1000;
      e.last = now;
      let d = Math.hypot(p.x - e.lx, p.y - e.ly);
      if (d > 1.5) d = 0;
      e.lx = p.x;
      e.ly = p.y;
      const speed = Math.min(10, d / dt);
      const tgt = Math.min(1, speed / SPEED_EVADER);
      e.run += (tgt - e.run) * Math.min(1, dt * 10);
      e.phase += (d / 1.35) * Math.PI * 2;
      let heading = Math.atan2(p.fy, p.fx);
      if (id === chaserId && evaderId && players.get(evaderId) && phase === "chase") {
        const o = players.get(evaderId)!;
        if (Math.hypot(o.x - p.x, o.y - p.y) < 1.3 || p.ak === ACT_DIVE) heading = Math.atan2(o.y - p.y, o.x - p.x);
      }
      // yumuşak dönüş
      let dh = heading - e.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      e.heading += dh * Math.min(1, dt * (p.ak === ACT_JUKE || p.ak === ACT_KICK ? 30 : 14));

      let mood: Pose = "run";
      if (phase === "result" && state?.last) {
        const winnerId = state.last.winner === "chaser" ? state.last.chaser : state.last.evader;
        mood = id === winnerId ? "cheer" : "tired";
      }
      e.obj.position.set(p.x, 0, p.y);
      const gnd = groundAt(p.x, p.y, layout);
      const airborne = p.ak === 0 && p.h > gnd + 0.05;
      const anim = {
        phase: e.phase,
        run: phase === "chase" ? e.run : 0,
        pose: p.ak,
        at: p.at,
        now,
        mood,
        heading: e.heading,
        h: p.h,
        hv: p.hv,
        airborne,
      };
      if (e.ath) e.ath.update(anim, phase === "chase" ? e.run * SPEED_EVADER : 0, dt);
      else e.fig?.update(anim);
      if (id === chaserId && phase === "chase") {
        const rr = TAG_DISTANCE - PLAYER_RADIUS + chaserReach(p);
        this.reachRing.visible = true;
        this.reachRing.position.set(p.x, 0.015, p.y);
        this.reachRing.scale.setScalar(rr / 0.53);
      }
    }
    for (const [id, e] of this.figures) {
      if (!seen.has(id)) {
        this.scene.remove(e.obj);
        this.figures.delete(id);
      }
    }

    // Kenar uyarısı
    for (const m of this.edgeGlow) (m.material as THREE.MeshBasicMaterial).opacity = 0;
    if (phase === "chase") {
      for (const p of players.values()) {
        const near = [p.x, p.y, QUAD_SIZE - p.x, QUAD_SIZE - p.y];
        near.forEach((v, i) => {
          if (v < 1.0) {
            const m = this.edgeGlow[i];
            const a = Math.min(1, (1.0 - v) / 0.6);
            (m.material as THREE.MeshBasicMaterial).opacity = Math.max((m.material as THREE.MeshBasicMaterial).opacity, 0.55 * a);
            if (i === 0) {
              m.position.set(0, 0.016, p.y);
              m.scale.set(0.3, 3, 1);
            } else if (i === 1) {
              m.position.set(p.x, 0.016, 0);
              m.scale.set(3, 0.3, 1);
            } else if (i === 2) {
              m.position.set(QUAD_SIZE, 0.016, p.y);
              m.scale.set(0.3, 3, 1);
            } else {
              m.position.set(p.x, 0.016, QUAD_SIZE);
              m.scale.set(3, 0.3, 1);
            }
          }
        });
      }
    }

    const occ: THREE.Vector3[] = [];
    for (const p of players.values()) occ.push(new THREE.Vector3(p.x, p.h + 1.0, p.y), new THREE.Vector3(p.x, p.h + 1.6, p.y));
    this.updateOcclusion(occ);
    this.renderer.render(this.scene, this.camera);

    // Etiket konumları (başın üstü)
    const out = new Map<string, Projected>();
    const v = new THREE.Vector3();
    for (const [id, p] of players) {
      v.set(p.x, 1.95 + p.h, p.y).project(this.camera);
      const sx = ((v.x + 1) / 2) * this.w;
      const sy = ((1 - v.y) / 2) * this.h;
      out.set(id, { x: sx, y: sy, on: v.z < 1 && sx > -40 && sx < this.w + 40 && sy > -40 && sy < this.h + 40 });
    }
    return out;
  }
}
