import * as THREE from "three";
import { QUAD_SIZE } from "../../../shared/constants";

/**
 * Hedef-grubu (target group) kamerası. Uygulanan ilkeler:
 * 1. Yön sabit: joystick ekran-göreceli olduğu için kamera asla dönmez (yukarı = sahada kuzey).
 * 2. Kadraj: kendi karakterin, rakip (makul mesafedeyse) ve gidiş yönündeki boşluk (look-ahead)
 *    birlikte "güvenli dikdörtgen"e sığdırılır; HUD (üst) ve tuşlar (alt) bu dikdörtgenin dışında.
 * 3. Asimetrik yumuşatma: kadraj genişlerken hızlı (oyuncu kaçmasın), daralırken yavaş (titreme olmasın).
 * 4. Ölü bölge: merkezdeki küçük kıpırtılar kamerayı oynatmaz.
 * 5. Eğim ~56°: engellerin arkası görünür kalır, yükseklik (tırmanma/zıplama) okunur.
 */
export interface FrameTarget {
  me: { x: number; y: number; h: number; vx: number; vy: number } | null;
  other: { x: number; y: number; h: number } | null;
  /** chase dışı (geri sayım, sonuç): ikisini de rahat göster */
  wide: boolean;
}

const PITCH = THREE.MathUtils.degToRad(66);
const MIN_DIST = 9.5;
const MAX_DIST = 60;
/** Rakip bu mesafeden uzaksa kadraja zorlanmaz (kenar oku gösterilir). */
const MAX_PAIR = 10.5;

export class CameraRig {
  center = new THREE.Vector3(6, 0, 6);
  dist = 14;
  private init = false;
  private fitKey = "";
  private tmp = new THREE.Vector3();
  private probe = new THREE.PerspectiveCamera();

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Güvenli kadraj (NDC): HUD üstte, tuşlar ve joystick altta. */
  private safe(portrait: boolean) {
    return portrait ? { x: 0.82, top: 0.62, bottom: -0.5 } : { x: 0.7, top: 0.64, bottom: -0.62 };
  }

  private place(cam: THREE.PerspectiveCamera, center: THREE.Vector3, dist: number) {
    cam.position.set(center.x, center.y + Math.sin(PITCH) * dist, center.z + Math.cos(PITCH) * dist);
    cam.lookAt(center);
    cam.updateMatrixWorld();
  }

  private fits(points: THREE.Vector3[], center: THREE.Vector3, dist: number, portrait: boolean): boolean {
    const p = this.probe;
    p.fov = this.camera.fov;
    p.aspect = this.camera.aspect;
    p.near = this.camera.near;
    p.far = this.camera.far;
    p.updateProjectionMatrix();
    this.place(p, center, dist);
    const s = this.safe(portrait);
    for (const pt of points) {
      this.tmp.copy(pt).project(p);
      if (Math.abs(this.tmp.x) > s.x || this.tmp.y > s.top || this.tmp.y < s.bottom) return false;
    }
    return true;
  }

  /**
   * Sabit yayın kamerası: maç boyunca tüm Quad'ı (engel tepeleri dahil) yukarıdan gösterir.
   * Takip ve zoom yok; sadece ekran boyutu değişince yeniden kadrajlanır.
   */
  update(_t: FrameTarget, _dtMs: number, portrait: boolean) {
    const fov = portrait ? 52 : 42;
    const key = `${portrait}:${this.camera.aspect.toFixed(3)}`;
    if (this.init && key === this.fitKey) {
      this.place(this.camera, this.center, this.dist);
      return;
    }
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const m = 0.4;
    const pts: THREE.Vector3[] = [];
    for (const [x, z] of [
      [-m, -m],
      [QUAD_SIZE + m, -m],
      [-m, QUAD_SIZE + m],
      [QUAD_SIZE + m, QUAD_SIZE + m],
    ]) {
      pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2.0, z));
    }
    const target = new THREE.Vector3(QUAD_SIZE / 2, 0, QUAD_SIZE / 2 + (portrait ? 0.4 : 0.2));
    let lo = MIN_DIST;
    let hi = 60;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (this.fits(pts, target, mid, portrait)) hi = mid;
      else lo = mid;
    }
    this.center.copy(target);
    this.dist = hi;
    this.fitKey = key;
    this.init = true;
    this.place(this.camera, this.center, this.dist);
  }

  /** Yeni chase başında anında yerine otursun. */
  snap() {
    // Sabit kamera: chase başında değişiklik yok
  }
}
