/**
 * Gardırop. Kıyafet 5 karakterlik bir dizgeyle taşınır: [baş, üst, alt, ayakkabı, aksesuar],
 * her karakter o bölgedeki parçanın sırası (0-9). Ör. "02130". Sunucu yalnızca doğrular; görünüm istemcidedir.
 */
export type Region = "head" | "top" | "bottom" | "shoes" | "acc";

export interface OutfitItem {
  id: string;
  name: string;
  desc: string;
  /** Kartta gösterilen renk örneği (CSS background) */
  swatch: string;
  /** Açılması için gereken oyuncu seviyesi (yoksa baştan açık) */
  lvl?: number;
}

const T = "#ff5a4f"; // örneklerde takım rengi (kırmızı)

export const REGIONS: { id: Region; label: string; items: OutfitItem[] }[] = [
  {
    id: "head",
    label: "Baş",
    items: [
      { id: "cap", name: "Snapback Kep", desc: "Düz siperlik, takım renginde", swatch: `linear-gradient(135deg,${T} 0 60%,#15171d 60%)` },
      { id: "backcap", name: "Ters Kep", desc: "Siperlik arkada, sokak stili", swatch: `linear-gradient(315deg,${T} 0 60%,#f5f5f5 60%)` },
      { lvl: 3, id: "beanie", name: "Bere", desc: "Kalın örgü, katlanmış kenar", swatch: "repeating-linear-gradient(90deg,#2b2f3a 0 5px,#3a404e 5px 8px)" },
      { lvl: 5, id: "visor", name: "Güneş Vizörü", desc: "Açık tepe, uzun siperlik", swatch: "linear-gradient(180deg,#f5f5f5 0 35%,#18c8ff 35%)" },
      { lvl: 2, id: "band", name: "Ter Bandı", desc: "Beyaz, ortada renkli şerit", swatch: `linear-gradient(180deg,#f4f6fa 0 38%,${T} 38% 62%,#f4f6fa 62%)` },
    ],
  },
  {
    id: "top",
    label: "Üst",
    items: [
      { id: "pro", name: "Pro Forma", desc: "Beyaz yan paneller, yaka şeridi", swatch: `linear-gradient(90deg,#f2f2f2 0 18%,${T} 18% 82%,#f2f2f2 82%)` },
      { id: "stripe", name: "Çizgili Forma", desc: "Yatay şeritli retro kesim", swatch: `repeating-linear-gradient(180deg,${T} 0 7px,#f5f5f5 7px 12px)` },
      { lvl: 2, id: "camo", name: "Kamuflaj", desc: "Takım tonlarında kamuflaj", swatch: `radial-gradient(circle at 30% 30%,#3a1412 0 22%,transparent 23%),radial-gradient(circle at 70% 65%,#7a2620 0 26%,transparent 27%),${T}` },
      { lvl: 4, id: "sunset", name: "Gün Batımı", desc: "Takım renginden turuncu-pembeye", swatch: `linear-gradient(180deg,#ff3d9a,#ffa63d 55%,${T})` },
      { lvl: 6, id: "bolt", name: "Şimşek", desc: "Göğüste sarı zikzak", swatch: `linear-gradient(160deg,${T} 0 40%,#ffd400 40% 52%,${T} 52%)` },
      { lvl: 8, id: "carbon", name: "Karbon Siyah", desc: "Mat siyah, renkli yaka", swatch: `linear-gradient(180deg,${T} 0 14%,#16181e 14%)` },
    ],
  },
  {
    id: "bottom",
    label: "Alt",
    items: [
      { id: "tights", name: "Antrenman Taytı", desc: "Düz renk, mat kumaş", swatch: "linear-gradient(180deg,#a8302a,#7c221e)" },
      { id: "tracks", name: "Üç Şeritli Eşofman", desc: "Yanlarda beyaz şeritler", swatch: "linear-gradient(90deg,#a8302a 0 18%,#fff 18% 22%,#a8302a 22% 26%,#fff 26% 30%,#a8302a 30% 34%,#fff 34% 38%,#a8302a 38%)" },
      { lvl: 3, id: "cargo", name: "Kamuflaj Kargo", desc: "Haki-yeşil arazi deseni", swatch: "radial-gradient(circle at 30% 35%,#3d4a2a 0 22%,transparent 23%),radial-gradient(circle at 70% 70%,#6b5a3a 0 25%,transparent 26%),#55663a" },
      { lvl: 6, id: "neon", name: "Neon Biyeli", desc: "Yanlarında parlayan neon şerit", swatch: "linear-gradient(90deg,#14161c 0 40%,#2bffd5 40% 52%,#14161c 52%)" },
      { lvl: 4, id: "split", name: "İki Renk", desc: "Bir bacak takım rengi, biri siyah", swatch: "linear-gradient(90deg,#a8302a 0 50%,#16181e 50%)" },
    ],
  },
  {
    id: "shoes",
    label: "Ayakkabı",
    items: [
      { id: "neon", name: "Neon Koşu", desc: "Fosforlu yeşil, beyaz taban", swatch: "linear-gradient(180deg,#c6ff28 0 72%,#f5f5f5 72%)" },
      { id: "white", name: "Beyaz Sneaker", desc: "Bembeyaz, takım renginde taban", swatch: `linear-gradient(180deg,#f5f5f5 0 72%,${T} 72%)` },
      { lvl: 5, id: "gold", name: "Siyah Altın", desc: "Gece siyahı, altın taban", swatch: "linear-gradient(180deg,#121318 0 72%,#e6b84a 72%)" },
      { lvl: 7, id: "rainbow", name: "Gökkuşağı", desc: "Baştan sona renk geçişi", swatch: "linear-gradient(90deg,#ff3d5a,#ffb23d,#e9ff3d,#3dff8a,#3dc6ff,#9a5cff)" },
      { lvl: 9, id: "lava", name: "Lav", desc: "Kırmızı-turuncu alev, siyah taban", swatch: "linear-gradient(180deg,#ffb020,#ff3b1f 60%,#121318 72%)" },
    ],
  },
  {
    id: "acc",
    label: "Takı",
    items: [
      { id: "none", name: "Yok", desc: "Sade görünüm", swatch: "linear-gradient(135deg,#1c2942,#121a2c)" },
      { id: "wrist", name: "Bileklik", desc: "İki bilekte havlu bileklik", swatch: `linear-gradient(90deg,#f4f6fa 0 30%,${T} 30% 70%,#f4f6fa 70%)` },
      { lvl: 2, id: "sleeve", name: "Kol Kılıfı", desc: "Omuzdan bileğe sıkı kılıf", swatch: "linear-gradient(180deg,#16181e,#2a2f3b)" },
      { lvl: 6, id: "chain", name: "Altın Zincir", desc: "Boyunda kalın zincir", swatch: "repeating-linear-gradient(45deg,#f6d36b 0 4px,#b8892c 4px 8px)" },
      { lvl: 4, id: "captain", name: "Kaptan Bandı", desc: "Kolda sarı kaptanlık bandı", swatch: "linear-gradient(180deg,#1c2942 0 35%,#ffd400 35% 65%,#1c2942 65%)" },
    ],
  },
];

export const DEFAULT_FIT = "00000";

export function cleanFit(v: string | null | undefined): string {
  const s = v && /^[0-9]{4,5}$/.test(v) ? v.padEnd(5, "0") : DEFAULT_FIT;
  return REGIONS.map((r, i) => String(Math.min(Number(s[i]), r.items.length - 1))).join("");
}

export function fitIndex(fit: string, region: Region): number {
  const i = REGIONS.findIndex((r) => r.id === region);
  return Number(cleanFit(fit)[i]);
}

export function fitItem(fit: string, region: Region): OutfitItem {
  const r = REGIONS.find((x) => x.id === region)!;
  return r.items[fitIndex(fit, region)];
}

export function withItem(fit: string, region: Region, item: number): string {
  const i = REGIONS.findIndex((r) => r.id === region);
  const a = cleanFit(fit).split("");
  a[i] = String(item);
  return cleanFit(a.join(""));
}
