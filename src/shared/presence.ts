/**
 * Çevrimiçi oyuncular ve davet protokolü (tek global Presence nesnesi).
 * Durum: menu (ana ekran, gardırop), practice (botla), queue (hızlı maç arıyor), room (oda lobisi), match (maçta).
 * Yalnızca menu/practice durumundaki oyuncular davet alabilir.
 */
export type PresenceStatus = "menu" | "practice" | "queue" | "room" | "match";

export const INVITE_TTL_MS = 60_000;
export const INVITABLE: PresenceStatus[] = ["menu", "practice"];

export interface PresencePlayer {
  /** oyuncu kimliği */
  id: string;
  /** ad */
  n: string;
  /** seviye */
  l: number;
  /** durum */
  s: PresenceStatus;
}

export type PresenceClientMsg =
  | { t: "me"; n: string; l: number; s: PresenceStatus }
  | { t: "inv"; to: string }
  | { t: "ans"; id: string; ok: boolean }
  | { t: "cancel"; id: string };

export type InviteEnd = "declined" | "busy" | "gone" | "expired" | "cancelled";

export type PresenceServerMsg =
  | { t: "list"; total: number; p: PresencePlayer[] }
  | { t: "inv"; id: string; from: PresencePlayer; exp: number }
  | { t: "sent"; id: string; to: string; exp: number }
  | { t: "go"; id: string; code: string; with: string }
  | { t: "end"; id: string; why: InviteEnd }
  | { t: "err"; m: string };

export function isStatus(s: unknown): s is PresenceStatus {
  return s === "menu" || s === "practice" || s === "queue" || s === "room" || s === "match";
}
