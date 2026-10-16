import { ACT_CLIMB, ACT_DIVE, ACT_JUKE, ACT_KICK, ACT_KONG, ACT_SLIDE, ACT_VAULT } from "../../shared/sim";
import { getLayout } from "../../shared/maps";
import type { ChaseRecord, PublicState } from "../../shared/engine";

/**
 * İlerleme: XP, seviye, görevler. Bu cihazda saklanır (localStorage).
 * Seviye atladıkça gardırobun kilitli parçaları açılır.
 */

export interface Mission {
  id: string;
  text: string;
  goal: number;
  xp: number;
  /** Bu görevin saydığı olay */
  ev: EventKind;
}

type EventKind =
  | "evade"
  | "tag"
  | "chase"
  | "kick"
  | "climb"
  | "vault"
  | "slide"
  | "dive"
  | "juke"
  | "win"
  | "hardEvade"
  | "teamWin"
  | "fullHold";

export const MISSION_POOL: Mission[] = [
  { id: "ev3", text: "3 chase'te kaç", goal: 3, xp: 90, ev: "evade" },
  { id: "tag3", text: "3 kez yakala", goal: 3, xp: 90, ev: "tag" },
  { id: "kick5", text: "5 duvar sıçraması yap", goal: 5, xp: 70, ev: "kick" },
  { id: "climb3", text: "3 kez duvarın tepesine tırman", goal: 3, xp: 60, ev: "climb" },
  { id: "vault10", text: "10 engelin üstünden atla", goal: 10, xp: 60, ev: "vault" },
  { id: "slide4", text: "4 kez barın altından kay", goal: 4, xp: 60, ev: "slide" },
  { id: "dive3", text: "3 kez dalış yap", goal: 3, xp: 50, ev: "dive" },
  { id: "juke6", text: "6 kez sıçrayarak yön değiştir", goal: 6, xp: 50, ev: "juke" },
  { id: "win1", text: "Bir maç kazan", goal: 1, xp: 120, ev: "win" },
  { id: "hard1", text: "Zor bir sahada bir chase'te kaç", goal: 1, xp: 110, ev: "hardEvade" },
  { id: "team1", text: "3'e 3 takım maçı kazan", goal: 1, xp: 150, ev: "teamWin" },
  { id: "chase12", text: "12 chase oyna", goal: 12, xp: 80, ev: "chase" },
];

const KEY = "evade:progress";

interface Saved {
  xp: number;
  active: { id: string; n: number }[];
  done: number;
  stats: Record<string, number>;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Saved | null;
    if (s && typeof s.xp === "number" && Array.isArray(s.active)) return { ...s, stats: s.stats ?? {} };
  } catch {}
  return { xp: 0, active: [], done: 0, stats: {} };
}

let data = load();
fillMissions();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

function fillMissions() {
  const have = new Set(data.active.map((a) => a.id));
  data.active = data.active.filter((a) => MISSION_POOL.some((m) => m.id === a.id));
  while (data.active.length < 3) {
    const free = MISSION_POOL.filter((m) => !have.has(m.id));
    const m = free[Math.floor(Math.random() * free.length)];
    if (!m) break;
    have.add(m.id);
    data.active.push({ id: m.id, n: 0 });
  }
}

/** Seviye n'den n+1'e geçmek için gereken XP. */
export function xpForLevel(level: number) {
  return 100 + (level - 1) * 60;
}

export function levelInfo(xp = data.xp) {
  let level = 1;
  let rest = xp;
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  return { level, into: rest, need: xpForLevel(level) };
}

export function getProgress() {
  return {
    xp: data.xp,
    ...levelInfo(),
    done: data.done,
    stats: data.stats,
    missions: data.active.map((a) => ({ ...MISSION_POOL.find((m) => m.id === a.id)!, n: a.n })),
  };
}

export type Notice = { kind: "xp"; xp: number; why: string } | { kind: "mission"; text: string; xp: number } | { kind: "level"; level: number };

const listeners = new Set<(n: Notice) => void>();
export function onProgress(fn: (n: Notice) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function notify(n: Notice) {
  listeners.forEach((f) => f(n));
}

function addXp(xp: number, why: string) {
  const before = levelInfo().level;
  data.xp += xp;
  notify({ kind: "xp", xp, why });
  const after = levelInfo().level;
  if (after > before) notify({ kind: "level", level: after });
}

function bump(ev: EventKind, by = 1) {
  data.stats[ev] = (data.stats[ev] ?? 0) + by;
  for (const a of [...data.active]) {
    const m = MISSION_POOL.find((x) => x.id === a.id)!;
    if (m.ev !== ev) continue;
    a.n = Math.min(m.goal, a.n + by);
    if (a.n >= m.goal) {
      data.active = data.active.filter((x) => x !== a);
      data.done++;
      notify({ kind: "mission", text: m.text, xp: m.xp });
      addXp(m.xp, "Görev");
      fillMissions();
    }
  }
}

const MOVE_EVENT: Record<number, EventKind> = {
  [ACT_KICK]: "kick",
  [ACT_CLIMB]: "climb",
  [ACT_VAULT]: "vault",
  [ACT_KONG]: "vault",
  [ACT_SLIDE]: "slide",
  [ACT_DIVE]: "dive",
  [ACT_JUKE]: "juke",
};

/** Kendi oyuncunun bir hamleye başladığını bildirir. */
export function recordMove(ak: number) {
  const ev = MOVE_EVENT[ak];
  if (!ev) return;
  bump(ev);
  save();
}

/** Bir chase bittiğinde (kendi oynadığın chase'ler). */
export function recordChase(r: ChaseRecord, me: string, layoutId: string) {
  if (r.chaser !== me && r.evader !== me) return;
  if (r.reason === "forfeit") return;
  bump("chase");
  addXp(10, "Chase");
  if (r.evader === me && r.winner === "evader") {
    addXp(30, "Kaçış");
    bump("evade");
    if (r.ticks >= 600) bump("fullHold");
    if (getLayout(layoutId).level === 3) bump("hardEvade");
  }
  if (r.chaser === me && r.winner === "chaser" && r.reason === "tag") {
    addXp(25, "Yakalama");
    bump("tag");
  }
  save();
}

/** Maç bittiğinde. */
export function recordMatch(s: PublicState, me: string) {
  const team = s.members.find((m) => m.id === me)?.team;
  if (team === undefined || s.winner === null) return;
  if (s.winner === team) {
    addXp(50, "Galibiyet");
    bump("win");
    if (s.members.filter((m) => m.team === team).length >= 3) bump("teamWin");
  } else {
    addXp(15, "Maç");
  }
  save();
}
