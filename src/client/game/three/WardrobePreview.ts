import * as THREE from "three";
import { Athlete, loadAthlete } from "./athlete";

/** Gardırop ekranındaki dönen 3B önizleme. */
export class WardrobePreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  private athlete: Athlete | null = null;
  private raf = 0;
  private last = 0;
  private yaw = 0.35;
  private spin = 0.5;
  private drag: { x: number; yaw: number } | null = null;
  private disposed = false;
  private key = "";

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x1a1f2c, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x35b8ff, 1.4);
    rim.position.set(-3, 2.5, -3);
    this.scene.add(rim);
    // Kaide
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.68, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: 0x1c2942, roughness: 0.5, metalness: 0.3 }),
    );
    base.position.y = -0.03;
    base.receiveShadow = true;
    this.scene.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.008, 8, 64), new THREE.MeshBasicMaterial({ color: 0xf5b83d }));
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    this.camera.position.set(0, 1.15, 4.6);
    this.camera.lookAt(0, 0.92, 0);

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
      .then((tpl) => {
        if (this.disposed || this.key !== k) return;
        if (this.athlete) this.scene.remove(this.athlete.root);
        const a = new Athlete(tpl, team === 0 ? 0xff5a4f : 0x35b8ff, team === 0 ? 0xa8302a : 0x1a6fa3, 0xffffff, fit);
        a.setRing(0xffffff, 0);
        a.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
        });
        this.athlete = a;
        this.scene.add(a.root);
      })
      .catch(() => {});
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
    if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (!this.drag) this.yaw += this.spin * dt;
    if (this.athlete) {
      // Athlete.update gövdeyi heading'e göre döndürür: rotation.y = PI/2 - heading
      this.athlete.update({ phase: 0, run: 0, pose: -1, at: 0, now, mood: "run", heading: Math.PI / 2 - this.yaw, h: 0, hv: 0, airborne: false }, 0, dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.renderer.dispose();
  }
}
