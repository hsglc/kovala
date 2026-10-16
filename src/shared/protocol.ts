import type { PublicState } from "./engine";
import type { PlayerState } from "./sim";

// ---------- İstemci → Sunucu ----------
/** [seq, mx, my, tuşlar: bit0 parkur, bit1 rol aksiyonu] */
export type InputTuple = [number, number, number, number];

export type ClientMsg =
  | { t: "in"; v: number; i: InputTuple[] }
  | { t: "team" }
  | { t: "chases"; n: number }
  | { t: "layout"; id: string }
  | { t: "rest"; v: string }
  | { t: "start" }
  | { t: "pick"; id: string };

// ---------- Sunucu → İstemci ----------
/** [id, x, y, vx, vy, st, ak, at, dx, dy, cd, fx, fy, h, hv] */
export type PlayerTuple = [string, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

export type ServerMsg =
  | { t: "welcome"; you: string; code: string; k: number }
  | { t: "st"; k: number; s: PublicState }
  | { t: "s"; k: number; p: PlayerTuple[]; a: Record<string, number> }
  | { t: "err"; m: string };

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function packPlayer(id: string, p: PlayerState): PlayerTuple {
  return [id, r4(p.x), r4(p.y), r4(p.vx), r4(p.vy), r4(p.st), p.ak, r4(p.at), r4(p.dx), r4(p.dy), r4(p.cd), r4(p.fx), r4(p.fy), r4(p.h), r4(p.hv)];
}

export function unpackPlayer(t: PlayerTuple): { id: string; p: PlayerState } {
  return {
    id: t[0],
    p: { x: t[1], y: t[2], vx: t[3], vy: t[4], st: t[5], ak: t[6], at: t[7], dx: t[8], dy: t[9], cd: t[10], fx: t[11], fy: t[12], h: t[13] ?? 0, hv: t[14] ?? 0 },
  };
}

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const c of code) if (!ROOM_CODE_ALPHABET.includes(c)) return false;
  return true;
}

export function randomRoomCode(rnd: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[Math.floor(rnd() * ROOM_CODE_ALPHABET.length)];
  return s;
}

export function cleanName(name: string | null | undefined): string {
  const n = (name ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16);
  return n || "Oyuncu";
}

export function isValidPid(pid: string | null | undefined): pid is string {
  return !!pid && /^[a-zA-Z0-9_-]{8,40}$/.test(pid);
}
