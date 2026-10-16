/**
 * Gardırop v2. Kıyafet 7 karakterlik bir dizgeyle taşınır:
 * [karakter, saç, baş, üst, alt, ayakkabı, takı]; her karakter o bölgedeki parçanın sırası (0-9).
 * Ör. "1032210". Sunucu yalnızca doğrular; görünüm istemcidedir.
 *
 * Her parça modeldeki bir giysi parçasına (mesh) ve bir desene bağlanır.
 */
export type Region = "body" | "hair" | "head" | "top" | "bottom" | "shoes" | "acc";

export interface OutfitItem {
  id: string;
  name: string;
  desc: string;
  /** Kartta gösterilen renk örneği (CSS background) */
  swatch: string;
  /** Açılması için gereken oyuncu seviyesi (yoksa baştan açık) */
  lvl?: number;
  /** Modelde gösterilecek giysi parçaları (G_<ad>) */
  mesh?: string[];
  /** Desen anahtarı (athlete.ts) */
  look?: string;
  /** Sadece bu karakterde (f: kadın, m: erkek) */
  only?: "f" | "m";
}

const T = "#ff3b2f"; // örneklerde takım rengi
const D = "#b0201a";

export const REGIONS: { id: Region; label: string; items: OutfitItem[] }[] = [
  {
    id: "body",
    label: "Karakter",
    items: [
      { id: "f", name: "Kadın sporcu", desc: "1,66 m, çevik ve kaslı", swatch: "linear-gradient(135deg,#c58c6d,#9b6448)" },
      { id: "m", name: "Erkek sporcu", desc: "1,80 m, güçlü ve hızlı", swatch: "linear-gradient(135deg,#c08566,#8a5a40)" },
    ],
  },
  {
    id: "hair",
    label: "Saç",
    items: [
      { id: "natural", name: "Doğal", desc: "Kadında at kuyruğu, erkekte kısa kesim", swatch: "radial-gradient(circle at 60% 60%,#2a1a10 0 45%,transparent 46%),#e8d5c4", mesh: [] },
      { id: "short", name: "Kısa kesim", desc: "Yanlar kısa, üst dolgun", swatch: "radial-gradient(circle at 50% 70%,#2a1a10 0 55%,transparent 56%),#e8d5c4", mesh: ["hair_short"] },
      { id: "pony", name: "At kuyruğu", desc: "Toplanmış uzun saç", swatch: "radial-gradient(circle at 70% 70%,#3a2412 0 30%,transparent 31%),radial-gradient(circle at 45% 45%,#3a2412 0 40%,transparent 41%),#e8d5c4", mesh: ["hair_long", "ponytail"] },
      { id: "long", name: "Toplu saç", desc: "At kuyruğu olmadan, dolgun", swatch: "radial-gradient(circle at 50% 55%,#3a2412 0 52%,transparent 53%),#e8d5c4", mesh: ["hair_long"] },
      { id: "blond", name: "Sarı at kuyruğu", desc: "Açık sarı, toplanmış", swatch: "radial-gradient(circle at 70% 70%,#d8b25e 0 30%,transparent 31%),radial-gradient(circle at 45% 45%,#d8b25e 0 40%,transparent 41%),#e8d5c4", mesh: ["hair_long", "ponytail"], look: "blond", lvl: 3 },
      { id: "buzz", name: "Sıfır numara", desc: "Kafaya yakın, temiz", swatch: "radial-gradient(circle at 50% 60%,#4a3426 0 50%,transparent 51%),#e8d5c4", mesh: ["hair_short"], look: "buzz" },
    ],
  },
  {
    id: "head",
    label: "Baş",
    items: [
      { id: "none", name: "Yok", desc: "Sade görünüm", swatch: "linear-gradient(135deg,#2a2a2d,#1a1a1c)" },
      { id: "cap", name: "Snapback kep", desc: "Düz siperlik, takım renginde", swatch: `linear-gradient(135deg,${T} 0 60%,#15171d 60%)` },
      { id: "backcap", name: "Ters kep", desc: "Siperlik arkada, sokak stili", swatch: `linear-gradient(315deg,${T} 0 60%,#f5f5f5 60%)` },
      { id: "beanie", name: "Bere", desc: "Kalın örgü, ponponlu", swatch: "repeating-linear-gradient(90deg,#2b2f3a 0 5px,#3a404e 5px 8px)", lvl: 3 },
      { id: "visor", name: "Güneş vizörü", desc: "Açık tepe, uzun siperlik", swatch: "linear-gradient(180deg,#f5f5f5 0 35%,#18c8ff 35%)", lvl: 5 },
      { id: "band", name: "Ter bandı", desc: "Beyaz, ortada renkli şerit", swatch: `linear-gradient(180deg,#f4f6fa 0 38%,${T} 38% 62%,#f4f6fa 62%)`, lvl: 2 },
    ],
  },
  {
    id: "top",
    label: "Üst",
    items: [
      { id: "tee", name: "Basic tişört", desc: "Düz renk, yuvarlak yaka", swatch: `linear-gradient(180deg,${T},${D})`, mesh: ["tee"], look: "plain" },
      { id: "jersey", name: "Maç forması", desc: "Beyaz yan paneller, sırt numarası", swatch: `linear-gradient(90deg,#f2f2f2 0 18%,${T} 18% 82%,#f2f2f2 82%)`, mesh: ["tee"], look: "jersey" },
      { id: "tank", name: "Askılı atlet", desc: "Kolsuz, derin kol oyuğu", swatch: `linear-gradient(90deg,transparent 0 20%,${T} 20% 80%,transparent 80%),#e8d5c4`, mesh: ["tank"], look: "plain" },
      { id: "sweat", name: "Sweatshirt", desc: "Ribanalı yaka, bilek ve etek", swatch: "linear-gradient(180deg,#9aa3b5,#6f7789)", mesh: ["sweat"], look: "sweat" },
      { id: "hoodie", name: "Kapüşonlu", desc: "Sırtta kapüşon, kanguru cep", swatch: `linear-gradient(180deg,${T} 0 70%,${D} 70%)`, mesh: ["hoodie", "hood"], look: "hoodie" },
      { id: "sweater", name: "Örgü kazak", desc: "Balıkçı yaka, saç örgü deseni", swatch: "repeating-linear-gradient(90deg,#e7dcc8 0 6px,#d3c6ad 6px 9px)", mesh: ["sweater"], look: "knit", lvl: 2 },
      { id: "stripe", name: "Çizgili tişört", desc: "Yatay şeritler, retro", swatch: `repeating-linear-gradient(180deg,${T} 0 7px,#f5f5f5 7px 12px)`, mesh: ["tee"], look: "stripe", lvl: 3 },
      { id: "varsity", name: "Kolej sweat", desc: "Gövde takım rengi, beyaz kollar", swatch: `linear-gradient(90deg,#f5f5f5 0 22%,${T} 22% 78%,#f5f5f5 78%)`, mesh: ["sweat"], look: "varsity", lvl: 4 },
      { id: "bra", name: "Spor sütyeni", desc: "Sadece sütyen, yaz antrenmanı", swatch: `linear-gradient(180deg,#e8d5c4 0 30%,${T} 30% 60%,#e8d5c4 60%)`, mesh: [], look: "bra", only: "f" },
      { id: "camo", name: "Kamuflaj kapüşonlu", desc: "Takım tonlarında kamuflaj", swatch: `radial-gradient(circle at 30% 30%,#3a1412 0 22%,transparent 23%),radial-gradient(circle at 70% 65%,#7a2620 0 26%,transparent 27%),${T}`, mesh: ["hoodie", "hood"], look: "camo", lvl: 6 },
    ],
  },
  {
    id: "bottom",
    label: "Alt",
    items: [
      { id: "shorts", name: "Koşu şortu", desc: "Diz üstü, yan yırtmaçlı", swatch: "linear-gradient(180deg,#1d2b55,#14204a)", mesh: ["shorts"], look: "plain" },
      { id: "joggers", name: "Jogger", desc: "Bilekte lastikli, rahat", swatch: "linear-gradient(180deg,#55606e,#3f4752)", mesh: ["joggers"], look: "joggers" },
      { id: "leggings", name: "Tayt", desc: "Bileğe kadar, sıkı", swatch: "linear-gradient(180deg,#1f2233,#14161f)", mesh: ["leggings"], look: "tight" },
      { id: "bball", name: "Basketbol şortu", desc: "Dize kadar, bol, yan şerit", swatch: "linear-gradient(90deg,#ffd400 0 40%,#fff 40% 48%,#ffd400 48%)", mesh: ["bball"], look: "bball" },
      { id: "bike", name: "Bisiklet taytı", desc: "Diz üstü, sıkı", swatch: "linear-gradient(180deg,#111,#222)", mesh: ["bike"], look: "tight", lvl: 2 },
      { id: "track", name: "Üç şeritli eşofman", desc: "Yanlarda beyaz şeritler", swatch: "linear-gradient(90deg,#1f5bff 0 18%,#fff 18% 22%,#1f5bff 22% 26%,#fff 26% 30%,#1f5bff 30% 34%,#fff 34% 38%,#1f5bff 38%)", mesh: ["track"], look: "track", lvl: 3 },
      { id: "cargo", name: "Kamuflaj jogger", desc: "Haki-yeşil arazi deseni", swatch: "radial-gradient(circle at 30% 35%,#3d4a2a 0 22%,transparent 23%),radial-gradient(circle at 70% 70%,#6b5a3a 0 25%,transparent 26%),#55663a", mesh: ["joggers"], look: "cargo", lvl: 4 },
      { id: "neon", name: "Neon biyeli tayt", desc: "Karanlıkta parlayan yan şerit", swatch: "linear-gradient(90deg,#14161c 0 40%,#2bffd5 40% 52%,#14161c 52%)", mesh: ["leggings"], look: "neon", lvl: 6 },
    ],
  },
  {
    id: "shoes",
    label: "Ayakkabı",
    items: [
      { id: "white", name: "Beyaz sneaker", desc: "Bembeyaz, takım renginde taban", swatch: `linear-gradient(180deg,#f5f5f5 0 72%,${T} 72%)`, mesh: ["runner", "socks"], look: "white" },
      { id: "neon", name: "Neon koşu", desc: "Fosforlu yeşil, beyaz taban", swatch: "linear-gradient(180deg,#c6ff28 0 72%,#f5f5f5 72%)", mesh: ["runner", "socks"], look: "neon" },
      { id: "court", name: "Basket botu", desc: "Bileği saran, takım renginde", swatch: `linear-gradient(180deg,${T} 0 72%,#f5f5f5 72%)`, mesh: ["hightop"], look: "court" },
      { id: "gold", name: "Siyah altın", desc: "Gece siyahı, altın taban", swatch: "linear-gradient(180deg,#121318 0 72%,#e6b84a 72%)", mesh: ["runner", "socks"], look: "gold", lvl: 5 },
      { id: "rainbow", name: "Gökkuşağı", desc: "Baştan sona renk geçişi", swatch: "linear-gradient(90deg,#ff3d5a,#ffb23d,#e9ff3d,#3dff8a,#3dc6ff,#9a5cff)", mesh: ["runner", "socks"], look: "rainbow", lvl: 7 },
      { id: "lava", name: "Lav bot", desc: "Kırmızı-turuncu alev, siyah taban", swatch: "linear-gradient(180deg,#ffb020,#ff3b1f 60%,#121318 72%)", mesh: ["hightop"], look: "lava", lvl: 9 },
    ],
  },
  {
    id: "acc",
    label: "Takı",
    items: [
      { id: "none", name: "Yok", desc: "Sade görünüm", swatch: "linear-gradient(135deg,#2a2a2d,#1a1a1c)" },
      { id: "wrist", name: "Bileklik", desc: "İki bilekte havlu bileklik", swatch: `linear-gradient(90deg,#f4f6fa 0 30%,${T} 30% 70%,#f4f6fa 70%)` },
      { id: "chain", name: "Altın zincir", desc: "Boyunda kalın zincir", swatch: "repeating-linear-gradient(45deg,#f6d36b 0 4px,#b8892c 4px 8px)", lvl: 6 },
      { id: "captain", name: "Kaptan bandı", desc: "Kolda sarı kaptanlık bandı", swatch: "linear-gradient(180deg,#2a2a2d 0 35%,#ffd400 35% 65%,#2a2a2d 65%)", lvl: 4 },
    ],
  },
];

const N = REGIONS.length;
export const DEFAULT_FIT = "0000000";

/** Eski (4-5 haneli) kayıtlar varsayılana döner. */
export function cleanFit(v: string | null | undefined): string {
  const s = v && /^[0-9]{7}$/.test(v) ? v : DEFAULT_FIT;
  const sex = s[0] === "1" ? "m" : "f";
  return REGIONS.map((r, i) => {
    let n = Math.min(Number(s[i]), r.items.length - 1);
    const it = r.items[n];
    if (it.only && it.only !== sex) n = 0;
    return String(n);
  }).join("");
}

export function fitIndex(fit: string, region: Region): number {
  const i = REGIONS.findIndex((r) => r.id === region);
  return Number(cleanFit(fit)[i]);
}

export function fitItem(fit: string, region: Region): OutfitItem {
  const r = REGIONS.find((x) => x.id === region)!;
  return r.items[fitIndex(fit, region)];
}

export function fitSex(fit: string): "f" | "m" {
  return fitItem(fit, "body").id === "m" ? "m" : "f";
}

export function withItem(fit: string, region: Region, item: number): string {
  const i = REGIONS.findIndex((r) => r.id === region);
  const a = cleanFit(fit).split("");
  a[i] = String(item);
  return cleanFit(a.join(""));
}

/** Bu karakterde seçilebilir parçalar (only alanına göre). */
export function itemsFor(region: Region, sex: "f" | "m") {
  const r = REGIONS.find((x) => x.id === region)!;
  return r.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.only || it.only === sex);
}

void N;
