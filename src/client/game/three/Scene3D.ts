import * as THREE from "three";
import { BAR_H, BOX_H, PLAYER_RADIUS, QUAD_SIZE, SPEED_EVADER, WALL_H } from "../../../shared/constants";
import type { PublicState } from "../../../shared/engine";
import type { Obstacle, QuadLayout } from "../../../shared/maps";
import { ACT_DIVE, ACT_KICK, ACT_JUKE, TAG_DISTANCE, chaserReach, groundAt, type PlayerState } from "../../../shared/sim";
import { TEAM_COLORS, TEAM_DARK, memberTeam } from "../../lib/text";
import { Figure3D, lookFor, type Pose } from "./figure3d";

/**
 * three.js sahnesi. Saha düzlemi: x → X, y → Z, yukarı → Y.
 * Kamera karakterin arkasından/üstünden eğik bakar; ekranda yukarı = sahada -y.
 */



interface FigEntry {
  fig: Figure3D;
  phase: number;
  run: number;
  lx: number;
  ly: number;
  heading: number;
  last: number;
  team: number;
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
  private reachRing: THREE.Mesh;
  private edgeGlow: THREE.Mesh[] = [];
  private w = 1;
  private h = 1;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3(6, 0, 6);
  private initialized = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x0a1020);
    this.scene.fog = new THREE.Fog(0x0a1020, 22, 48);

    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x2a2214, 1.7);
    this.scene.add(hemi);
    const fill = new THREE.DirectionalLight(0x8fb6ff, 0.9);
    fill.position.set(10, 6, 14);
    this.scene.add(fill);
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
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.dispose();
  }

  // ---------- Statik sahne ----------

  private buildGround() {
    // Saha dışı zemin (koyu beton)
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x0d1424, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(QUAD_SIZE / 2, -0.01, QUAD_SIZE / 2);
    outer.receiveShadow = true;
    this.scene.add(outer);

    // Saha zemini: mat, ince ızgara dokusu (canvas texture)
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = "#26395a";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(170,200,240,0.07)";
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 512 / QUAD_SIZE) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
    // merkez işareti
    g.strokeStyle = "rgba(232,238,247,0.22)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(256, 256, 60, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(QUAD_SIZE, QUAD_SIZE),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(QUAD_SIZE / 2, 0, QUAD_SIZE / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);

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
        new THREE.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.014;
      this.scene.add(m);
      this.edgeGlow.push(m);
    }

    // Tribün hissi: sahanın etrafında alçak bariyer + ışık direkleri
    const rail = new THREE.MeshStandardMaterial({ color: 0x27354f, roughness: 0.6, metalness: 0.3 });
    const off = 1.6;
    for (const [x, z, w, d] of [
      [QUAD_SIZE / 2, -off, QUAD_SIZE + off * 2, 0.15],
      [QUAD_SIZE / 2, QUAD_SIZE + off, QUAD_SIZE + off * 2, 0.15],
      [-off, QUAD_SIZE / 2, 0.15, QUAD_SIZE + off * 2],
      [QUAD_SIZE + off, QUAD_SIZE / 2, 0.15, QUAD_SIZE + off * 2],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), rail);
      m.position.set(x, 0.45, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  private buildLayout(layout: QuadLayout) {
    this.world.clear();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x7f93b8, roughness: 0.5, metalness: 0.15 });
    const wallPanel = new THREE.MeshStandardMaterial({ color: 0x55688c, roughness: 0.65 });
    const wallTop = new THREE.MeshStandardMaterial({ color: 0xf5b83d, roughness: 0.5 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xf2b23a, roughness: 0.45 });
    const boxEdge = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.6, metalness: 0.4 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.3, metalness: 0.8 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2b3345, roughness: 0.5, metalness: 0.5 });

    for (const o of layout.obstacles) {
      const cx = o.x + o.w / 2;
      const cz = o.y + o.h / 2;
      const grp = new THREE.Group();
      if (o.kind === "wall") {
        // İskele duvar: dolgu panel + köşe direkleri + üstte sarı tutamak
        const core = new THREE.Mesh(new THREE.BoxGeometry(o.w, WALL_H, o.h), wallPanel);
        core.position.y = WALL_H / 2;
        core.castShadow = core.receiveShadow = true;
        grp.add(core);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.06, 0.12, o.h + 0.06), wallMat);
        frame.position.y = WALL_H - 0.06;
        frame.castShadow = true;
        grp.add(frame);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1, 0.05, o.h + 0.1), wallTop);
        grip.position.y = WALL_H - 0.01;
        grp.add(grip);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.02, 0.06, o.h - 0.02), wallPanel);
        cap.position.y = WALL_H + 0.02;
        cap.receiveShadow = true;
        grp.add(cap);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, WALL_H, 10), wallMat);
            post.position.set((sx * o.w) / 2, WALL_H / 2, (sz * o.h) / 2);
            post.castShadow = true;
            grp.add(post);
          }
        }
        // yatay kuşaklar
        for (const yy of [0.6, 1.25]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.04, 0.06, o.h + 0.04), wallMat);
          band.position.y = yy;
          grp.add(band);
        }
      } else if (o.kind === "box") {
        // Sünger kutu: yuvarlak kenarlı sarı blok, koyu kenar çerçevesi
        const core = new THREE.Mesh(new THREE.BoxGeometry(o.w, BOX_H, o.h), boxMat);
        core.position.y = BOX_H / 2;
        core.castShadow = core.receiveShadow = true;
        grp.add(core);
        const band = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.03, 0.08, o.h + 0.03), boxEdge);
        band.position.y = BOX_H * 0.5;
        grp.add(band);
        const stripe = new THREE.Mesh(
          new THREE.PlaneGeometry(o.w * 0.9, o.h * 0.9),
          new THREE.MeshStandardMaterial({ color: 0xc98a1d, roughness: 0.6 }),
        );
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.y = BOX_H + 0.002;
        grp.add(stripe);
      } else {
        // Korkuluk: iki direk + parlak çelik boru (altından kayılır)
        const horizontal = o.w >= o.h;
        const len = horizontal ? o.w : o.h;
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 12), barMat);
        pipe.rotation.z = horizontal ? Math.PI / 2 : 0;
        pipe.rotation.x = horizontal ? 0 : Math.PI / 2;
        pipe.position.y = BAR_H;
        pipe.castShadow = true;
        grp.add(pipe);
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, BAR_H, 10), postMat);
          post.position.set(horizontal ? (s * len) / 2 : 0, BAR_H / 2, horizontal ? 0 : (s * len) / 2);
          post.castShadow = true;
          grp.add(post);
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 12), postMat);
          foot.position.set(post.position.x, 0.03, post.position.z);
          grp.add(foot);
        }
        // zeminde "altından geç" işareti
        const mark = new THREE.Mesh(
          new THREE.PlaneGeometry(o.w, o.h),
          new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.12, depthWrite: false }),
        );
        mark.rotation.x = -Math.PI / 2;
        mark.position.y = 0.013;
        grp.add(mark);
      }
      grp.position.set(cx, 0, cz);
      this.world.add(grp);
    }
  }

  // ---------- Çerçeve ----------

  private figureFor(id: string, team: number, selfId: string, now: number, p: PlayerState): FigEntry {
    let e = this.figures.get(id);
    if (!e || e.team !== team) {
      if (e) this.scene.remove(e.fig.root);
      const look = lookFor(id, TEAM_COLORS[team as 0 | 1] === "#ff5a4f" ? 0xff5a4f : 0x35b8ff, team === 0 ? 0xa8302a : 0x1a6fa3);
      const fig = new Figure3D(look, id === selfId ? 0xffffff : parseInt(TEAM_DARK[team as 0 | 1].slice(1), 16));
      e = { fig, phase: 0, run: 0, lx: p.x, ly: p.y, heading: Math.atan2(p.fy, p.fx), last: now, team };
      this.figures.set(id, e);
      this.scene.add(fig.root);
    }
    return e;
  }

  render(
    layout: QuadLayout,
    state: PublicState | null,
    players: Map<string, PlayerState>,
    selfId: string,
    cam: { x: number; y: number; zoom: number },
    now: number,
  ): Map<string, Projected> {
    if (layout.id !== this.layoutId) {
      this.layoutId = layout.id;
      this.buildLayout(layout);
    }
    // Kamera: hedefin arkasından (ekranın altından) yukarı bakar.
    const z = cam.zoom;
    const target = new THREE.Vector3(cam.x, 0.6, cam.y - 1.2 + z * 1.4);
    const desired = new THREE.Vector3(cam.x, 8.6 + z * 9.5, cam.y + 7.0 + z * 6.5);
    if (!this.initialized) {
      this.camPos.copy(desired);
      this.camLook.copy(target);
      this.initialized = true;
    } else {
      this.camPos.lerp(desired, 0.25);
      this.camLook.lerp(target, 0.25);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Güneş kamerayla gelir (gölge alanı dar ve keskin kalsın)
    this.sun.position.set(cam.x - 5, 11, cam.y - 4);
    this.sun.target.position.set(cam.x, 0, cam.y);
    const sc = this.sun.shadow.camera;
    const sr = 9 + z * 6;
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
      const e = this.figureFor(id, team, selfId, now, p);
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
      e.fig.root.position.set(p.x, 0, p.y);
      const gnd = groundAt(p.x, p.y, layout);
      const airborne = p.ak === 0 && p.h > gnd + 0.05;
      e.fig.update({
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
      });
      if (id === chaserId && phase === "chase") {
        const rr = TAG_DISTANCE - PLAYER_RADIUS + chaserReach(p);
        this.reachRing.visible = true;
        this.reachRing.position.set(p.x, 0.015, p.y);
        this.reachRing.scale.setScalar(rr / 0.53);
      }
    }
    for (const [id, e] of this.figures) {
      if (!seen.has(id)) {
        this.scene.remove(e.fig.root);
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
