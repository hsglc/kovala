import * as THREE from "three";
import { Athlete, loadAthlete } from "./athlete";
import { Pipeline, studioEnvironment } from "./quality";

/** Gardırop ekranındaki dönen 3B önizleme. */
export class WardrobePreview {
  private renderer: THREE.WebGLRenderer;
  private pipe: Pipeline;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  private athlete: Athlete | null = null;
  private raf = 0;
  private last = 0;
  private yaw = 0.35;
  private spin = 0.35;
  private drag: { x: number; yaw: number } | null = null;
  private disposed = false;
  private key = "";
  private pose: "idle" | "run" | "cheer" = "idle";

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { stage?: boolean } = {},
  ) {
    this.pipe = new Pipeline(canvas, { kind: "wardrobe", alpha: true, maxDpr: 3, aoRadius: 0.35, aoIntensity: 2.2 });
    this.renderer = this.pipe.renderer;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Stüdyo ortam ışığı: yumuşak dolgu + kumaş/deri üzerinde gerçekçi yansıma
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.55;
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x1a1f2c, 0.45));
    const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
    key.position.set(2.5, 4, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    key.shadow.radius = 4;
    const sc = key.shadow.camera;
    sc.left = -1.2;
    sc.right = 1.2;
    sc.top = 2.2;
    sc.bottom = -0.4;
    sc.near = 1;
    sc.far = 10;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6f9bff, 2.2);
    rim.position.set(-3, 2.5, -3);
    this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff7a66, 1.2);
    rim2.position.set(3, 1.8, -2.5);
    this.scene.add(rim2);
    // Kaide
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.68, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: 0x1c2942, roughness: 0.5, metalness: 0.3 }),
    );
    base.position.y = -0.03;
    base.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.008, 8, 64), new THREE.MeshBasicMaterial({ color: 0xf5b83d }));
    ring.rotation.x = Math.PI / 2;
    if (opts.stage !== false) {
      this.scene.add(base);
      this.scene.add(ring);
    } else {
      // Kaidesiz: yalnızca yere düşen yumuşak gölge
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShadowMaterial({ opacity: 0.28 }));
      sh.rotation.x = -Math.PI / 2;
      sh.receiveShadow = true;
      this.scene.add(sh);
    }
    this.camera.position.set(0, 1.05, 5.0);
    this.camera.lookAt(0, 0.9, 0);
    this.pipe.attach(this.scene, this.camera);

    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    this.loop(performance.now());
  }

  set(team: 0 | 1, fit: string) {
    const k = team + fit;
    if (k === this.key) return;
    this.key = k;
    loadAthlete()
      .then(() => {
        if (this.disposed || this.key !== k) return;
        if (this.athlete) this.scene.remove(this.athlete.root);
        const a = new Athlete(null, team === 0 ? 0xff3b2f : 0x2f6bff, team === 0 ? 0xb0201a : 0x173fb0, 0xffffff, fit);
        a.setRing(0xffffff, 0);
        a.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
        });
        this.athlete = a;
        this.scene.add(a.root);
      })
      .catch(() => {});
  }

  setPose(p: "idle" | "run" | "cheer") {
    this.pose = p;
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, yaw: this.yaw };
  };
  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012;
  };
  private onUp = () => {
    this.drag = null;
  };

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const pr = this.pipe.pixelRatio;
    if (w && h && (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr))) {
      this.pipe.setSize(w, h, window.devicePixelRatio || 1);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (!this.drag) this.yaw += this.spin * dt;
    if (this.athlete) {
      // Athlete.update gövdeyi heading'e göre döndürür: rotation.y = PI/2 - heading
      this.athlete.update(
        { phase: 0, run: 0, pose: -1, at: 0, now, mood: this.pose === "cheer" ? "cheer" : "run", heading: Math.PI / 2 - this.yaw, h: 0, hv: 0, airborne: false },
        this.pose === "run" ? 5 : 0,
        dt,
      );
    }
    this.pipe.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.scene.environment?.dispose();
    this.pipe.dispose();
  }
}
