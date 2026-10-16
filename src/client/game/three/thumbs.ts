import * as THREE from "three";
import { DEFAULT_FIT, withItem, type Region } from "../../../shared/outfit";
import { Athlete, athleteTemplate, loadAthlete } from "./athlete";
import { studioEnvironment } from "./quality";

/**
 * Gardırop kartlarındaki gerçek önizlemeler: parça, sporcunun üstünde ve takım renginde,
 * kendi bölgesine yakın kadrajla stüdyo ışığında çizilir. Diğer bölgeler varsayılan kalır
 * (önbellek kararlı olsun). Ayrı, küçük bir WebGL tuvali kullanır; sırayla, kare başına bir tane üretir.
 */

const SIZE = 320;
const cache = new Map<string, string>();
type Job = { key: string; sex: "f" | "m"; team: 0 | 1; region: Region; item: number; resolve: (url: string) => void };
let queue: Job[] = [];
let running = false;
let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;

function setup() {
  if (ctx) return ctx;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xeef3ff, 0x1a1f2c, 0.5));
  const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
  key.position.set(2, 3.5, 3.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 1.8);
  rim.position.set(-3, 2.5, -2.5);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  ctx = { renderer, scene, camera };
  return ctx;
}

/** Bölgeye göre kadraj: hedef yükseklik ve uzaklık boyun oranı; kamera hafif yukarıdan. */
function frame(camera: THREE.PerspectiveCamera, region: Region, h: number) {
  // [hedef yükseklik / boy, uzaklık / boy, kamera yükselmesi / boy]; görünen yükseklik ≈ 0,5 × uzaklık (28°)
  const f: Record<Region, [number, number, number]> = {
    body: [0.52, 2.3, 0.1],
    top: [0.68, 0.98, 0.05],
    bottom: [0.31, 1.3, 0.04],
    shoes: [0.05, 0.5, 0.1],
    hair: [0.935, 0.4, 0.03],
    head: [0.94, 0.44, 0.03],
    acc: [0.7, 0.98, 0.05],
  };
  const [ty, d, up] = f[region];
  const y = ty * h;
  camera.position.set(0, y + up * h, d * h);
  camera.lookAt(0, y, 0);
  camera.updateProjectionMatrix();
}

function fitFor(sex: "f" | "m", region: Region, item: number) {
  let fit = withItem(DEFAULT_FIT, "body", sex === "m" ? 1 : 0);
  fit = withItem(fit, region, item);
  return fit;
}

async function pump() {
  if (running) return;
  running = true;
  try {
    await loadAthlete();
    while (queue.length) {
      const job = queue.shift()!;
      const hit = cache.get(job.key);
      if (hit) {
        job.resolve(hit);
        continue;
      }
      const { renderer, scene, camera } = setup();
      const shirt = job.team === 0 ? 0xff3b2f : 0x2f6bff;
      const shorts = job.team === 0 ? 0xb0201a : 0x173fb0;
      const a = new Athlete(null, shirt, shorts, 0xffffff, fitFor(job.sex, job.region, job.item));
      a.setRing(0xffffff, 0);
      // Ayakkabıda yandan, başta ve üstte dörtte üç açıdan bak
      const yaw = job.region === "shoes" ? 1.4 : job.region === "hair" || job.region === "head" ? 0.5 : 0.32;
      a.update({ phase: 0, run: 0, pose: -1, at: 0, now: 0, mood: "run", heading: Math.PI / 2 - yaw, h: 0, hv: 0, airborne: false }, 0, 0.0001);
      scene.add(a.root);
      const h = athleteTemplate(job.sex)?.headTop ?? 1.7;
      frame(camera, job.region, h);
      // Gölgelendiriciyi arka planda derle (ilk kez görülen desen kartlar arasında takılma yapmasın)
      await renderer.compileAsync(a.root, camera, scene).catch(() => undefined);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/webp", 0.86);
      scene.remove(a.root);
      a.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mt.dispose();
        // Geometri şablonla paylaşılıyor; yalnızca aksesuarlarınki bu sporcuya ait
        if (!(m as THREE.SkinnedMesh).isSkinnedMesh) m.geometry.dispose();
      });
      cache.set(job.key, url);
      job.resolve(url);
      // Arayüz akıcı kalsın: her önizlemeden sonra bir kare bekle
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  } finally {
    running = false;
  }
}

export function thumbKey(sex: "f" | "m", team: 0 | 1, region: Region, item: number) {
  return `${sex}${team}${region}${item}`;
}

export function cachedThumb(sex: "f" | "m", team: 0 | 1, region: Region, item: number): string | undefined {
  return cache.get(thumbKey(sex, team, region, item));
}

/** Önizleme iste; önbellekteyse hemen döner. Yeni istekler sıranın başına geçer (açık sekme önce). */
export function requestThumb(sex: "f" | "m", team: 0 | 1, region: Region, item: number): Promise<string> {
  const key = thumbKey(sex, team, region, item);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    queue = queue.filter((j) => j.key !== key);
    queue.unshift({ key, sex, team, region, item, resolve });
    void pump();
  });
}

/** Gardıroptan çıkınca sırayı boşalt ve WebGL tuvalini bırak (önbellekteki resimler kalır). */
export function releaseThumbs() {
  queue = [];
  if (ctx && !running) {
    ctx.scene.environment?.dispose();
    ctx.renderer.dispose();
    ctx.renderer.forceContextLoss();
    ctx = null;
  }
}
