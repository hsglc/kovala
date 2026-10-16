/**
 * Gardırop: her bölgede iki parça. Kıyafet 4 haneli bir dizgeyle taşınır: [baş, üst, alt, ayakkabı].
 * Ör. "0101". Sunucu yalnızca doğrular; görünüm istemcidedir.
 */
export type Region = "head" | "top" | "bottom" | "shoes";

export interface OutfitItem {
  name: string;
  desc: string;
}

export const REGIONS: { id: Region; label: string; items: [OutfitItem, OutfitItem] }[] = [
  {
    id: "head",
    label: "Baş",
    items: [
      { name: "Snapback Kep", desc: "Düz siperlikli, takım renginde" },
      { name: "Ter Bandı", desc: "Beyaz, alında şeritli" },
    ],
  },
  {
    id: "top",
    label: "Üst",
    items: [
      { name: "Pro Forma", desc: "Beyaz yan paneller, yaka şeridi" },
      { name: "Çizgili Forma", desc: "Yatay şeritli retro kesim" },
    ],
  },
  {
    id: "bottom",
    label: "Alt",
    items: [
      { name: "Antrenman Taytı", desc: "Düz renk, mat kumaş" },
      { name: "Üç Şeritli Eşofman", desc: "Yanlarda beyaz şeritler" },
    ],
  },
  {
    id: "shoes",
    label: "Ayakkabı",
    items: [
      { name: "Neon Koşu", desc: "Fosforlu yeşil, beyaz taban" },
      { name: "Beyaz Sneaker", desc: "Bembeyaz, takım renginde taban" },
    ],
  },
];

export const DEFAULT_FIT = "0000";

export function cleanFit(v: string | null | undefined): string {
  return v && /^[01]{4}$/.test(v) ? v : DEFAULT_FIT;
}

export function fitIndex(fit: string, region: Region): 0 | 1 {
  const i = REGIONS.findIndex((r) => r.id === region);
  return fit[i] === "1" ? 1 : 0;
}

export function withItem(fit: string, region: Region, item: 0 | 1): string {
  const i = REGIONS.findIndex((r) => r.id === region);
  const a = cleanFit(fit).split("");
  a[i] = String(item);
  return a.join("");
}
