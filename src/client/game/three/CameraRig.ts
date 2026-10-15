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

const PITCH = THREE.MathUtils.degToRad(56);
const MIN_DIST = 9.5;
const MAX_DIST = 26;
/** Rakip bu mesafeden uzaksa kadraja zorlanmaz (kenar oku gösterilir). */
const MAX_PAIR = 10.5;

export class CameraRig {
  center = new THREE.Vector3(6, 0, 6);
  dist = 14;
  private init = false;
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

  update(t: FrameTarget, dtMs: number, portrait: boolean) {
    this.camera.fov = portrait ? 52 : 42;
    this.camera.updateProjectionMatrix();

    const pts: THREE.Vector3[] = [];
    let cx = QUAD_SIZE / 2;
    let cz = QUAD_SIZE / 2;
    if (t.me) {
      const look = 0.32; // ~0,3 sn ilerisi
      const lx = t.me.x + t.me.vx * look;
      const lz = t.me.y + t.me.vy * look;
      pts.push(new THREE.Vector3(t.me.x, t.me.h, t.me.y), new THREE.Vector3(t.me.x, t.me.h + 1.9, t.me.y), new THREE.Vector3(lx, 0, lz));
      cx = t.me.x * 0.75 + lx * 0.25;
      cz = t.me.y * 0.75 + lz * 0.25;
      if (t.other) {
        const d = Math.hypot(t.other.x - t.me.x, t.other.y - t.me.y);
        if (d < MAX_PAIR || t.wide) {
          pts.push(new THREE.Vector3(t.other.x, t.other.h, t.other.y), new THREE.Vector3(t.other.x, t.other.h + 1.9, t.other.y));
          // Ağırlık kendi karakterinde; rakip kadrajın içinde kalacak kadar çekilir
          const wgt = t.wide ? 0.5 : 0.38;
          cx = cx * (1 - wgt) + t.other.x * wgt;
          cz = cz * (1 - wgt) + t.other.y * wgt;
        }
      }
    } else if (t.other) {
      pts.push(new THREE.Vector3(t.other.x, t.other.h, t.other.y), new THREE.Vector3(t.other.x, t.other.h + 1.9, t.other.y));
      cx = t.other.x;
      cz = t.other.y;
    } else {
      // Hiç oyuncu yoksa tüm sahayı göster
      for (const [x, z] of [
        [0, 0],
        [QUAD_SIZE, 0],
        [0, QUAD_SIZE],
        [QUAD_SIZE, QUAD_SIZE],
      ])
        pts.push(new THREE.Vector3(x, 0, z));
    }
    // Merkez sahadan fazla taşmasın
    cx = THREE.MathUtils.clamp(cx, 0, QUAD_SIZE);
    cz = THREE.MathUtils.clamp(cz, 0, QUAD_SIZE);
    const target = new THREE.Vector3(cx, 0.4, cz);

    // Gereken en küçük mesafe (ikili arama)
    let lo = MIN_DIST;
    let hi = MAX_DIST;
    if (this.fits(pts, target, lo, portrait)) hi = lo;
    else
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (this.fits(pts, target, mid, portrait)) hi = mid;
        else lo = mid;
      }
    const wantDist = hi;

    if (!this.init) {
      this.center.copy(target);
      this.dist = wantDist;
      this.init = true;
    } else {
      // Ölü bölge (5 cm) + üstel yumuşatma
      const dc = this.tmp.copy(target).sub(this.center);
      if (dc.length() > 0.05) this.center.addScaledVector(dc, 1 - Math.exp(-dtMs / 130));
      const k = wantDist > this.dist ? 110 : 520; // genişle hızlı, daral yavaş
      this.dist += (wantDist - this.dist) * (1 - Math.exp(-dtMs / k));
    }
    this.place(this.camera, this.center, this.dist);
  }

  /** Yeni chase başında anında yerine otursun. */
  snap() {
    this.init = false;
  }
}
