import * as THREE from "three";
import { QUAD_H, QUAD_W } from "../../../shared/constants";

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
    // Joystick ve tuşlar sahanın üstünde durabilir: yalnızca üstteki skor tabelası için pay
    return portrait ? { x: 0.92, top: 0.74, bottom: -0.92 } : { x: 0.94, top: 0.66, bottom: -0.94 };
  }

  /**
   * Kameranın yatay dönüşü (radyan). 0: kuzey yukarı. Her chase başında iki oyuncuyu ayıran çizgi
   * ekranın uzun kenarına düşecek şekilde 0 ya da 90° seçilir; joystick de buna göre döner.
   */
  yaw = 0;

  private place(cam: THREE.PerspectiveCamera, center: THREE.Vector3, dist: number) {
    const h = Math.cos(PITCH) * dist;
    cam.position.set(center.x + Math.sin(this.yaw) * h, center.y + Math.sin(PITCH) * dist, center.z + Math.cos(this.yaw) * h);
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

  private wideCenter = new THREE.Vector3(QUAD_W / 2, 0, QUAD_H / 2);
  private wideDist = 30;
  private goal = new THREE.Vector3();
  private pts: THREE.Vector3[] = Array.from({ length: 12 }, () => new THREE.Vector3());

  /** Tüm Quad'ın (engel tepeleri dahil) güvenli kadraja sığdığı en yakın mesafe. */
  private fitWide(portrait: boolean) {
    const m = 0.4;
    const pts: THREE.Vector3[] = [];
    for (const [x, z] of [
      [-m, -m],
      [QUAD_W + m, -m],
      [-m, QUAD_H + m],
      [QUAD_W + m, QUAD_H + m],
    ]) {
      pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2.0, z));
    }
    this.wideCenter.set(QUAD_W / 2, 0, QUAD_H / 2 + (portrait ? 0.4 : 0.2));
    this.wideDist = this.search(pts, this.wideCenter, portrait, MIN_DIST, MAX_DIST);
  }

  private search(pts: THREE.Vector3[], center: THREE.Vector3, portrait: boolean, lo: number, hi: number) {
    if (this.fits(pts, center, lo, portrait)) return lo;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (this.fits(pts, center, mid, portrait)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /**
   * Yayın kamerası. Geri sayım ve sonuçta tüm Quad görünür.
   * Chase'te kamera oyunu takip eder: kendi karakterin, koştuğun yön (önden bakış) ve
   * yakındaysa rakip kadrajda kalır; en az ~10 m'lik bir alan görünür, saha ekranı doldurur.
   * Yön asla dönmez (joystick ekrana göre). Genişlerken hızlı, daralırken yavaş yumuşatma.
   */
  update(t: FrameTarget, dtMs: number, portrait: boolean) {
    const fov = portrait ? 52 : 42;
    const key = `${portrait}:${this.camera.aspect.toFixed(3)}`;
    if (key !== this.fitKey) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.fitWide(portrait);
      this.fitKey = key;
    }
    let goalDist: number;
    // Saha yatay dikdörtgen: uzun kenarı her zaman ekranın uzun kenarına (dikey telefonda 90° döner)
    const yaw = portrait ? Math.PI / 2 : 0;
    if (yaw !== this.yaw) {
      this.yaw = yaw;
      this.fitWide(portrait);
    }
    if (!t.me) {
      // İzleyici: tüm saha
      this.goal.copy(this.wideCenter);
      goalDist = this.wideDist;
    } else {
      const me = t.me;
      const P = this.pts;
      let n = 0;
      // En dar kadrajın yarı genişliği (m): yatayda ekran geniş olduğu için daha yakın
      const half = t.wide ? (portrait ? 7 : 10) : portrait ? 5.5 : 8;
      // Ekran eksenleri zeminde: sağ r, aşağı d (yaw'a göre)
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const ddx = Math.sin(this.yaw);
      const ddz = Math.cos(this.yaw);
      P[n++].set(me.x, 0, me.y);
      P[n++].set(me.x, me.h + 2.0, me.y);
      if (!t.wide) {
        P[n++].set(me.x + me.vx * 0.45, 0, me.y + me.vy * 0.45);
        P[n++].set(me.x - ddx * 1.8, 0, me.y - ddz * 1.8);
        P[n++].set(me.x + ddx * 1.8, 0, me.y + ddz * 1.8);
      }
      const o = t.other;
      // İki oyuncu baştan sona birbirini görür: rakip her zaman kadrajda
      if (o) {
        P[n++].set(o.x, 0, o.y);
        P[n++].set(o.x, o.h + 2.0, o.y);
      }
      let u0 = Infinity;
      let u1 = -Infinity;
      let v0 = Infinity;
      let v1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const u = P[i].x * rx + P[i].z * rz;
        const v = P[i].x * ddx + P[i].z * ddz;
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
      // Sahanın ekran eksenlerindeki aralığı
      let fu0 = Infinity;
      let fu1 = -Infinity;
      let fv0 = Infinity;
      let fv1 = -Infinity;
      for (const [x, z] of [
        [0, 0],
        [QUAD_W, 0],
        [0, QUAD_H],
        [QUAD_W, QUAD_H],
      ]) {
        const u = x * rx + z * rz;
        const v = x * ddx + z * ddz;
        fu0 = Math.min(fu0, u);
        fu1 = Math.max(fu1, u);
        fv0 = Math.min(fv0, v);
        fv1 = Math.max(fv1, v);
      }
      let cv = Math.max(fv0 + 1, Math.min(fv1 - 1, (v0 + v1) / 2));
      const base = n;
      const fit = (cu: number) => {
        const gx = rx * cu + ddx * cv;
        const gz = rz * cu + ddz * cv;
        this.goal.set(gx, 0, gz);
        P[base].set(gx - rx * half, 0, gz - rz * half);
        P[base + 1].set(gx + rx * half, 0, gz + rz * half);
        return Math.min(this.wideDist, this.search(P.slice(0, base + 2), this.goal, portrait, 7, this.wideDist));
      };
      const cu0 = Math.max(fu0 + 1.5, Math.min(fu1 - 1.5, (u0 + u1) / 2));
      goalDist = fit(cu0);
      // Görünen genişlik sahadan darsa merkezi sahanın içine kaydır: kenarda boş zemin değil saha görünsün
      const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * this.safe(portrait).x;
      const vis = goalDist * tanH;
      const mid = (fu0 + fu1) / 2;
      const cu = vis * 2 >= fu1 - fu0 + 1 ? mid : Math.max(fu0 + vis - 0.5, Math.min(fu1 - vis + 0.5, cu0));
      // Dikeyde de: görünen derinlik sahadan darsa merkezi içeri çek (saha dışı boş zemin görünmesin)
      const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const visV = (goalDist * tanV) / Math.sin(PITCH) * 0.85;
      const midV = (fv0 + fv1) / 2;
      const cv2 = visV * 2 >= fv1 - fv0 ? midV : Math.max(fv0 + visV, Math.min(fv1 - visV, cv));
      const moved = Math.abs(cu - cu0) > 0.05 || Math.abs(cv2 - cv) > 0.05;
      cv = cv2;
      if (moved) goalDist = fit(cu);
    }
    if (!this.init) {
      this.center.copy(this.goal);
      this.dist = goalDist;
      this.init = true;
    } else {
      const dt = Math.min(100, dtMs);
      this.center.lerp(this.goal, 1 - Math.exp(-dt / 170));
      const k = goalDist > this.dist ? 1 - Math.exp(-dt / 140) : 1 - Math.exp(-dt / 650);
      this.dist += (goalDist - this.dist) * k;
    }
    this.place(this.camera, this.center, this.dist);
  }

  /** Yeni chase başında anında yerine otursun. */
  snap() {
    this.init = false;
  }
}
