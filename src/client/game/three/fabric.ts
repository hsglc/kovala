/**
 * Gerçekçi kumaş: her desenin bir kumaş türü var (pamuklu süprem, polar, ribana, kalın örgü,
 * file, likra, naylon trikot, denim, deri, kauçuk). Kumaş türü malzemenin pürüzlülüğünü ve
 * "sheen"ini belirler, ayrıca prosedürel bir kabartma (bump) yüksekliği üretir:
 *  - dikişler (yan, omuz, iç bacak), çift iğne etek/paça dikişi
 *  - ribana manşet, bel ve yaka; lastikli bel büzgüsü
 *  - kırışıklıklar: dirsek, diz, bilekte yığılma, koltuk altı ve kasık çekme izleri, etek ucu dalgası
 *  - lif dokusu: örgü sırası, file delikleri, denim çaprazı, melanj iplik
 * Yükseklik metre cinsindendir; ekranda pikselden küçük kalan ayrıntı (fwidth) söndürülür,
 * böylece uzakta titreme (aliasing) olmaz.
 */

export type Fabric = "jersey" | "fleece" | "knit" | "mesh" | "spandex" | "nylon" | "denim" | "leather" | "runner" | "hair" | "rib";

export interface FabricParams {
  roughness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

export const FABRIC_PARAMS: Record<Fabric, FabricParams> = {
  jersey: { roughness: 0.84, sheen: 0.7, sheenRoughness: 0.7, sheenColor: 0x5e5e64 },
  rib: { roughness: 0.86, sheen: 0.7, sheenRoughness: 0.7, sheenColor: 0x5e5e64 },
  fleece: { roughness: 0.95, sheen: 1, sheenRoughness: 0.85, sheenColor: 0x6c6c74 },
  knit: { roughness: 0.97, sheen: 0.9, sheenRoughness: 0.9, sheenColor: 0x76706a },
  mesh: { roughness: 0.66, sheen: 0.45, sheenRoughness: 0.5, sheenColor: 0x5a5a60 },
  spandex: { roughness: 0.42, sheen: 0.4, sheenRoughness: 0.35, sheenColor: 0x50505a },
  nylon: { roughness: 0.55, sheen: 0.35, sheenRoughness: 0.45, sheenColor: 0x4a4a52 },
  denim: { roughness: 0.92, sheen: 0.35, sheenRoughness: 0.8, sheenColor: 0x3a4660 },
  leather: { roughness: 0.42, sheen: 0, sheenRoughness: 0.4, sheenColor: 0x000000, clearcoat: 0.45, clearcoatRoughness: 0.3 },
  runner: { roughness: 0.6, sheen: 0.3, sheenRoughness: 0.5, sheenColor: 0x606068, clearcoat: 0.15, clearcoatRoughness: 0.4 },
  hair: { roughness: 0.78, sheen: 0.45, sheenRoughness: 0.45, sheenColor: 0x6a5040 },
};

/** Desen anahtarı → kumaş */
export const LOOK_FABRIC: Record<string, Fabric> = {
  plain: "jersey",
  jersey: "mesh",
  stripe: "jersey",
  sweat: "fleece",
  varsity: "fleece",
  hoodie: "fleece",
  hood: "fleece",
  camo: "fleece",
  knit: "knit",
  "b-plain": "nylon",
  joggers: "fleece",
  tight: "spandex",
  neon: "spandex",
  bball: "mesh",
  track: "nylon",
  cargo: "jersey",
  denim: "denim",
  sock: "rib",
  under: "spandex",
  "bra-team": "spandex",
  hair: "hair",
  "s-white": "runner",
  "s-neon": "runner",
  "s-gold": "runner",
  "s-retro": "runner",
  "s-court": "leather",
  "s-leather": "leather",
};

/** Uzun alt mı (diz ve bilek kırışığı için) */
const LONG_BOTTOM = new Set(["joggers", "tight", "neon", "track", "cargo", "denim"]);
/** Ribana manşet/bel taşıyan üstler */
const RIB_TOP = new Set(["sweat", "varsity", "hoodie", "camo", "knit"]);
/** Kolsuz/kısa kollu üstler (dirsek kırışığı yok) */
const SHORT_SLEEVE = new Set(["plain", "jersey", "stripe"]);

export const FABRIC_COMMON = /* glsl */ `
uniform vec4 uJ; // omuz x, dirsek x, bilek x, boy
uniform vec4 uL; // kalça y, diz y, bilek y, 0
float fabFade(float cyclesPerM) {
  float w = length(fwidth(vBind));
  return 1.0 - smoothstep(0.18, 0.5, w * cyclesPerM);
}
// Yumuşak kırışık sırtı (0..1): dar tepe, geniş çukur
float softFold(float x) { float s = 0.5 + 0.5 * sin(x * 6.2831853); return s * s * s; }
// Kesik çizgili dikiş: d dikişe uzaklık (m), dash dikiş boyunca koordinat (adım)
float stitchLine(float d, float dash) { return (1.0 - smoothstep(0.0005, 0.0011, abs(d))) * step(0.42, fract(dash)); }
float seamLine(float d, float w) { return 1.0 - smoothstep(0.0, w, abs(d)); }
vec3 fabBump(vec3 surfPos, vec3 surfNorm, float h) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/** Bölge ve desene göre kırışık + dikiş + doku kodu (fabH'yi ve c/rough'u değiştirir). */
export function fabricCode(key: string, role: string, id: string): string {
  const fab = LOOK_FABRIC[key] ?? "jersey";
  let s = `
    float n1 = fitNoise(vBind * 7.0);
    float n2 = fitNoise(vBind * 3.1 + 5.0);
    float hy = vBind.y - uMin.y;       // etek/paça ucundan yükseklik
    float ty = uMax.y - vBind.y;       // üst kenardan uzaklık
    float axm = abs(vBind.x);          // gövde ortasından yana (m)
  `;
  // ---------- Lif dokusu ----------
  switch (fab) {
    case "jersey":
    case "rib":
      s += `
    fabH += 0.00012 * sin((vBind.x + vBind.z) * 6.2831853 * 700.0) * fabFade(700.0);
    c *= 0.97 + 0.06 * fitNoise(vBind * vec3(500.0, 160.0, 500.0)) * fabFade(300.0);`;
      break;
    case "fleece":
      // Polar: yumuşak, hafif tüylü; melanj iplik
      s += `
    fabH += 0.0004 * (fitNoise(vBind * 140.0) - 0.5) * fabFade(140.0);
    c *= 0.94 + 0.12 * fitNoise(vBind * vec3(700.0, 120.0, 700.0)) * fabFade(260.0);`;
      break;
    case "knit": {
      // Kalın örgü: ilmek sütunları
      s += `
    float col = softFold((vBind.x + vBind.z) * 55.0);
    float row = softFold(vBind.y * 80.0 + step(0.5, fract((vBind.x + vBind.z) * 27.5)) * 0.5);
    fabH += 0.0013 * (col * 0.6 + row * 0.4) * fabFade(80.0);
    c *= 0.9 + 0.12 * col * fabFade(55.0);`;
      break;
    }
    case "mesh":
      // File: düzenli delikler (forma, basketbol şortu)
      s += `
    vec2 mq = vec2((vBind.x + vBind.z) * 0.7071, vBind.y) * 230.0;
    mq.x += step(0.5, fract(mq.y * 0.5)) * 0.5;
    float hole = 1.0 - smoothstep(0.16, 0.26, length(fract(mq) - 0.5));
    float mf = fabFade(230.0);
    fabH -= 0.0005 * hole * mf;
    c *= 1.0 - 0.28 * hole * mf;`;
      break;
    case "spandex":
      // Likra: pürüzsüz, sıkıştırma panelleri
      s += `
    fabH += 0.00008 * sin(vBind.y * 6.2831853 * 900.0) * fabFade(900.0);`;
      break;
    case "nylon":
      s += `
    fabH += 0.0001 * sin((vBind.y + vBind.x) * 6.2831853 * 800.0) * fabFade(800.0);`;
      break;
    case "denim":
      // Denim: 3/1 çapraz dokuma; iplik rengi düzensiz
      s += `
    float tw = sin((vBind.y * 2.0 + vBind.x + vBind.z) * 6.2831853 * 380.0);
    fabH += 0.00025 * tw * fabFade(760.0);
    c *= 0.9 + 0.1 * tw * fabFade(760.0) + 0.1 * fitNoise(vBind * vec3(60.0, 700.0, 60.0)) * fabFade(350.0);`;
      break;
    case "hair":
      // Saç telleri: yukarıdan aşağı akan ince çizgiler
      s += `
    vec3 hn2 = normalize(vBindN);
    vec3 hd2 = vec3(0.0, 0.3, -1.0);
    hd2 = normalize(hd2 - hn2 * dot(hd2, hn2) + vec3(0.0, 1e-3, 0.0));
    float hu2 = dot(vBind, normalize(cross(hn2, hd2)));
    float strand = fitNoise(vec3(hu2 * 190.0, dot(vBind, hd2) * 4.0, 7.7));
    fabH += 0.0004 * strand * fabFade(120.0);`;
      break;
    default:
      break;
  }

  // ---------- Üstler ----------
  if (role === "top" && id !== "hood") {
    const ribTop = RIB_TOP.has(key);
    const shortSleeve = SHORT_SLEEVE.has(key);
    s += `
    float torso = 1.0 - smoothstep(uJ.x - 0.01, uJ.x + 0.03, axm);   // gövde
    float sleeve = 1.0 - torso;
    // Etek ucunda dalgalanma ve yatay kırışık
    float hemZ = 1.0 - smoothstep(0.0, 0.2, hy);
    fabH += 0.0045 * torso * hemZ * softFold(vBind.y * 9.0 + n1 * 1.8) * smoothstep(0.3, 0.7, n2);
    // Belde (göğüs altı) gevşek yatay katlar
    float waistZ = (1.0 - smoothstep(0.0, 0.1, abs(hy - 0.17))) * torso;
    fabH += 0.003 * waistZ * softFold(vBind.y * 16.0 + n1 * 1.2) * smoothstep(0.35, 0.65, fitNoise(vBind * 5.0 + 9.0));
    // Koltuk altından göğse çapraz çekme izleri
    float pit = torso * smoothstep(0.22, 0.04, ty) * smoothstep(uJ.x - 0.08, uJ.x - 0.01, axm);
    fabH += 0.0028 * pit * softFold((vBind.y - axm * 0.8) * 20.0 + n1);
    // Yan dikiş (gövdenin yan yüzü) ve omuz dikişi
    float side = torso * seamLine(vBindN.z, 0.05) * step(0.4, abs(vBindN.x));
    float shoulder = torso * seamLine(vBind.z - (uMin.z + uMax.z) * 0.5, 0.006) * smoothstep(0.1, 0.0, ty) * step(0.6, vBindN.y);
    fabH -= 0.0011 * (side + shoulder);
    c *= 1.0 - 0.1 * (side + shoulder);
    // Kol takma dikişi (omuz ucunda halka)
    float armSeam = seamLine(axm - uJ.x - 0.012, 0.004) * step(0.0, vBind.y - uJ.w * 0.68);
    fabH -= 0.0009 * armSeam;
    c *= 1.0 - 0.08 * armSeam;
    // Çift iğne etek dikişi
    float dash = (vBind.x + vBind.z) * 240.0;
    float hemSt = torso * (stitchLine(hy - 0.012, dash) + stitchLine(hy - 0.0185, dash)) * fabFade(240.0);
    fabH += 0.0003 * hemSt;
    c = mix(c, c * 1.15 + 0.03, hemSt * 0.6);`;
    if (shortSleeve) {
      s += `
    // Kol ağzı dikişi
    float slEnd = uMax.x - axm;
    float slSt = sleeve * (stitchLine(slEnd - 0.012, (vBind.y + vBind.z) * 240.0) + stitchLine(slEnd - 0.0185, (vBind.y + vBind.z) * 240.0)) * fabFade(240.0);
    fabH += 0.0003 * slSt;
    c = mix(c, c * 1.15 + 0.03, slSt * 0.6);
    // Kolda hafif çekme kırışığı
    fabH += 0.002 * sleeve * softFold((vBind.y + axm) * 22.0 + n1 * 1.4) * smoothstep(0.4, 0.7, n2);`;
    } else {
      s += `
    // Dirsekte halka kırışıklar, bilek üstünde yığılma
    float elbow = sleeve * (1.0 - smoothstep(0.03, 0.08, abs(axm - uJ.y)));
    fabH += 0.0045 * elbow * softFold(axm * 34.0 + n1 * 1.6);
    float stack = sleeve * (1.0 - smoothstep(0.02, 0.09, uJ.z - 0.06 - axm)) * step(axm, uJ.z);
    fabH += 0.0045 * stack * softFold(axm * 46.0 + n1 * 2.0);
    // Üst kolda uzun gevşek kıvrımlar
    fabH += 0.002 * sleeve * softFold((vBind.y * 0.7 + axm) * 12.0 + n1 * 2.0) * smoothstep(0.35, 0.7, n2);`;
    }
    if (ribTop) {
      s += `
    // Ribana: bel bandı, manşetler ve yaka (dikey ince fitiller)
    float ribW = torso * (1.0 - smoothstep(0.052, 0.058, hy));
    float ribC = sleeve * (1.0 - smoothstep(0.06, 0.066, uMax.x - axm));
    float ribN = (1.0 - smoothstep(0.022, 0.028, ty)) * torso;
    float rf = fabFade(330.0);
    fabH += 0.0007 * rf * (ribW * softFold((vBind.x + vBind.z) * 165.0) + ribC * softFold((vBind.y + vBind.z) * 165.0) + ribN * softFold((vBind.x + vBind.z) * 165.0));
    float ribAny = max(max(ribW, ribC), ribN);
    c *= 1.0 - 0.07 * ribAny;
    // Ribana dikişi (bandın üstünde)
    fabH -= 0.0008 * torso * seamLine(hy - 0.056, 0.0018);
    fabH -= 0.0008 * sleeve * seamLine(uMax.x - axm - 0.064, 0.0018);`;
    }
  }

  // ---------- Kapüşon: ortada dikiş, ağız kenarında katlanmış iç yüz ----------
  if (id === "hood") {
    s += `
    float cs = seamLine(vBind.x, 0.0035) * step(vBindN.z, -0.2);
    fabH -= 0.0012 * cs;
    c *= 1.0 - 0.12 * cs;
    float lip = 1.0 - smoothstep(0.012, 0.03, ty);
    c *= 1.0 - 0.18 * lip;
    fabH += 0.0015 * lip * softFold(ty * 30.0);`;
  }

  // ---------- Altlar ----------
  if (role === "bottom") {
    const long = LONG_BOTTOM.has(key);
    s += `
    // Lastikli bel: üstte 3,5 cm büzgü
    float wb = 1.0 - smoothstep(0.034, 0.04, ty);
    fabH += 0.0012 * wb * softFold((vBind.x + vBind.z) * 70.0 + fitNoise(vBind * 30.0) * 1.2) * fabFade(140.0);
    fabH -= 0.0008 * seamLine(ty - 0.038, 0.0016);
    c *= 1.0 - 0.06 * wb;
    // Kasıkta çapraz çekme
    float crotch = smoothstep(uL.x - 0.16, uL.x - 0.04, vBind.y) * (1.0 - smoothstep(0.02, 0.11, axm)) * (1.0 - wb);
    fabH += 0.0028 * crotch * softFold((vBind.y + axm * 1.3) * 18.0 + n1);
    // Yan ve iç bacak dikişi
    float sideS = seamLine(vBindN.z, 0.05) * step(0.5, abs(vBindN.x)) * (1.0 - wb);
    fabH -= 0.0011 * sideS;
    c *= 1.0 - 0.08 * sideS;
    // Paça dikişi
    float pd = (vBind.x + vBind.z) * 240.0;
    float legSt = (stitchLine(hy - 0.014, pd) + stitchLine(hy - 0.02, pd)) * fabFade(240.0);
    fabH += 0.0003 * legSt;
    c = mix(c, c * 1.15 + 0.03, legSt * 0.55);`;
    if (long) {
      s += `
    // Dizde halka kırışık, bilek üstünde yığılma
    float knee = 1.0 - smoothstep(0.03, 0.09, abs(vBind.y - uL.y));
    fabH += 0.0042 * knee * softFold(vBind.y * 30.0 + n1 * 1.5);
    float ank = (1.0 - smoothstep(0.04, 0.16, vBind.y - uL.z)) * step(0.0, vBind.y - uL.z + 0.02);
    fabH += 0.0055 * ank * softFold(vBind.y * 24.0 + n1 * 2.2);
    // Uyluk ve baldırda uzun dikey kıvrımlar
    fabH += 0.0018 * softFold((vBind.x + vBind.z) * 9.0 + vBind.y * 3.0 + n1 * 2.0) * smoothstep(0.4, 0.7, n2) * (1.0 - wb);`;
    } else {
      s += `
    // Şortta paçaya doğru yumuşak dalga
    float hemB = 1.0 - smoothstep(0.0, 0.12, hy);
    fabH += 0.004 * hemB * softFold((vBind.x + vBind.z) * 8.0 + n1 * 1.5);`;
    }
  }

  // ---------- Çorap ----------
  if (role === "sock") {
    s += `
    fabH += 0.0006 * softFold((vBind.x + vBind.z) * 160.0) * fabFade(320.0) * (1.0 - smoothstep(0.03, 0.035, ty));
    fabH += 0.0035 * softFold(vBind.y * 34.0 + n1 * 2.0) * smoothstep(0.03, 0.05, ty) * (1.0 - smoothstep(0.05, 0.09, hy));`;
  }

  // ---------- Ayakkabı (vBind.y zeminden metre) ----------
  if (role === "shoe") {
    s += `
    float soleH = ${key === "s-court" || key === "s-leather" ? "0.035" : "0.03"};
    // Taban altı diş deseni, yan yüzde orta taban çizgileri
    float under = step(vBindN.y, -0.6);
    fabH -= 0.0016 * under * step(0.5, fract(vBind.z * 55.0 + 0.5 * step(0.5, fract(vBind.x * 30.0))));
    float mid = (1.0 - step(soleH, vBind.y)) * (1.0 - under);
    fabH += 0.0006 * mid * softFold(vBind.y * 140.0) * fabFade(140.0);
    // Taban-üst birleşim dikişi
    fabH -= 0.001 * seamLine(vBind.y - soleH, 0.0018);
    float upper = step(soleH, vBind.y);
    // Bağcık yuvaları (üstte, önde) ve bağcık kabartması
    float laceZone = step(0.6, vBindN.y) * step(0.055, vBind.y) * upper;
    fabH += 0.0012 * laceZone * softFold(vBind.z * 55.0);
    // Burun kapağı ve topuk dikişi
    fabH -= 0.0008 * upper * seamLine(vBindN.z - 0.75, 0.04);
    fabH -= 0.0008 * upper * seamLine(vBindN.z + 0.8, 0.04);`;
    if (fab === "runner") {
      s += `
    // Örgü/file üst: burunda nefes delikleri
    vec2 rq = vec2(vBind.x + vBind.y, vBind.z) * 300.0;
    float rh = 1.0 - smoothstep(0.15, 0.27, length(fract(rq) - 0.5));
    float toe = smoothstep(0.4, 0.8, vBindN.z) * upper * (1.0 - laceZone);
    fabH -= 0.0004 * rh * toe * fabFade(300.0);
    c *= 1.0 - 0.15 * rh * toe * fabFade(300.0);`;
    } else {
      s += `
    // Deri: burunda esneme kırışıkları, delikli burun
    float flex = upper * (1.0 - smoothstep(0.02, 0.05, abs(vBindN.z - 0.35)));
    fabH += 0.0018 * flex * softFold(vBind.y * 60.0 + n1);
    vec2 pq = vec2(vBind.x, vBind.y) * 260.0;
    float perf = (1.0 - smoothstep(0.12, 0.2, length(fract(pq) - 0.5))) * smoothstep(0.75, 0.9, vBindN.z) * upper;
    fabH -= 0.0004 * perf * fabFade(260.0);
    c *= 1.0 - 0.3 * perf * fabFade(260.0);`;
    }
  }

  return s;
}
