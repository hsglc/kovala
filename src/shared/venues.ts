/** Mekânlar (sadece görünüm; fiziği etkilemez). */
export type VenueId = "arena" | "park" | "depo" | "cati";

export const VENUES: { id: VenueId; name: string; blurb: string }[] = [
  { id: "arena", name: "Gece arenası", blurb: "LED panolar, projektörler" },
  { id: "park", name: "Park", blurb: "Çim, ağaçlar, öğlen güneşi" },
  { id: "depo", name: "Eski depo", blurb: "Beton, paletler, sıcak lambalar" },
  { id: "cati", name: "Çatı katı", blurb: "Gün batımı, klima üniteleri" },
];

export function isVenue(v: string): v is VenueId {
  return VENUES.some((x) => x.id === v);
}
