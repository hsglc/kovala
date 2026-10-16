import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";

/**
 * Ortak görüntü hattı (three.js + pmndrs/postprocessing + N8AO):
 *  - HDR (HalfFloat) ara tampon, ACES ton eşleme, sRGB çıkış
 *  - N8AO ortam kapatması (temas gölgeleri), SMAA kenar yumuşatma, hafif bloom
 *  - Ortam haritası (PMREM): stüdyo (RoomEnvironment) ya da mekâna göre gök/zemin degradesi
 *  - Uyarlanır kalite: kare süresi uzarsa önce AO+bloom, sonra çözünürlük düşer
 * Kademe: 2 = tam, 1 = AO'suz, 0 = son işlem yok (doğrudan çizim, donanım AA).
 */

class ExposureEffect extends Effect {
  constructor() {
    super("Exposure", "uniform float exposure;\nvoid mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = vec4(inputColor.rgb * exposure, inputColor.a); }", {
      uniforms: new Map([["exposure", new THREE.Uniform(1)]]),
    });
  }
  set value(v: number) {
    this.uniforms.get("exposure")!.value = v;
  }
}

const TIER_KEY = "evade.gfx";
function savedTier(kind: string): number | null {
  try {
    const v = localStorage.getItem(`${TIER_KEY}.${kind}`);
    return v === null ? null : Math.max(0, Math.min(2, +v));
  } catch {
    return null;
  }
}
function saveTier(kind: string, t: number) {
  try {
    localStorage.setItem(`${TIER_KEY}.${kind}`, String(t));
  } catch {
    /* gizli sekme vb. */
  }
}

export interface PipelineOpts {
  kind: "game" | "wardrobe";
  alpha?: boolean;
  maxDpr: number;
  /** N8AO dünya birimi yarıçapı (m) */
  aoRadius: number;
  aoIntensity: number;
}

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  /** Tuvali şu an kullanan sahne (ön ısıtma, gerçek maç gelince çekilir) */
  owner: unknown = null;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private ao: N8AOPostPass | null = null;
  private fxFull: EffectPass | null = null;
  private fxLite: EffectPass | null = null;
  private exposureFx = new ExposureEffect();
  private exposureLite = new ExposureEffect();
  private bloom: BloomEffect | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private tier: number;
  private dprCap: number;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private exposure = 1;
  // Uyarlanır kalite ölçümü
  private window: number[] = [];
  private lastT = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private opts: PipelineOpts,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: !!opts.alpha,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.dprCap = opts.maxDpr;
    const saved = savedTier(opts.kind);
    this.tier = saved ?? 2;
    if (this.tier === 0) this.dprCap = Math.min(this.dprCap, 1.5);
    this.applyTier();
  }

  /** Sahne ve kamera bağla (son işlem geçişleri bunlara göre kurulur). */
  attach(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.rebuild();
  }

  setExposure(v: number) {
    this.exposure = v;
    this.exposureFx.value = v;
    this.exposureLite.value = v;
    this.renderer.toneMappingExposure = v;
  }

  setSize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = Math.min(dpr || 1, this.dprCap);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.composer?.setSize(this.w, this.h, false);
  }

  get pixelRatio() {
    return this.dpr;
  }

  private applyTier() {
    if (this.tier === 0) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this.exposure;
    } else {
      // Ton eşleme son işlemde yapılır
      this.renderer.toneMapping = THREE.NoToneMapping;
    }
  }

  private rebuild() {
    this.composer?.dispose();
    this.composer = null;
    this.ao = null;
    if (this.tier === 0 || !this.scene || !this.camera) return;
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0, stencilBuffer: false });
    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);
    const tone = () => new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const smaa = () => new SMAAEffect({ preset: this.opts.kind === "wardrobe" ? SMAAPreset.ULTRA : SMAAPreset.HIGH });
    if (this.tier >= 2) {
      const ao = new N8AOPostPass(this.scene, this.camera, this.w, this.h);
      ao.configuration.aoRadius = this.opts.aoRadius;
      ao.configuration.distanceFalloff = this.opts.aoRadius * 0.6;
      ao.configuration.intensity = this.opts.aoIntensity;
      ao.configuration.halfRes = this.opts.kind === "game";
      ao.configuration.gammaCorrection = false;
      ao.setQualityMode(this.opts.kind === "wardrobe" ? "Medium" : "Performance");
      composer.addPass(ao);
      this.ao = ao;
      this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.92, luminanceSmoothing: 0.2, intensity: 0.55, radius: 0.6 });
      this.fxFull = new EffectPass(this.camera, this.exposureFx, this.bloom, tone(), smaa());
      composer.addPass(this.fxFull);
    } else {
      this.fxLite = new EffectPass(this.camera, this.exposureLite, tone(), smaa());
      composer.addPass(this.fxLite);
    }
    composer.setSize(this.w, this.h, false);
    this.composer = composer;
  }

  /** Kare süresini sürekli izler; yavaşsa kademeyi düşürür (oturum içinde geri yükseltmez — titreşim olmasın). */
  private adapt(now: number) {
    // Yavaş kare: hem 26 ms'den uzun hem de penceredeki en hızlı karenin 1,45 katından uzun.
    // Böylece pil tasarrufunda sabit 30 FPS'e kilitli telefon "zorlanıyor" sayılmaz; yalnızca takılma sayılır.
    if (this.lastT) {
      const dt = now - this.lastT;
      if (dt < 250) {
        this.window.push(dt);
      }
    }
    this.lastT = now;
    if (this.window.length < 90) return;
    let best = Infinity;
    for (const d of this.window) best = Math.min(best, d);
    const lim = Math.max(26, best * 1.45);
    let slow = 0;
    for (const d of this.window) if (d > lim) slow++;
    const ratio = slow / this.window.length;
    this.window.length = 0;
    if (ratio < 0.4) return;
    if (this.tier === 2) {
      this.tier = 1;
      this.applyTier();
      this.rebuild();
    } else if (this.dprCap > 1.25) {
      this.dprCap = Math.max(1.25, this.dprCap - 0.5);
      this.setSize(this.w, this.h, window.devicePixelRatio || 1);
    } else if (this.tier === 1) {
      this.tier = 0;
      this.applyTier();
      this.rebuild();
    }
    saveTier(this.opts.kind, this.tier);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.adapt(performance.now());
    if (this.composer && this.scene === scene && this.camera === camera) this.composer.render();
    else this.renderer.render(scene, camera);
  }

  dispose() {
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

/* ---------- Ortam haritaları ---------- */

/** Stüdyo ortamı (yumuşak kutu ışıklar) — gardırop için. */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return tex;
}

/**
 * Mekâna uygun ortam: üstte gök, altta zemin rengi, güneş yönünde parlak bir disk.
 * Karakter ve metal yüzeyler sahneyle tutarlı yansıma ve dolgu ışığı alır.
 */
export function skyEnvironment(renderer: THREE.WebGLRenderer, sky: number, ground: number, sunDir: THREE.Vector3, sunColor: number, sunPower = 18): THREE.Texture {
  const sc = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSky: { value: new THREE.Color(sky) },
      uGround: { value: new THREE.Color(ground) },
      uSun: { value: sunDir.clone().normalize() },
      uSunCol: { value: new THREE.Color(sunColor).multiplyScalar(sunPower) },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uSunCol;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 horizon = mix(uGround, uSky, 0.55) * 1.15;
        vec3 c = h > 0.0 ? mix(horizon, uSky, smoothstep(0.0, 0.6, h)) : mix(horizon, uGround * 0.6, smoothstep(0.0, 0.35, -h));
        float s = max(0.0, dot(d, uSun));
        c += uSunCol * (pow(s, 600.0) + 0.04 * pow(s, 12.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0).texture;
  pm.dispose();
  mat.dispose();
  return tex;
}

/* ---------- Kalıcı oyun hattı ----------
 * Her maçta yeni WebGL bağlamı açmak tüm gölgelendiricileri yeniden derletiyordu (telefonda saniyeler).
 * Oyun tuvali ve bağlamı bir kez kurulur, maçlar arasında yeniden kullanılır.
 */
let shared: Pipeline | null = null;
export function gamePipeline(): Pipeline {
  if (!shared) {
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    shared = new Pipeline(canvas, { kind: "game", maxDpr: 2, aoRadius: 1.1, aoIntensity: 2.6 });
  }
  return shared;
}
